import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createMediaGatewayApi } from "../src/v2/api-server.js";
import { JOB_STAGES, JOB_STATUS, SAFE_ERROR } from "../src/v2/constants.js";
import { FakeJobExecutor } from "../src/v2/executors/fake-job-executor.js";
import { StaticTokenVerifier } from "../src/v2/auth-adapters.js";
import { MemoryJobStore } from "../src/v2/stores/memory-job-store.js";
import { MemoryObjectStore } from "../src/v2/stores/memory-object-store.js";

const PRODUCTION_ORIGIN = "https://freemovieir.github.io";

test("V2 API rejects missing authentication", async () => {
    const fixture = await startFixture({
        tokenVerifier: {
            async verifyRequest() {
                const error = new Error("missing");
                error.status = 401;
                error.safeCode = SAFE_ERROR.AUTH_REQUIRED;
                throw error;
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mediaUrl: "https://example.com/movie.mkv" })
        });
        const body = await response.json();
        assert.equal(response.status, 401);
        assert.equal(body.safeError, SAFE_ERROR.AUTH_REQUIRED);
    } finally {
        await fixture.close();
    }
});

test("V2 API CORS preflight allows only configured production origin without auth", async () => {
    let verifierCalls = 0;
    const fixture = await startFixture({
        allowedOrigins: [PRODUCTION_ORIGIN],
        tokenVerifier: {
            async verifyRequest() {
                verifierCalls += 1;
                return { uid: "uid-a" };
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "OPTIONS",
            headers: {
                origin: PRODUCTION_ORIGIN,
                "access-control-request-method": "POST",
                "access-control-request-headers": "Authorization,Content-Type"
            }
        });
        assert.equal(response.status, 204);
        assert.equal(await response.text(), "");
        assert.equal(response.headers.get("access-control-allow-origin"), PRODUCTION_ORIGIN);
        assert.equal(response.headers.get("vary"), "Origin");
        assert.equal(response.headers.get("access-control-allow-headers"), "Authorization,Content-Type");
        assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,DELETE,OPTIONS");
        assert.equal(response.headers.get("access-control-max-age"), "600");
        assert.equal(verifierCalls, 0);
    } finally {
        await fixture.close();
    }
});

test("V2 API CORS headers are present on allowed success and error responses", async () => {
    const fixture = await startFixture({ allowedOrigins: [PRODUCTION_ORIGIN] });
    try {
        const created = await createJob(fixture.baseUrl, "https://example.com/movie.mkv", { origin: PRODUCTION_ORIGIN });
        assert.match(created.jobId, /^[a-f0-9]{64}$/);
        const success = await fetch(`${fixture.baseUrl}/v2/jobs/${created.jobId}`, {
            headers: { authorization: "Bearer local", origin: PRODUCTION_ORIGIN }
        });
        assert.equal(success.status, 200);
        assert.equal(success.headers.get("access-control-allow-origin"), PRODUCTION_ORIGIN);
        assert.equal(success.headers.get("vary"), "Origin");

        const error = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { authorization: "Bearer local", "content-type": "application/json", origin: PRODUCTION_ORIGIN },
            body: JSON.stringify({})
        });
        const body = await error.json();
        assert.equal(error.status, 400);
        assert.equal(error.headers.get("access-control-allow-origin"), PRODUCTION_ORIGIN);
        assert.equal(error.headers.get("vary"), "Origin");
        assert.equal(body.safeError, SAFE_ERROR.BAD_REQUEST);
    } finally {
        await fixture.close();
    }
});

