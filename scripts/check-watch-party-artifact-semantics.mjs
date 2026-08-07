import { readdir, readFile } from "node:fs/promises";
import { join, resolve, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const distRoot = resolve(root, args.dir || "dist");
const sourceRoot = resolve(root, "watch-party/js");
const artifactRoot = resolve(distRoot, "watch-party/js");

const mustMatchSource = [
    "firebase-client.js",
    "utils.js",
    "voice/voice-call.js"
];

const accidentalIdentifiers = [
    "shouldUseservices",
    "isLocalDisabled",
    "connectAuthservice",
    "connectDatabaseservice",
    "connectedserviceApps",
    "useservices",
    "local-config-disabled.js",
    "debugDisabled",
    "APP_CHECK_DEBUG_DISABLED"
];

const expectedIdentifiers = [
    ["firebase-client.js", "shouldUseEmulators"],
    ["firebase-client.js", "connectAuthEmulator"],
    ["firebase-client.js", "connectDatabaseEmulator"],
    ["utils.js", "isLocalHostname"],
    ["app.js", "shouldUseEmulators"],
    ["voice/voice-call.js", "isLocalHostname"]
];

for (const relPath of mustMatchSource) {
    const source = await readFile(join(sourceRoot, relPath), "utf8");
    const artifact = await readFile(join(artifactRoot, relPath), "utf8");
    if (source !== artifact) {
        throw new Error(`Production JS artifact was semantically rewritten: watch-party/js/${relPath}`);
    }
}

const appSource = stripDevelopmentBridge(await readFile(join(sourceRoot, "app.js"), "utf8"));
const appArtifact = await readFile(join(artifactRoot, "app.js"), "utf8");
if (appSource !== appArtifact) {
    throw new Error("Production JS artifact was rewritten beyond the allowed Watch Party development bridge removal.");
}
if (/local-test-bridge|__WATCH_PARTY_TEST__|__watchPartyTest/.test(appArtifact)) {
    throw new Error("Production JS artifact contains Watch Party local test bridge references.");
}

const files = await listFiles(artifactRoot);
for (const file of files.filter((item) => item.endsWith(".js"))) {
    const text = await readFile(join(artifactRoot, file), "utf8");
    for (const token of accidentalIdentifiers) {
        if (text.includes(token)) throw new Error(`Corrupted generated identifier "${token}" found in watch-party/js/${file}`);
    }
}

for (const [relPath, token] of expectedIdentifiers) {
    const text = await readFile(join(artifactRoot, relPath), "utf8");
    if (!text.includes(token)) {
        throw new Error(`Expected source identifier "${token}" missing from watch-party/js/${relPath}`);
    }
}

for (const file of files.filter((item) => item.endsWith(".js"))) {
    const result = spawnSync(process.execPath, ["--check", join(artifactRoot, file)], {
        cwd: root,
        encoding: "utf8"
    });
    if (result.status !== 0) {
        throw new Error(`node --check failed for watch-party/js/${file}\n${result.stderr || result.stdout}`);
    }
}

console.log(`[pages:test] Watch Party JS artifact semantics ok: ${files.filter((item) => item.endsWith(".js")).length} modules checked.`);

async function listFiles(dir, base = dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const output = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            output.push(...await listFiles(full, base));
        } else {
            output.push(normalizePath(relative(base, full)));
        }
    }
    return output;
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

function stripDevelopmentBridge(source) {
    return source.replace(
        /async function loadDevelopmentBridge\(\) \{[\s\S]*?\r?\n\}\r?\n\r?\nfunction shouldLoadDevelopmentBridge\(\) \{[\s\S]*?\r?\n\}\r?\n/,
        "async function loadDevelopmentBridge() {\n    return;\n}\n"
    );
}
