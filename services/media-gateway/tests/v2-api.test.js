import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createMediaGatewayApi } from "../src/v2/api-server.js";
import { JOB_STAGES, JOB_STATUS, SAFE_ERROR } from "../src/v2/constants.js";
import { FakeJobExecutor } from "../src/v2/executors/fake-job-executor.js";
import { StaticTokenVerifier } from "../src/v2/auth-adapters.js";
import { MemoryJobStore } from "../src/v2/stores/memory-job-store.js";
import { MemoryObjectStore } from "../src/v2/stores/memory-object-store.js";

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

async function createJob(baseUrl, mediaUrl = "https://example.com/movie.mkv") {
    const response = await fetch(`${baseUrl}/v2/jobs`, {
        method: "POST",
        headers: { authorization: "Bearer local", "content-type": "application/json" },
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