test("V2 API rejects unknown browser origins before auth or job mutation", async () => {
    let verifierCalls = 0;
    const fixture = await startFixture({
        allowedOrigins: [PRODUCTION_ORIGIN],
        tokenVerifier: {
            async verifyRequest() {
                verifierCalls += 1;
                return { uid: "uid-a" };
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: {
                authorization: "Bearer local",
                "content-type": "application/json",
                origin: "https://evil.example"
            },
            body: JSON.stringify({ mediaUrl: "https://private.example/movie.mkv?secret=token" })
        });
        const text = await response.text();
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
        assert.equal(verifierCalls, 0);
        assert.equal(fixture.executor.starts.length, 0);
        assert.equal(text.includes("private.example"), false);
        assert.equal(text.includes("secret"), false);
    } finally {
        await fixture.close();
    }
});

test("V2 API no-Origin requests proceed to normal Firebase auth handling", async () => {
    let verifierCalls = 0;
    const fixture = await startFixture({
        allowedOrigins: [PRODUCTION_ORIGIN],
        tokenVerifier: {
            async verifyRequest() {
                verifierCalls += 1;
                const error = new Error("missing");
                error.status = 401;
                error.safeCode = SAFE_ERROR.AUTH_REQUIRED;
                throw error;
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mediaUrl: "https://example.com/movie.mkv" })
        });
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
        assert.equal(verifierCalls, 1);
    } finally {
        await fixture.close();
    }
});

test("V2 API allowed browser origin still requires Firebase authentication", async () => {
    let verifierCalls = 0;
    const fixture = await startFixture({
        allowedOrigins: [PRODUCTION_ORIGIN],
        tokenVerifier: {
            async verifyRequest() {
                verifierCalls += 1;
                const error = new Error("missing");
                error.status = 401;
                error.safeCode = SAFE_ERROR.AUTH_REQUIRED;
                throw error;
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: PRODUCTION_ORIGIN },
            body: JSON.stringify({ mediaUrl: "https://example.com/movie.mkv" })
        });
        const body = await response.json();
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("access-control-allow-origin"), PRODUCTION_ORIGIN);
        assert.equal(response.headers.get("vary"), "Origin");
        assert.equal(body.safeError, SAFE_ERROR.AUTH_REQUIRED);
        assert.equal(verifierCalls, 1);
    } finally {
        await fixture.close();
    }
});

test("20 simultaneous V2 creates for one source deduplicate to one worker execution", async () => {
    const fixture = await startFixture();
    try {
        const requests = Array.from({ length: 20 }, () => createJob(fixture.baseUrl));
        const responses = await Promise.all(requests);
        assert.equal(new Set(responses.map((body) => body.jobId)).size, 1);
        assert.equal(fixture.executor.starts.length, 1);
        assert.equal(responses.filter((body) => body.reused).length, 19);
        assert.equal(responses[0].status, JOB_STATUS.QUEUED);
    } finally {
        await fixture.close();
    }
});

test("V2 createJob reaches createIfAbsent when rate limits allow", async () => {
    const jobStore = new MemoryJobStore();
    let createIfAbsentCalls = 0;
    const fixture = await startFixture({
        jobStore: {
            ...jobStore,
            get: (...args) => jobStore.get(...args),
            createIfAbsent: (...args) => {
                createIfAbsentCalls += 1;
                return jobStore.createIfAbsent(...args);
            },
            addRequester: (...args) => jobStore.addRequester(...args),
            update: (...args) => jobStore.update(...args),
            countActiveByUid: (...args) => jobStore.countActiveByUid(...args),
            countCreatedByUidSince: (...args) => jobStore.countCreatedByUidSince(...args),
            countGlobalActive: (...args) => jobStore.countGlobalActive(...args)
        }
    });
    try {
        const created = await createJob(fixture.baseUrl, "https://example.com/reaches-create.mkv");
        assert.match(created.jobId, /^[a-f0-9]{64}$/);
        assert.equal(createIfAbsentCalls, 1);
        assert.equal(fixture.executor.starts.length, 1);
    } finally {
        await fixture.close();
    }
});

