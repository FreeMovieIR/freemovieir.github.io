import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAllowedOrigins, validateProductionGatewayConfig, loadGatewayConfig } from "../src/v2/config.js";
import { DEFAULT_LIMITS, GATEWAY_POLICY_VERSION } from "../src/v2/constants.js";
import { normalizeDedupUrl, makeJobKey } from "../src/v2/hash.js";
import { buildFfmpegArgs } from "../src/ffmpeg-policy.js";
import {
    buildGatewayJob,
    classifyRtdbError,
    RtdbJobStore,
    RTDB_ERROR_CATEGORY,
    validateFirebaseSerializableJob
} from "../src/v2/stores/rtdb-job-store.js";

test("production Gateway config requires durable cloud resources and rejects local mode", () => {
    assert.throws(() => validateProductionGatewayConfig(loadGatewayConfig({
        MEDIA_GATEWAY_LOCAL_MODE: "true"
    })), /LOCAL_MODE/);
    assert.equal(validateProductionGatewayConfig(loadGatewayConfig({
        MEDIA_GATEWAY_PROJECT_ID: "freemovieir-fd57a",
        MEDIA_GATEWAY_DATABASE_URL: "https://freemovieir-fd57a-default-rtdb.firebaseio.com",
        MEDIA_GATEWAY_DB_AUTH_UID: "media-gateway-api",
        MEDIA_GATEWAY_ALLOWED_ORIGINS: "https://freemovieir.github.io",
        MEDIA_GATEWAY_BUCKET: "freemovieir-media-temp",
        MEDIA_GATEWAY_REGION: "us-central1",
        MEDIA_GATEWAY_WORKER_JOB: "freemovieir-media-worker"
    })), true);
    assert.equal(validateProductionGatewayConfig(loadGatewayConfig({
        MEDIA_GATEWAY_PROJECT_ID: "freemovieir-fd57a",
        MEDIA_GATEWAY_DATABASE_URL: "https://freemovieir-fd57a-default-rtdb.firebaseio.com",
        MEDIA_GATEWAY_DB_AUTH_UID: "media-gateway-worker",
        MEDIA_GATEWAY_ALLOWED_ORIGINS: "https://freemovieir.github.io",
        MEDIA_GATEWAY_BUCKET: "freemovieir-media-temp",
        MEDIA_GATEWAY_REGION: "us-central1",
        MEDIA_GATEWAY_WORKER_JOB: "freemovieir-media-worker"
    })), true);
});

test("production Gateway process timeout defaults and bounds are safe", () => {
    const base = {
        MEDIA_GATEWAY_PROJECT_ID: "freemovieir-fd57a",
        MEDIA_GATEWAY_DATABASE_URL: "https://freemovieir-fd57a-default-rtdb.firebaseio.com",
        MEDIA_GATEWAY_DB_AUTH_UID: "media-gateway-api",
        MEDIA_GATEWAY_ALLOWED_ORIGINS: "https://freemovieir.github.io",
        MEDIA_GATEWAY_BUCKET: "freemovieir-media-temp",
        MEDIA_GATEWAY_REGION: "us-central1",
        MEDIA_GATEWAY_WORKER_JOB: "freemovieir-media-worker"
    };
    const config = loadGatewayConfig(base);
    assert.equal(config.limits.ffmpegTimeoutMs, 14_400_000);
    assert.equal(config.limits.ffmpegTimeoutMs, DEFAULT_LIMITS.ffmpegTimeoutMs);
    assert.equal(config.limits.ffprobeTimeoutMs, 60_000);
    assert.equal(validateProductionGatewayConfig(config), true);
    assert.equal(loadGatewayConfig({
        ...base,
        MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS: "21600000",
        MEDIA_GATEWAY_FFPROBE_TIMEOUT_MS: "300000"
    }).limits.ffmpegTimeoutMs, 21_600_000);
    for (const bad of ["0", "-1", "Infinity", "NaN", "1.5", "21600001"]) {
        assert.throws(() => loadGatewayConfig({ ...base, MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS: bad }), /MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS/);
    }
    for (const bad of ["0", "-1", "Infinity", "NaN", "1.5", "300001"]) {
        assert.throws(() => loadGatewayConfig({ ...base, MEDIA_GATEWAY_FFPROBE_TIMEOUT_MS: bad }), /MEDIA_GATEWAY_FFPROBE_TIMEOUT_MS/);
    }
});

