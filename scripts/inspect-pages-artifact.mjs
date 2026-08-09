import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const args = parseArgs(process.argv.slice(2));
const root = resolve(args.dir || "dist");
const maxBytes = Number(args.maxBytes || process.env.PAGES_MAX_ARTIFACT_BYTES || 75 * 1024 * 1024);
const forbiddenPathParts = new Set([
    ".git",
    ".github",
    "node_modules",
    "tests",
    "scripts",
    "firebase",
    "functions",
    "dev",
    "services",
    "test-assets",
    "artifacts",
    "playwright-report",
    "test-results",
    "coverage"
]);

const forbiddenFiles = new Set([
    "package.json",
    "package-lock.json",
    "firebase.json",
    ".firebaserc",
    "playwright.config.js",
    "LOCAL_TESTING.md",
    "PRODUCTION_SETUP.md",
    "firebase-config.example.js",
    "runtime-config.template.js"
]);

const forbiddenText = [
    [/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(?:9000|9099)\b/i, "Firebase emulator endpoint"],
    [/demo-freemovieir/i, "demo Firebase project"],
    [/FIREBASE_APPCHECK_DEBUG_TOKEN/i, "App Check debug token"],
    [/BEGIN PRIVATE KEY/i, "private key"],
    [/"type"\s*:\s*"service_account"/i, "service account JSON"],
    [/private_key/i, "private key field"],
    [/firebase-adminsdk/i, "Firebase Admin credential text"],
    [/\bturn(?:s)?:\/\/[^"'\s]+["'][^}]*\bcredential\s*:\s*["'][^"']+["']/i, "inline TURN credential"],
    [/TURN password/i, "TURN password text"],
    [/__WATCH_PARTY_[A-Z0-9_]+__/i, "unexpanded template token"],
    [/__watchPartyTest|__WATCH_PARTY_TEST__/i, "Watch Party test hook"],
    [/media-gateway-output|MEDIA_GATEWAY_|freemovieir-media-gateway/i, "media gateway source/config text"]
];

const files = await listFiles(root);
if (!files.length) throw new Error(`Pages artifact is empty: ${root}`);

for (const file of files) {
    const parts = file.path.split("/");
    if (parts.some((part) => forbiddenPathParts.has(part))) throw new Error(`Development path leaked into artifact: ${file.path}`);
    if (forbiddenFiles.has(parts.at(-1))) throw new Error(`Development file leaked into artifact: ${file.path}`);
    if (file.path.endsWith(".log") || file.path.endsWith(".bak") || file.path.endsWith(".map")) {
        throw new Error(`Generated/debug file leaked into artifact: ${file.path}`);
    }
}

const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
if (totalBytes > maxBytes) {
    throw new Error(`Pages artifact is ${totalBytes} bytes, above limit ${maxBytes} bytes.`);
}

for (const file of files.filter((item) => isTextLike(item.path))) {
    const text = await readFile(join(root, file.path), "utf8");
    for (const [pattern, label] of forbiddenText) {
        if (pattern.test(text)) throw new Error(`${label} found in artifact file ${file.path}`);
    }
}

await assertReadable("index.html");
await assertReadable("player/index.html");
await assertReadable("watch-party/index.html");
await assertReadable("watch-party/js/app.js");
await assertReadable("watch-party/public/index.html");
await assertReadable("watch-party/public/js/public-app.js");
await assertReadable("watch-party/runtime-config.js");
await assertReadable("sitemap.xml");
await assertReadable("movie/index.html");
await assertReadable("series/index.html");
await assertReadable("airing-today-tv-show/index.html");
await assertReadable("search/index.html");

const runtimeConfigPath = join(root, "watch-party/runtime-config.js");
const runtimeModule = await import(`${pathToFileURL(runtimeConfigPath).href}?inspect=${Date.now()}`);
const config = runtimeModule.watchPartyConfig;
if (!config) throw new Error("watch-party/runtime-config.js did not export watchPartyConfig.");
if (config.environment !== "production") throw new Error("runtime config environment is not production.");
if (config.useEmulators !== false) throw new Error("runtime config useEmulators is not false.");
if ("emulators" in config) throw new Error("runtime config must not contain an emulators block in production.");
for (const key of ["apiKey", "authDomain", "databaseURL", "projectId", "appId"]) {
    if (!config.firebase?.[key]) throw new Error(`runtime config missing firebase.${key}.`);
}
if (JSON.stringify(config).match(/127\.0\.0\.1|localhost|demo-freemovieir|service_account|private_key|firebase-adminsdk|__WATCH_PARTY_|FIREBASE_APPCHECK_DEBUG_TOKEN/i)) {
    throw new Error("runtime config contains forbidden local/test/private text.");
}
validatePublicRoomRolloutConfig(config.publicRooms);
validateMediaGatewayConfig(config.mediaGateway);

const wpHtml = await readFile(join(root, "watch-party/index.html"), "utf8");
const publicHtml = await readFile(join(root, "watch-party/public/index.html"), "utf8");
for (const asset of ["watch-party/style.css", "watch-party/js/app.js"]) {
    await assertReadable(asset);
}
if (/firebase-config\.js/.test(wpHtml)) throw new Error("watch-party/index.html references firebase-config.js.");
if (/firebase-config\.js/.test(publicHtml)) throw new Error("watch-party/public/index.html references firebase-config.js.");

const largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 10);
console.log(`[pages:test] artifact ok: ${files.length} files, ${totalBytes} bytes.`);
console.log("[pages:test] largest files:");
for (const file of largestFiles) console.log(`  ${file.path} ${file.size}`);

async function assertReadable(path) {
    await access(join(root, path), fsConstants.R_OK).catch(() => {
        throw new Error(`Required artifact file missing: ${path}`);
    });
}

async function listFiles(dir, base = dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const output = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            output.push(...await listFiles(full, base));
        } else {
            const info = await stat(full);
            output.push({ path: normalizePath(relative(base, full)), size: info.size });
        }
    }
    return output;
}