test("V2 rate limit rejects unique over-quota jobs without leaking details", async () => {
    const fixture = await startFixture({ limits: { maxActivePerUid: 1, maxCreatePerHour: 6, maxGlobalActive: 10 } });
    try {
        await createJob(fixture.baseUrl, "https://example.com/one.mkv");
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { authorization: "Bearer local", "content-type": "application/json" },
            body: JSON.stringify({ mediaUrl: "https://example.com/two.mkv", deviceProfile: { browserFamily: "safari" } })
        });
        const body = await response.json();
        assert.equal(response.status, 429);
        assert.equal(body.safeError, SAFE_ERROR.RATE_LIMITED);
    } finally {
        await fixture.close();
    }
});

test("V2 rate limits reject excessive created and global jobs", async () => {
    const createdFixture = await startFixture({ limits: { maxActivePerUid: 50, maxCreatePerHour: 1, maxGlobalActive: 50 } });
    try {
        await createJob(createdFixture.baseUrl, "https://example.com/created-one.mkv");
        const response = await fetch(`${createdFixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { authorization: "Bearer local", "content-type": "application/json" },
            body: JSON.stringify({ mediaUrl: "https://example.com/created-two.mkv", deviceProfile: { browserFamily: "safari" } })
        });
        const body = await response.json();
        assert.equal(response.status, 429);
        assert.equal(body.safeError, SAFE_ERROR.RATE_LIMITED);
    } finally {
        await createdFixture.close();
    }

    const globalFixture = await startFixture({ limits: { maxActivePerUid: 50, maxCreatePerHour: 50, maxGlobalActive: 1 } });
    try {
        await createJob(globalFixture.baseUrl, "https://example.com/global-one.mkv");
        const response = await fetch(`${globalFixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { authorization: "Bearer local", "content-type": "application/json" },
            body: JSON.stringify({ mediaUrl: "https://example.com/global-two.mkv", deviceProfile: { browserFamily: "safari" } })
        });
        const body = await response.json();
        assert.equal(response.status, 429);
        assert.equal(body.safeError, SAFE_ERROR.RATE_LIMITED);
    } finally {
        await globalFixture.close();
    }
});