test("production Gateway config fails closed without a valid RTDB auth override UID", () => {
    const base = {
        MEDIA_GATEWAY_PROJECT_ID: "freemovieir-fd57a",
        MEDIA_GATEWAY_DATABASE_URL: "https://freemovieir-fd57a-default-rtdb.firebaseio.com",
        MEDIA_GATEWAY_ALLOWED_ORIGINS: "https://freemovieir.github.io",
        MEDIA_GATEWAY_BUCKET: "freemovieir-media-temp",
        MEDIA_GATEWAY_REGION: "us-central1",
        MEDIA_GATEWAY_WORKER_JOB: "freemovieir-media-worker"
    };
    assert.throws(() => validateProductionGatewayConfig(loadGatewayConfig(base)), /MEDIA_GATEWAY_DB_AUTH_UID/);
    assert.throws(() => validateProductionGatewayConfig(loadGatewayConfig({
        ...base,
        MEDIA_GATEWAY_DB_AUTH_UID: "admin"
    })), /MEDIA_GATEWAY_DB_AUTH_UID/);
    assert.throws(() => validateProductionGatewayConfig(loadGatewayConfig({
        ...base,
        MEDIA_GATEWAY_DB_AUTH_UID: "media-gateway-api",
        MEDIA_GATEWAY_DATABASE_PATH: "rooms"
    })), /MEDIA_GATEWAY_DATABASE_PATH/);
});

test("production Gateway API requires allowed origins while worker validation does not", () => {
    const base = {
        MEDIA_GATEWAY_PROJECT_ID: "freemovieir-fd57a",
        MEDIA_GATEWAY_DATABASE_URL: "https://freemovieir-fd57a-default-rtdb.firebaseio.com",
        MEDIA_GATEWAY_DB_AUTH_UID: "media-gateway-worker",
        MEDIA_GATEWAY_BUCKET: "freemovieir-media-temp",
        MEDIA_GATEWAY_REGION: "us-central1",
        MEDIA_GATEWAY_WORKER_JOB: "freemovieir-media-worker"
    };
    const workerConfig = loadGatewayConfig(base);
    assert.throws(() => validateProductionGatewayConfig(workerConfig), /MEDIA_GATEWAY_ALLOWED_ORIGINS/);
    assert.equal(validateProductionGatewayConfig(workerConfig, { requireAllowedOrigins: false }), true);
});

test("production Gateway CORS origins are exact and fail closed", () => {
    const base = {
        MEDIA_GATEWAY_PROJECT_ID: "freemovieir-fd57a",
        MEDIA_GATEWAY_DATABASE_URL: "https://freemovieir-fd57a-default-rtdb.firebaseio.com",
        MEDIA_GATEWAY_DB_AUTH_UID: "media-gateway-api",
        MEDIA_GATEWAY_BUCKET: "freemovieir-media-temp",
        MEDIA_GATEWAY_REGION: "us-central1",
        MEDIA_GATEWAY_WORKER_JOB: "freemovieir-media-worker"
    };
    assert.throws(() => validateProductionGatewayConfig(loadGatewayConfig(base)), /MEDIA_GATEWAY_ALLOWED_ORIGINS/);
    assert.deepEqual(parseAllowedOrigins(" https://freemovieir.github.io , http://127.0.0.1:8080 "), [
        "https://freemovieir.github.io",
        "http://127.0.0.1:8080"
    ]);
    for (const bad of [
        "*",
        "https://*.github.io",
        "ftp://freemovieir.github.io",
        "https://freemovieir.github.io/path",
        "https://freemovieir.github.io?x=1",
        "https://freemovieir.github.io#x",
        "https://user:pass@freemovieir.github.io",
        "not a url"
    ]) {
        assert.throws(() => loadGatewayConfig({ ...base, MEDIA_GATEWAY_ALLOWED_ORIGINS: bad }), /MEDIA_GATEWAY_ALLOWED_ORIGINS/);
    }
});

