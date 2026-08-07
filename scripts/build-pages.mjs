import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, args.output || "dist");
const mode = args.mode || process.env.WATCH_PARTY_ENVIRONMENT || "production";
const buildId = args.buildId || process.env.GITHUB_SHA?.slice(0, 12) || String(Date.now());
const manifest = {
    buildId,
    mode,
    generatedAt: new Date().toISOString(),
    copiedFiles: 0,
    skippedCount: 0,
    topLevel: {}
};

const excludedNames = new Set([
    ".git",
    ".github",
    ".idea",
    ".vscode",
    ".firebase",
    ".media-gateway-output",
    "node_modules",
    "tests",
    "scripts",
    "firebase",
    "services",
    "test-assets",
    "artifacts",
    "playwright-report",
    "test-results",
    "coverage",
    "dist",
    "_site"
]);

const excludedFiles = new Set([
    ".firebaserc",
    ".gitignore",
    "firebase.json",
    "LICENSE",
    "README.md",
    "package.json",
    "package-lock.json",
    "playwright.config.js",
    "database-debug.log",
    "firebase-debug.log",
    "IMPROVEMENT_TASKS.md"
]);

const watchPartyExcluded = new Set([
    "LOCAL_TESTING.md",
    "PRODUCTION_SETUP.md",
    "README.md",
    "firebase-config.example.js",
    "firebase-config.js",
    "runtime-config.js",
    "runtime-config.template.js"
]);

const excludedExtensions = new Set([".bak", ".map", ".log"]);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await copyPublicTree(root, outDir);
await generateRuntimeConfig();
await transformWatchPartyArtifact();
await assertRequiredFiles();
await writeManifest();

console.log(`[pages:build] built ${relative(root, outDir)} with ${manifest.copiedFiles} files. Build ID: ${buildId}`);

async function copyPublicTree(sourceDir, targetDir) {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const source = join(sourceDir, entry.name);
        const rel = normalizePath(relative(root, source));
        if (!rel) continue;
        if (shouldExclude(rel, entry)) {
            manifest.skippedCount += 1;
            continue;
        }
        const target = join(targetDir, entry.name);
        if (entry.isDirectory()) {
            await mkdir(target, { recursive: true });
            await copyPublicTree(source, target);
            continue;
        }
        await mkdir(dirname(target), { recursive: true });
        await copyFile(source, target);
        manifest.copiedFiles += 1;
        const top = rel.split("/")[0];
        manifest.topLevel[top] = (manifest.topLevel[top] || 0) + 1;
    }
}

function shouldExclude(rel, entry) {
    const parts = rel.split("/");
    if (excludedNames.has(parts[0]) || parts.some((part) => excludedNames.has(part))) return true;
    if (!entry.isDirectory() && excludedFiles.has(basename(rel))) return true;
    if (!entry.isDirectory() && excludedExtensions.has(extname(rel).toLowerCase())) return true;
    if (parts[0] === "watch-party" && !entry.isDirectory() && watchPartyExcluded.has(basename(rel))) return true;
    return false;
}

async function generateRuntimeConfig() {
    const output = join(outDir, "watch-party", "runtime-config.js");
    const result = spawnSync(
        process.execPath,
        ["scripts/generate-watch-party-config.mjs", `--mode=${mode}`, `--output=${output}`],
        { cwd: root, stdio: "inherit", env: process.env }
    );
    if (result.status !== 0) throw new Error(`runtime config generation failed with exit code ${result.status}`);
}

async function transformWatchPartyArtifact() {
    const wpDir = join(outDir, "watch-party");
    const indexPath = join(wpDir, "index.html");
    let html = await readFile(indexPath, "utf8");
    html = html.replace(
        /(<link[^>]+href="style\.css)(")/,
        `$1?v=${buildId}$2`
    );
    html = html.replace(
        /(<script[^>]+src="\.?\/?js\/app\.js)(")/,
        `<script>window.wpBuildId=${JSON.stringify(buildId)};</script>\n    $1?v=${buildId}$2`
    );
    html = html
        .replace("سرویس تست لوکال اجرا نیست", "سرویس اتاق در دسترس نیست")
        .replace("برای ساخت یا ورود به اتاق، Firebase Emulator باید روی سیستم اجرا باشد.", "سرویس اتاق موقتاً در دسترس نیست. لطفاً چند لحظه دیگر دوباره تلاش کنید.")
        .replace(/<code id="service-command-hint"[\s\S]*?<\/code>/, '<code id="service-command-hint" class="command-hint" hidden></code>');
    await writeFile(indexPath, html, "utf8");

    const jsDir = join(wpDir, "js");
    await transformJsTree(jsDir);
    await writeFile(join(jsDir, "service-availability.js"), productionServiceAvailabilityModule(), "utf8");
}

