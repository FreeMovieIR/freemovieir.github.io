import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getApps, deleteApp } from "firebase-admin/app";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { get, ref, set } from "firebase/database";
import { createGatewayAdminDatabase } from "../src/v2/factory.js";
import { hashSourceUrl, makeJobKey, makeProfileHash, normalizeDeviceProfile } from "../src/v2/hash.js";
import { buildGatewayJob, RtdbJobStore, validateFirebaseSerializableJob } from "../src/v2/stores/rtdb-job-store.js";

const PROJECT_ID = "demo-freemovieir";
const DATABASE_URL = "http://127.0.0.1:9000?ns=demo-freemovieir-default-rtdb";
const SOURCE_URL = "https://filesamples.com/samples/video/mkv/sample_640x360.mkv";
const REQUESTED_BY = "gateway-emulator-test-user";
const NOW = 1_700_000_000_000;
const EXPIRES_AT = NOW + 7_200_000;
const RAW_PROFILE = {
    profile: "ios-safari-test",
    browserFamily: "safari",
    nativeHls: true,
    mediaSource: false,
    managedMediaSource: false,
    webCodecsVideo: false,
    webCodecsAudio: false,
    supportsHevc: false
};

let testEnv;

function gatewayConfig(dbAuthUid = "media-gateway-api") {
    return {
        projectId: PROJECT_ID,
        databaseUrl: DATABASE_URL,
        dbAuthUid,
        databasePath: "mediaGatewayJobs"
    };
}

function db(uid) {
    return uid ? testEnv.authenticatedContext(uid).database() : testEnv.unauthenticatedContext().database();
}

function productionPayload(sourceUrl = SOURCE_URL) {
    const deviceProfile = normalizeDeviceProfile(RAW_PROFILE);
    const jobKey = makeJobKey(sourceUrl, deviceProfile);
    return {
        jobKey,
        input: {
            sourceUrl,
            sourceHash: hashSourceUrl(sourceUrl),
            profileHash: makeProfileHash(deviceProfile),
            deviceProfile,
            requestedBy: REQUESTED_BY,
            outputPrefix: `jobs/${jobKey}/`,
            expiresAt: EXPIRES_AT
        }
    };
}

test.before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: {
            host: "127.0.0.1",
            port: 9000,
            rules: readFileSync("firebase/database.rules.json", "utf8")
        }
    });
});

test.beforeEach(async () => {
    await testEnv.clearDatabase();
    for (const app of getApps()) {
        if (app.name.startsWith("media-gateway-db-")) await deleteApp(app);
    }
    const database = await createGatewayAdminDatabase(gatewayConfig("media-gateway-api"));
    await database.ref("mediaGatewayJobs").remove();
});

test.after(async () => {
    await testEnv.cleanup();
    for (const app of getApps()) {
        if (app.name.startsWith("media-gateway-db-")) await deleteApp(app);
    }
});

test("real Admin RTDB transaction creates and reuses production-shaped Media Gateway job", async () => {
    const database = await createGatewayAdminDatabase(gatewayConfig("media-gateway-api"));
    const store = new RtdbJobStore({ database, now: () => NOW });
    const { jobKey, input } = productionPayload();
    const expectedJob = buildGatewayJob(jobKey, input, NOW);
    const expectedStoredJob = toRtdbStoredValue(expectedJob);

    assert.equal(validateFirebaseSerializableJob(jobKey, expectedJob), true);

    const first = await store.createIfAbsent(jobKey, input);
    assert.equal(first.created, true);
    assert.equal(first.reused, false);
    assert.deepEqual(first.job, expectedStoredJob);

    const persisted = await store.get(jobKey);
    assert.deepEqual(persisted, expectedStoredJob);

    const second = await store.createIfAbsent(jobKey, input);
    assert.equal(second.created, false);
    assert.equal(second.reused, true);
    assert.deepEqual(second.job, expectedStoredJob);
});

test("real Admin RTDB transaction deduplicates parallel identical creates", async () => {
    const database = await createGatewayAdminDatabase(gatewayConfig("media-gateway-api"));
    const store = new RtdbJobStore({ database, now: () => NOW });
    const { jobKey, input } = productionPayload(`${SOURCE_URL}?parallel=1`);
    const expectedStoredJob = toRtdbStoredValue(buildGatewayJob(jobKey, input, NOW));

    const results = await Promise.all(Array.from({ length: 20 }, () => store.createIfAbsent(jobKey, input)));
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => result.reused).length, 19);
    assert.deepEqual(await store.get(jobKey), expectedStoredJob);
});

test("production-equivalent rules allow only valid service transaction writes", async () => {
    const { jobKey, input } = productionPayload();
    const job = buildGatewayJob(jobKey, input, NOW);

    await assertSucceeds(set(ref(db("media-gateway-api"), `mediaGatewayJobs/${jobKey}`), job));
    await assertFails(set(ref(db("media-gateway-api"), `mediaGatewayJobs/${"a".repeat(63)}`), job));
    await assertFails(set(ref(db("media-gateway-api"), `mediaGatewayJobs/${"A".repeat(64)}`), job));
    await assertFails(set(ref(db(REQUESTED_BY), `mediaGatewayJobs/${jobKey}`), job));
    await assertFails(set(ref(db(), `mediaGatewayJobs/${jobKey}`), job));
    await assertSucceeds(get(ref(db("media-gateway-api"), `mediaGatewayJobs/${jobKey}`)));
});

function toRtdbStoredValue(value) {
    if (value === null) return undefined;
    if (Array.isArray(value)) {
        const arrayValue = value.map(toRtdbStoredValue);
        return arrayValue.some((item) => item !== undefined) ? arrayValue : undefined;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .map(([key, child]) => [key, toRtdbStoredValue(child)])
            .filter(([, child]) => child !== undefined);
        return entries.length ? Object.fromEntries(entries) : undefined;
    }
    return value;
}