test("RTDB rate-limit store avoids dynamic requester indexes", () => {
    const store = readFileSync(new URL("../src/v2/stores/rtdb-job-store.js", import.meta.url), "utf8");
    assert.equal(/orderByChild\(`requesters\/\$\{uid\}\/uid`\)/.test(store), false);
    assert.match(store, /orderByChild\("requestedBy"\)/);
    assert.match(store, /this\.ref\(\)\.get\(\)/);
});

test("RTDB job serialization validation accepts production-shaped payload and rejects unsafe values", () => {
    const jobKey = "a".repeat(64);
    const baseInput = {
        sourceUrl: "https://filesamples.com/samples/video/mkv/sample_640x360.mkv",
        sourceHash: "source-hash",
        profileHash: "profile-hash",
        requestedBy: "zdiO2amO07Z9ld2yxdseFrBy0az1",
        outputPrefix: `jobs/${jobKey}/`,
        expiresAt: 1_800_000_000_000,
        deviceProfile: {
            profile: "ios-safari-test",
            browserFamily: "safari",
            nativeHls: true,
            mediaSource: false,
            managedMediaSource: false,
            webCodecsVideo: false,
            webCodecsAudio: false,
            supportsHevc: false
        }
    };
    const job = buildGatewayJob(jobKey, baseInput, 1_700_000_000_000);
    assert.equal(validateFirebaseSerializableJob(jobKey, job), true);

    for (const [label, patch, category] of [
        ["undefined", { sourceHash: undefined }, RTDB_ERROR_CATEGORY.INVALID_DATA],
        ["NaN", { expiresAt: Number.NaN }, RTDB_ERROR_CATEGORY.INVALID_DATA],
        ["Infinity", { expiresAt: Infinity }, RTDB_ERROR_CATEGORY.INVALID_DATA],
        ["negative Infinity", { expiresAt: -Infinity }, RTDB_ERROR_CATEGORY.INVALID_DATA],
        ["class instance", { deviceProfile: new URL("https://example.com") }, RTDB_ERROR_CATEGORY.INVALID_DATA],
        ["invalid requester key", { requestedBy: "bad.uid" }, RTDB_ERROR_CATEGORY.INVALID_KEY]
    ]) {
        const unsafe = buildGatewayJob(jobKey, { ...baseInput, ...patch }, 1_700_000_000_000);
        assertRtdbThrows(
            () => validateFirebaseSerializableJob(jobKey, unsafe),
            category,
            label
        );
    }
    assertRtdbThrows(() => validateFirebaseSerializableJob("a".repeat(63), job), RTDB_ERROR_CATEGORY.INVALID_KEY, "short job key");
    assertRtdbThrows(() => validateFirebaseSerializableJob("A".repeat(64), job), RTDB_ERROR_CATEGORY.INVALID_KEY, "uppercase job key");
});

test("RTDB error classifier maps Firebase failures to safe categories", () => {
    assert.equal(classifyRtdbError({ message: "permission_denied at /mediaGatewayJobs" }), RTDB_ERROR_CATEGORY.PERMISSION_DENIED);
    assert.equal(classifyRtdbError({ message: "Validation failed: .validate rejected" }), RTDB_ERROR_CATEGORY.VALIDATION_FAILED);
    assert.equal(classifyRtdbError({ message: "First argument contains undefined in property" }), RTDB_ERROR_CATEGORY.INVALID_DATA);
    assert.equal(classifyRtdbError({ message: "Path contains invalid key ." }), RTDB_ERROR_CATEGORY.INVALID_KEY);
    assert.equal(classifyRtdbError({ message: "transaction aborted" }), RTDB_ERROR_CATEGORY.TRANSACTION_ABORTED);
    assert.equal(classifyRtdbError({ code: "ECONNRESET" }), RTDB_ERROR_CATEGORY.NETWORK);
    assert.equal(classifyRtdbError({ status: 401 }), RTDB_ERROR_CATEGORY.AUTH);
    assert.equal(classifyRtdbError(new Error("something else")), RTDB_ERROR_CATEGORY.UNKNOWN);
});