test("V2 createJob diagnostics do not log source URLs or bearer tokens", async () => {
    const logEntries = [];
    const originalInfo = console.info;
    console.info = (...args) => {
        logEntries.push(args);
    };
    const fixture = await startFixture({
        jobStore: {
            async countActiveByUid() {
                const error = new Error("database unavailable");
                error.code = "database/permission-denied";
                error.status = 500;
                throw error;
            },
            async countCreatedByUidSince() {
                return 0;
            },
            async countGlobalActive() {
                return 0;
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { authorization: "Bearer SUPERSECRETTOKEN", "content-type": "application/json" },
            body: JSON.stringify({
                mediaUrl: "https://example.com/private/movie.mkv?secret=SHOULD_NOT_LOG",
                deviceProfile: { browserFamily: "safari" }
            })
        });
        const body = await response.json();
        assert.equal(response.status, 500);
        assert.equal(body.safeError, SAFE_ERROR.INTERNAL);
    } finally {
        await fixture.close();
        console.info = originalInfo;
    }
    const logs = JSON.stringify(logEntries);
    assert.match(logs, /rate-limit-check/);
    assert.match(logs, /database\/permission-denied/);
    assert.equal(logs.includes("SUPERSECRETTOKEN"), false);
    assert.equal(logs.includes("SHOULD_NOT_LOG"), false);
    assert.equal(logs.includes("private/movie.mkv"), false);
    assert.equal(logs.includes("Authorization"), false);
    assert.equal(logs.includes("Bearer"), false);
});

test("V2 createJob persistence failure stays at job-create and never starts worker", async () => {
    const logEntries = [];
    const originalInfo = console.info;
    console.info = (...args) => {
        logEntries.push(args);
    };
    const fixture = await startFixture({
        jobStore: {
            async countActiveByUid() {
                return 0;
            },
            async countCreatedByUidSince() {
                return 0;
            },
            async countGlobalActive() {
                return 0;
            },
            async createIfAbsent() {
                const error = new Error("permission_denied at /mediaGatewayJobs");
                error.rtdbCategory = "RTDB_PERMISSION_DENIED";
                throw error;
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v2/jobs`, {
            method: "POST",
            headers: { authorization: "Bearer SECRET_TOKEN", "content-type": "application/json" },
            body: JSON.stringify({
                mediaUrl: "https://example.com/private/movie.mkv?secret=SHOULD_NOT_LOG",
                deviceProfile: { browserFamily: "safari" }
            })
        });
        const body = await response.json();
        assert.equal(response.status, 500);
        assert.equal(body.safeError, SAFE_ERROR.INTERNAL);
        assert.equal(fixture.executor.starts.length, 0);
    } finally {
        await fixture.close();
        console.info = originalInfo;
    }
    const logs = JSON.stringify(logEntries);
    assert.match(logs, /job-create/);
    assert.match(logs, /RTDB_PERMISSION_DENIED/);
    assert.equal(logs.includes("worker-start"), false);
    assert.equal(logs.includes("SECRET_TOKEN"), false);
    assert.equal(logs.includes("SHOULD_NOT_LOG"), false);
    assert.equal(logs.includes("private/movie.mkv"), false);
});

test("V2 playback response exposes temporary HLS access but not source URL or object internals", async () => {
    const fixture = await startFixture();
    try {
        const created = await createJob(fixture.baseUrl);
        await fixture.objectStore.putSegment(`jobs/${created.jobId}/seg-0001.m4s`, "segment");
        await fixture.objectStore.putManifest(`jobs/${created.jobId}/index.m3u8`, [
            "#EXTM3U",
            "#EXT-X-VERSION:7",
            "#EXTINF:4.0,",
            "seg-0001.m4s",
            "#EXT-X-ENDLIST"
        ].join("\n"));
        await fixture.jobStore.update(created.jobId, {
            status: JOB_STATUS.PLAYABLE,
            stage: JOB_STAGES.PLAYABLE,
            playback: { available: true, manifestObject: `jobs/${created.jobId}/index.m3u8` }
        });
        const response = await fetch(`${fixture.baseUrl}/v2/jobs/${created.jobId}/playback`, {
            headers: { authorization: "Bearer local" }
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.playback.type, "hls");
        assert.match(body.playback.manifestUrl, /^memory:\/\/signed\//);
        assert.equal(JSON.stringify(body).includes("example.com/movie.mkv"), false);
        assert.equal(JSON.stringify(body).includes("encryptedOrPrivateUrl"), false);
    } finally {
        await fixture.close();
    }
});

async function startFixture(overrides = {}) {
    const jobStore = overrides.jobStore || new MemoryJobStore();
    const objectStore = overrides.objectStore || new MemoryObjectStore();
    const executor = overrides.executor || new FakeJobExecutor();
    const config = {
        allowedOrigins: overrides.allowedOrigins || [],
        limits: {
            jobTtlMs: 60 * 60 * 1000,
            playbackTtlMs: 10 * 60 * 1000,
            leaseTtlMs: 60 * 1000,
            maxActivePerUid: 50,
            maxCreatePerHour: 50,
            maxGlobalActive: 50,
            requestBodyLimit: 16 * 1024,
            ...(overrides.limits || {})
        }
    };
    const server = createMediaGatewayApi({
        jobStore,
        objectStore,
        executor,
        tokenVerifier: overrides.tokenVerifier || new StaticTokenVerifier("uid-a"),
        config
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address();
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        jobStore,
        objectStore,
        executor,
        close: () => new Promise((resolve) => server.close(resolve))
    };
}

async function createJob(baseUrl, mediaUrl = "https://example.com/movie.mkv", extraHeaders = {}) {
    const response = await fetch(`${baseUrl}/v2/jobs`, {
        method: "POST",
        headers: { authorization: "Bearer local", "content-type": "application/json", ...extraHeaders },
        body: JSON.stringify({
            mediaUrl,
            deviceProfile: { browserFamily: "safari", profile: "iphone", supportsHevc: false }
        })
    });
    if (response.status !== 202 && response.status !== 200) {
        assert.fail(await response.text());
    }
    return response.json();
}
