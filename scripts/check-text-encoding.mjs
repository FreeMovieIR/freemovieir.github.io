import { readdir, readFile, stat } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));

const textFilePattern = /\.(html|css|js|mjs|json|xml|txt|webmanifest|md)$/i;
const defaultExcludedDirs = new Set([
    ".git",
    ".agents",
    ".firebase",
    ".media-gateway-output",
    "node_modules",
    "artifacts",
    "playwright-report",
    "test-results",
    "coverage",
    "_site"
]);

const sourceExcludedDirs = new Set([
    ...defaultExcludedDirs,
    "dist",
    "tests"
]);

const distExcludedDirs = new Set([
    ...defaultExcludedDirs
]);

const mojibakePatterns = [
    [new RegExp("[\\u00d8\\u00d9\\u00db][\\u0080-\\u00ff\\u0152\\u0153\\u0160\\u0161\\u0178\\u2018-\\u2026\\u2030\\u2039\\u203a\\u20ac\\u2122]?", "u"), "Persian UTF-8 decoded as Windows-1252"],
    [new RegExp("[\\u00c3\\u00c2][\\u0080-\\u00bf\\u00a0-\\u00ff]", "u"), "double-encoded UTF-8 marker"],
    [new RegExp("[\\u00e2][\\u0080-\\u00bf\\u0152\\u0153\\u0160\\u0161\\u0178\\u2018-\\u2026\\u2030\\u2039\\u203a\\u20ac\\u2122]", "u"), "UTF-8 punctuation decoded as Windows-1252"],
    [new RegExp("[\\u00f0][\\u0080-\\u00bf\\u0152\\u0153\\u0160\\u0161\\u0178\\u2018-\\u2026\\u2030\\u2039\\u203a\\u20ac\\u2122]", "u"), "emoji UTF-8 decoded as Windows-1252"],
    [/\u00ef\u00bb\u00bf/u, "UTF-8 BOM decoded as Windows-1252"]
];

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("check-text-encoding.mjs")) {
    await main();
}

export async function main() {
    const scans = getRequestedScans(args);
    let failures = 0;
    for (const scan of scans) {
        const result = await scanTextEncoding(scan.root, scan);
        printResult(result);
        failures += result.invalidUtf8.length + result.mojibake.length + result.charsetFailures.length;
    }
    if (failures > 0) {
        throw new Error(`Text encoding audit failed with ${failures} issue(s).`);
    }
}

export async function scanTextEncoding(rootDir, options = {}) {
    const root = resolve(scriptRoot, rootDir);
    const excludedDirs = options.kind === "source" ? sourceExcludedDirs : distExcludedDirs;
    const files = await listTextFiles(root, { excludedDirs });
    const invalidUtf8 = [];
    const mojibake = [];
    const charsetFailures = [];

    for (const filePath of files) {
        const buffer = await readFile(filePath);
        const utf8 = validateUtf8Buffer(buffer);
        const rel = normalizePath(relative(root, filePath));
        if (!utf8.valid) {
            invalidUtf8.push({ path: rel, message: utf8.message });
            continue;
        }
        const text = utf8.text;
        const hits = findMojibakeMarkers(text);
        for (const hit of hits) mojibake.push({ path: rel, ...hit });
        if (/\.html$/i.test(filePath) && !isGoogleVerificationFile(text)) {
            const charset = auditHtmlCharset(text);
            if (!charset.valid) charsetFailures.push({ path: rel, message: charset.message });
        }
    }

    return {
        root,
        kind: options.kind || "dist",
        filesScanned: files.length,
        invalidUtf8,
        mojibake,
        charsetFailures
    };
}

function isGoogleVerificationFile(text) {
    return /^google-site-verification:\s*google[a-z0-9]+\.html\s*$/i.test(text.trim());
}

export function validateUtf8Buffer(buffer) {
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        return { valid: true, text };
    } catch (error) {
        return { valid: false, message: error instanceof Error ? error.message : "Invalid UTF-8 data" };
    }
}

export function findMojibakeMarkers(text) {
    const hits = [];
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        for (const [pattern, label] of mojibakePatterns) {
            if (pattern.test(line)) {
                hits.push({
                    line: index + 1,
                    label,
                    excerpt: safeExcerpt(line)
                });
                break;
            }
        }
    }
    return hits;
}

export function auditHtmlCharset(text) {
    const head = text.slice(0, 2048);
    const charsetMatches = [...head.matchAll(/charset\s*=\s*["']?\s*([^"'\s/>;]+)/gi)].map((match) => match[1].toLowerCase());
    if (!charsetMatches.length) return { valid: false, message: "HTML file is missing a UTF-8 charset declaration near the top." };
    const nonUtf8 = charsetMatches.find((value) => value !== "utf-8");
    if (nonUtf8) return { valid: false, message: `HTML file declares non-UTF-8 charset: ${nonUtf8}` };
    return { valid: true };
}

async function listTextFiles(root, options = {}) {
    const output = [];
    const excludedDirs = options.excludedDirs || defaultExcludedDirs;
    async function walk(dir) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (excludedDirs.has(entry.name)) continue;
                await walk(full);
                continue;
            }
            if (!textFilePattern.test(entry.name)) continue;
            output.push(full);
        }
    }
    await walk(root);
    return output;
}

function printResult(result) {
    console.log(`[encoding] ${result.kind}: scanned ${result.filesScanned} text files in ${normalizePath(relative(scriptRoot, result.root)) || "."}.`);
    for (const issue of result.invalidUtf8.slice(0, 40)) {
        console.error(`[encoding] invalid UTF-8: ${issue.path}: ${issue.message}`);
    }
    for (const issue of result.charsetFailures.slice(0, 40)) {
        console.error(`[encoding] charset: ${issue.path}: ${issue.message}`);
    }
    for (const issue of result.mojibake.slice(0, 80)) {
        console.error(`[encoding] mojibake: ${issue.path}:${issue.line}: ${issue.label}: ${issue.excerpt}`);
    }
    const remaining = result.invalidUtf8.length + result.charsetFailures.length + result.mojibake.length - 160;
    if (remaining > 0) console.error(`[encoding] ${remaining} additional issue(s) omitted.`);
}

function safeExcerpt(line) {
    return line.trim().replace(/\s+/g, " ").slice(0, 160);
}

function getRequestedScans(parsedArgs) {
    const scans = [];
    if (parsedArgs.source) scans.push({ root: parsedArgs.source, kind: "source" });
    if (parsedArgs.dist) scans.push({ root: parsedArgs.dist, kind: "dist" });
    if (parsedArgs.dir) scans.push({ root: parsedArgs.dir, kind: parsedArgs.kind || "dist" });
    if (!scans.length) scans.push({ root: "dist", kind: "dist" });
    return scans;
}

function parseArgs(argv) {
    const parsed = {};
    for (const arg of argv) {
        const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
        if (match) parsed[match[1]] = match[2] ?? true;
    }
    return parsed;
}

function normalizePath(path) {
    return path.split(sep).join("/");
}