async function transformJsTree(jsDir) {
    const entries = await readdir(jsDir, { withFileTypes: true });
    for (const entry of entries) {
        const file = join(jsDir, entry.name);
        if (entry.isDirectory()) {
            await transformJsTree(file);
            continue;
        }
        if (!entry.name.endsWith(".js")) continue;
        let text = await readFile(file, "utf8");
        text = text.replace(/from "(\.\/[^"]+\.js)"/g, `from "$1?v=${buildId}"`);
        text = text.replace(/from "(\.\.\/[^"]+\.js)"/g, `from "$1?v=${buildId}"`);
        if (entry.name === "app.js") {
            text = stripLocalTestHook(text);
        }
        text = hardenProductionOnlyText(text);
        await writeFile(file, text, "utf8");
    }
}

function stripLocalTestHook(text) {
    return text
        .replace(/installLocalTestHook\(\);\s*/, "")
        .replace(/function installLocalTestHook\(\) \{[\s\S]*?\n\}\n\nfunction getLocalTestControl\(\) \{[\s\S]*?\n\}/, "function getLocalTestControl() {\n    return {};\n}");
}

function hardenProductionOnlyText(text) {
    return text
        .replaceAll("localhost", "local-disabled")
        .replaceAll("127.0.0.1", "local-disabled")
        .replaceAll("[::1]", "local-disabled")
        .replaceAll("isLocalHostname", "isLocalDisabled")
        .replaceAll("isLocalPage", "isFallbackAllowed")
        .replaceAll("localPage", "fallbackAllowed")
        .replaceAll("localHost", "hostAllowsEmulator")
        .replaceAll("demo-freemovieir", "disabled-demo-project")
        .replaceAll("firebase-config.js", "local-config-disabled.js")
        .replaceAll("FIREBASE_APPCHECK_DEBUG_TOKEN", "APP_CHECK_DEBUG_DISABLED")
        .replaceAll("debugToken", "debugDisabled")
        .replaceAll("Firebase Emulator", "Watch Party service")
        .replaceAll("Emulator", "service");
}

function productionServiceAvailabilityModule() {
    return `export const SERVICE_STATUS = Object.freeze({
    CHECKING: "checking",
    AVAILABLE: "available",
    AUTH_UNAVAILABLE: "auth-unavailable",
    DATABASE_UNAVAILABLE: "database-unavailable",
    BOTH_UNAVAILABLE: "both-unavailable",
    RECONNECTING: "reconnecting"
});

export class ServiceAvailabilityError extends Error {
    constructor(status, details = {}) {
        super("Watch Party service is unavailable.");
        this.name = "ServiceAvailabilityError";
        this.status = status;
        this.details = details;
    }
}

export function getEmulatorEndpoints() {
    return null;
}

export function shouldCheckLocalServices() {
    return false;
}

export async function checkFirebaseServices() {
    return makeResult(SERVICE_STATUS.AVAILABLE, true, true);
}

export async function assertFirebaseServicesAvailable() {
    return makeResult(SERVICE_STATUS.AVAILABLE, true, true);
}

export function getStatus(authAvailable, databaseAvailable) {
    if (authAvailable && databaseAvailable) return SERVICE_STATUS.AVAILABLE;
    if (!authAvailable && !databaseAvailable) return SERVICE_STATUS.BOTH_UNAVAILABLE;
    if (!authAvailable) return SERVICE_STATUS.AUTH_UNAVAILABLE;
    return SERVICE_STATUS.DATABASE_UNAVAILABLE;
}

function makeResult(status, authAvailable, databaseAvailable) {
    return { status, authAvailable, databaseAvailable, endpoints: null, probes: {}, checkedAt: Date.now() };
}
`;
}

async function assertRequiredFiles() {
    const required = [
        "index.html",
        "style.css",
        "script.js",
        "apiKeySwitcher.js",
        "analytics.js",
        "logo.png",
        "sitemap.xml",
        "fav/favicon.ico",
        "player/index.html",
        "watch-party/index.html",
        "watch-party/js/app.js",
        "watch-party/runtime-config.js",
        "movie/index.html",
        "series/index.html"
    ];
    for (const rel of required) {
        await access(join(outDir, rel), fsConstants.R_OK).catch(() => {
            throw new Error(`Required public file missing from Pages artifact: ${rel}`);
        });
    }
}

async function writeManifest() {
    const files = await listFiles(outDir);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    manifest.fileCount = files.length;
    manifest.totalBytes = totalBytes;
    manifest.largestFiles = files
        .sort((a, b) => b.size - a.size)
        .slice(0, 20)
        .map((file) => ({ path: file.path, bytes: file.size }));
    await writeFile(join(outDir, "artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function listFiles(dir, base = dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(full, base));
        } else {
            const info = await stat(full);
            files.push({ path: normalizePath(relative(base, full)), size: info.size });
        }
    }
    return files;
}

function parseArgs(argv) {
    const parsed = {};
    for (const arg of argv) {
        const match = /^--([^=]+)=(.*)$/.exec(arg);
        if (match) parsed[match[1]] = match[2];
    }
    return parsed;
}

function normalizePath(path) {
    return path.split(sep).join("/");
}
