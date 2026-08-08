import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const generator = join(root, "scripts/generate-watch-party-config.mjs");
const pagesBuilder = join(root, "scripts/build-pages.mjs");
const artifactInspector = join(root, "scripts/inspect-pages-artifact.mjs");
const productionEnv = Object.freeze({
    WATCH_PARTY_FIREBASE_API_KEY: "AIzaSyA0000000000000000000000000000000000",
    WATCH_PARTY_FIREBASE_AUTH_DOMAIN: "freemovieir-rollout-test.firebaseapp.com",
    WATCH_PARTY_FIREBASE_DATABASE_URL: "https://freemovieir-rollout-test-default-rtdb.firebaseio.com",
    WATCH_PARTY_FIREBASE_PROJECT_ID: "freemovieir-rollout-test",
    WATCH_PARTY_FIREBASE_APP_ID: "1:123456789012:web:abcdef1234567890",
    WATCH_PARTY_RTC_ICE_SERVERS: "[]"
});

test("production public room rollout flags default off when variables are absent", async () => {
    const config = await generateProductionConfig({});
    assert.equal(config.publicRooms.enabled, false);
    assert.equal(config.publicRooms.creationEnabled, false);
    assert.equal(config.publicRooms.maintenance, false);
    assert.equal(config.publicRooms.forceDisableActiveRooms, false);
});

test("production public room rollout flags support discovery-only mode", async () => {
    const config = await generateProductionConfig({
        WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "true",
        WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "false"
    });
    assert.equal(config.publicRooms.enabled, true);
    assert.equal(config.publicRooms.creationEnabled, false);
    assert.equal(config.publicRooms.maintenance, false);
});

test("production public room rollout flags support full rollout and maintenance mode", async () => {
    const full = await generateProductionConfig({
        WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "1",
        WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "1"
    });
    assert.equal(full.publicRooms.enabled, true);
    assert.equal(full.publicRooms.creationEnabled, true);
    assert.equal(full.publicRooms.maintenance, false);

    const maintenance = await generateProductionConfig({
        WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "true",
        WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "false",
        WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE: "true"
    });
    assert.equal(maintenance.publicRooms.enabled, true);
    assert.equal(maintenance.publicRooms.creationEnabled, false);
    assert.equal(maintenance.publicRooms.maintenance, true);
});

test("production creation flag is normalized off when public rooms are disabled", async () => {
    const config = await generateProductionConfig({
        WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "false",
        WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "true"
    });
    assert.equal(config.publicRooms.enabled, false);
    assert.equal(config.publicRooms.creationEnabled, false);
});

test("production public room rollout flags reject unexpected boolean values", async () => {
    await assert.rejects(
        () => generateProductionConfig({ WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "yes" }),
        /WATCH_PARTY_PUBLIC_ROOMS_ENABLED must be one of/
    );
});

test("local and test configs keep public rooms enabled for emulator workflows", async () => {
    const local = await generateConfig({ mode: "local", env: {} });
    assert.equal(local.publicRooms.enabled, true);
    assert.equal(local.publicRooms.creationEnabled, true);
    assert.equal(local.publicRooms.maintenance, false);

    const testConfig = await generateConfig({ mode: "test", env: {} });
    assert.equal(testConfig.publicRooms.enabled, true);
    assert.equal(testConfig.publicRooms.creationEnabled, true);
    assert.equal(testConfig.publicRooms.maintenance, false);
});

test("production Pages artifact inspector accepts every controlled public-room rollout state", async () => {
    const cases = [
        {
            name: "default-off",
            flags: {},
            expected: { enabled: false, creationEnabled: false, maintenance: false }
        },
        {
            name: "discovery-only",
            flags: {
                WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "true",
                WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "false",
                WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE: "false"
            },
            expected: { enabled: true, creationEnabled: false, maintenance: false }
        },
        {
            name: "full-rollout",
            flags: {
                WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "true",
                WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "true",
                WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE: "false"
            },
            expected: { enabled: true, creationEnabled: true, maintenance: false }
        },
        {
            name: "maintenance",
            flags: {
                WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "true",
                WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "false",
                WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE: "true"
            },
            expected: { enabled: true, creationEnabled: false, maintenance: true }
        },
        {
            name: "normalized-invalid",
            flags: {
                WATCH_PARTY_PUBLIC_ROOMS_ENABLED: "false",
                WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED: "true",
                WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE: "false"
            },
            expected: { enabled: false, creationEnabled: false, maintenance: false }
        }
    ];

    for (const item of cases) {
        const config = await buildAndInspectProductionArtifact(item.name, item.flags);
        assert.equal(config.publicRooms.enabled, item.expected.enabled, item.name);
        assert.equal(config.publicRooms.creationEnabled, item.expected.creationEnabled, item.name);
        assert.equal(config.publicRooms.maintenance, item.expected.maintenance, item.name);
        assert.equal(config.publicRooms.forceDisableActiveRooms, false, item.name);
    }
});

async function generateProductionConfig(flags) {
    return generateConfig({ mode: "production", env: { ...productionEnv, ...flags } });
}

async function generateConfig({ mode, env }) {
    const dir = await mkdtemp(join(tmpdir(), "watch-party-rollout-"));
    const output = join(dir, "runtime-config.js");
    try {
        await execFileAsync(process.execPath, [generator, `--mode=${mode}`, `--output=${output}`], {
            cwd: root,
            env: sanitizedEnv(env),
            windowsHide: true
        });
        const module = await import(`${pathToFileURL(output).href}?t=${Date.now()}-${Math.random()}`);
        return module.watchPartyConfig;
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

async function buildAndInspectProductionArtifact(name, flags) {
    const dir = await mkdtemp(join(tmpdir(), `watch-party-pages-${name}-`));
    const output = join(dir, "dist");
    try {
        await execFileAsync(process.execPath, [pagesBuilder, "--mode=production", `--output=${output}`, `--buildId=rollout-${name}`], {
            cwd: root,
            env: sanitizedEnv({ ...productionEnv, ...flags }),
            windowsHide: true
        });
        await execFileAsync(process.execPath, [artifactInspector, `--dir=${output}`], {
            cwd: root,
            env: sanitizedEnv({ ...productionEnv, ...flags }),
            windowsHide: true
        });
        const runtimeConfigPath = join(output, "watch-party/runtime-config.js");
        const module = await import(`${pathToFileURL(runtimeConfigPath).href}?t=${Date.now()}-${Math.random()}`);
        return module.watchPartyConfig;
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

function sanitizedEnv(overrides) {
    const env = { ...process.env, ...overrides };
    for (const key of [
        "WATCH_PARTY_PUBLIC_ROOMS_ENABLED",
        "WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED",
        "WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE"
    ]) {
        if (!Object.prototype.hasOwnProperty.call(overrides, key)) delete env[key];
    }
    return env;
}