test("RTDB createIfAbsent uses transaction result semantics across callback retries", async () => {
    const jobKey = "b".repeat(64);
    const now = 1_700_000_000_000;
    const input = {
        sourceUrl: "https://example.com/movie.mkv",
        sourceHash: "source-hash",
        profileHash: "profile-hash",
        requestedBy: "zdiO2amO07Z9ld2yxdseFrBy0az1",
        outputPrefix: `jobs/${jobKey}/`,
        expiresAt: now + 60_000,
        deviceProfile: { browserFamily: "safari" }
    };
    const existing = buildGatewayJob(jobKey, input, now);
    const database = {
        ref() {
            return {
                async transaction(callback) {
                    callback(null);
                    const finalValue = callback(existing);
                    return {
                        committed: true,
                        snapshot: {
                            exists: () => true,
                            val: () => finalValue
                        }
                    };
                }
            };
        }
    };
    const store = new RtdbJobStore({ database, now: () => now });
    const result = await store.createIfAbsent(jobKey, input);
    assert.equal(result.created, false);
    assert.equal(result.reused, true);
    assert.deepEqual(result.job, existing);
});

test("production server entry does not own authoritative memory, filesystem playback, or API background conversion", () => {
    const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
    assert.equal(/new\s+Map\s*\(/.test(server), false);
    assert.equal(/MEDIA_GATEWAY_OUTPUT_DIR|outputDir|\/media\//.test(server), false);
    assert.equal(/runJob\s*\(|\.catch\s*\(\s*\(.*Conversion/i.test(server), false);
});

test("worker no longer hard-codes a 30 minute FFmpeg timeout", () => {
    const worker = readFileSync(new URL("../src/v2/worker.js", import.meta.url), "utf8");
    assert.equal(/30\s*\*\s*60\s*\*\s*1000/.test(worker), false);
    assert.match(worker, /ffmpegTimeoutMs/);
    assert.match(worker, /ffprobeTimeoutMs/);
});

test("FFmpeg HLS args use temp file semantics for finalized output scanning", () => {
    const args = buildFfmpegArgs({
        sourceUrl: "file:///tmp/source.mkv",
        outputManifest: "/tmp/out/index.m3u8",
        policy: { mode: "remux", videoCodec: "copy", audioCodec: "copy" }
    });
    const hlsFlagsIndex = args.indexOf("-hls_flags");
    assert.notEqual(hlsFlagsIndex, -1);
    assert.match(args[hlsFlagsIndex + 1], /independent_segments/);
    assert.match(args[hlsFlagsIndex + 1], /temp_file/);
});

test("production Gateway database uses named app and never default getDatabase", () => {
    const factory = readFileSync(new URL("../src/v2/factory.js", import.meta.url), "utf8");
    assert.match(factory, /databaseAuthVariableOverride/);
    assert.match(factory, /getDatabase\(app\)/);
    assert.equal(/getDatabase\(\s*\)/.test(factory), false);
    assert.match(factory, /media-gateway-db-/);
});

test("dedup key normalizes URL fragments, casing, profile, and policy without raw path use", () => {
    const a = makeJobKey("HTTPS://Example.COM:443/path/movie.mkv#fragment", { browserFamily: "Safari" });
    const b = makeJobKey("https://example.com/path/movie.mkv", { browserFamily: "Safari" });
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.equal(a.includes("movie"), false);
    assert.equal(normalizeDedupUrl("https://Example.com:443/a.mkv#x"), "https://example.com/a.mkv");
});

test("policy version bump invalidates unsafe v2 READY job reuse", () => {
    assert.equal(GATEWAY_POLICY_VERSION, "mkv-hls-v3-ios-safe");
    assert.notEqual(GATEWAY_POLICY_VERSION, "mkv-hls-v2");
    const sourceUrl = "https://example.com/movie.mkv";
    const profile = { profile: "mobile", browserFamily: "safari", nativeHls: true };
    assert.notEqual(
        makeJobKey(sourceUrl, profile, "mkv-hls-v2"),
        makeJobKey(sourceUrl, profile, GATEWAY_POLICY_VERSION)
    );
});

function assertRtdbThrows(fn, expectedCategory, label) {
    assert.throws(fn, (error) => {
        assert.equal(error.rtdbCategory, expectedCategory, label);
        return true;
    });
}