function isTextLike(path) {
    return /\.(html|css|js|json|xml|txt|webmanifest)$/i.test(path);
}

function parseArgs(argv) {
    const parsed = {};
    for (const arg of argv) {
        const match = /^--([^=]+)=(.*)$/.exec(arg);
        if (match) parsed[match[1]] = match[2];
    }
    return parsed;
}

function validatePublicRoomRolloutConfig(publicRooms) {
    if (!publicRooms || typeof publicRooms !== "object" || Array.isArray(publicRooms)) {
        throw new Error("runtime config publicRooms must be an object.");
    }
    for (const key of ["enabled", "creationEnabled", "maintenance", "forceDisableActiveRooms"]) {
        if (typeof publicRooms[key] !== "boolean") {
            throw new Error(`runtime config publicRooms.${key} must be boolean.`);
        }
    }
    if (publicRooms.forceDisableActiveRooms !== false) {
        throw new Error("runtime config publicRooms.forceDisableActiveRooms must remain false.");
    }
    if (publicRooms.creationEnabled === true && publicRooms.enabled !== true) {
        throw new Error("runtime config publicRooms.creationEnabled cannot be true while publicRooms.enabled is false.");
    }
    if (typeof publicRooms.functionTimeoutMs !== "number" || publicRooms.functionTimeoutMs < 1000 || publicRooms.functionTimeoutMs > 60000) {
        throw new Error("runtime config publicRooms.functionTimeoutMs must be a sane numeric value.");
    }
}

function validateMediaGatewayConfig(mediaGateway) {
    if (!mediaGateway || typeof mediaGateway !== "object" || Array.isArray(mediaGateway)) {
        throw new Error("runtime config mediaGateway must be an object.");
    }
    if (typeof mediaGateway.enabled !== "boolean") {
        throw new Error("runtime config mediaGateway.enabled must be boolean.");
    }
    if (typeof mediaGateway.baseUrl !== "string") {
        throw new Error("runtime config mediaGateway.baseUrl must be a string.");
    }
    if (mediaGateway.enabled && !/^https:\/\//i.test(mediaGateway.baseUrl)) {
        throw new Error("runtime config mediaGateway.baseUrl must use HTTPS when Gateway is enabled.");
    }
    if (!mediaGateway.enabled && mediaGateway.baseUrl) {
        throw new Error("runtime config mediaGateway.baseUrl must be empty when Gateway is disabled.");
    }
}

function normalizePath(path) {
    return path.split(sep).join("/");
}
