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
    ".agents",
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
    "functions",
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
    "skills-lock.json",
    "database-debug.log",
    "firebase-debug.log",
    "IMPROVEMENT_TASKS.md"
]);

const watchPartyExcluded = new Set([
    "LOCAL_TESTING.md",
    "PRODUCTION_SETUP.md",
    "README.md",
    "VOICE_V2_TESTING.md",
    "VOICE_TESTING.md",
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
    if (parts[0] === "watch-party" && parts[1] === "dev") return true;
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
    await transformWatchPartyApp(wpDir);
    await transformPublicRoomsArtifact(wpDir);
}

async function transformPublicRoomsArtifact(wpDir) {
    const publicIndexPath = join(wpDir, "public", "index.html");
    let html = await readFile(publicIndexPath, "utf8");
    html = html.replace(
        /(<link[^>]+href="\.\/style\.css)(")/,
        `$1?v=${buildId}$2`
    );
    html = html.replace(
        /(<script[^>]+src="\.\/js\/public-app\.js)(")/,
        `<script>window.wpBuildId=${JSON.stringify(buildId)};</script>\n    $1?v=${buildId}$2`
    );
    await writeFile(publicIndexPath, html, "utf8");
}

async function transformWatchPartyApp(wpDir) {
    const appPath = join(wpDir, "js", "app.js");
    let appJs = await readFile(appPath, "utf8");
    appJs = appJs.replace(
        /async function loadDevelopmentBridge\(\) \{[\s\S]*?\r?\n\}\r?\n\r?\nfunction shouldLoadDevelopmentBridge\(\) \{[\s\S]*?\r?\n\}\r?\n/,
        "async function loadDevelopmentBridge() {\n    return;\n}\n"
    );
    if (/local-test-bridge|__WATCH_PARTY_TEST__|__watchPartyTest/.test(appJs)) {
        throw new Error("Production Watch Party app artifact still contains local test bridge references.");
    }
    await writeFile(appPath, appJs, "utf8");
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
        "watch-party/public/index.html",
        "watch-party/js/app.js",
        "watch-party/public/js/public-app.js",
        "watch-party/vendor/mediabunny/mediabunny.min.mjs",
        "watch-party/vendor/mediabunny-ac3/mediabunny-ac3.min.mjs",
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
