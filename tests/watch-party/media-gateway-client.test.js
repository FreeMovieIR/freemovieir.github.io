import test from "node:test";
import assert from "node:assert/strict";
import { GATEWAY_JOB_STATUS, MediaGatewayClient, isGatewayConfigured, normalizeGatewayConfig } from "../../watch-party/js/media-gateway-client.js";

test("gateway config is disabled when URL is absent", () => {
    assert.equal(isGatewayConfigured({ mediaGateway: { enabled: true, baseUrl: "" } }), false);
    assert.equal(normalizeGatewayConfig({ enabled: true, baseUrl: "https://gateway.example.test/" }).baseUrl, "https://gateway.example.test/");
});

test("gateway client sends sanitized profile and bearer token", async () => {
    const calls = [];
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        return {
            ok: true,
            json: async () => ({ jobId: "job1", status: "processing" })
        };
    };
    try {
        const client = new MediaGatewayClient({
            enabled: true,
            baseUrl: "https://gateway.example.test",
            requestTimeoutMs: 1000
        }, async () => "token");
        const result = await client.createJob("https://cdn.example.test/movie.mkv?private=1", {
            profile: "mobile",
            browserFamily: "safari",
            supportsHevc: true,
            uid: "must-not-send"
        });
        assert.equal(result.jobId, "job1");
        assert.equal(calls[0].url, "https://gateway.example.test/v2/jobs");
        assert.equal(calls[0].options.headers.authorization, "Bearer token");
        assert.equal(calls[0].body.deviceProfile.uid, undefined);
        assert.equal(calls[0].body.deviceProfile.browserFamily, "safari");
        assert.equal(calls[0].body.deviceProfile.supportsHevc, true);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("gateway client omits authorization header when token is unavailable", async () => {
    const calls = [];
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return {
            ok: true,
            json: async () => ({ jobId: "job1", status: "queued" })
        };
    };
    try {
        const client = new MediaGatewayClient({
            enabled: true,
            baseUrl: "https://gateway.example.test",
            requestTimeoutMs: 1000
        }, async () => "");
        await client.createJob("https://cdn.example.test/movie.mkv");
        assert.equal("authorization" in calls[0].options.headers, false);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("gateway client treats progressive playable state as ready for playback", async () => {
    const client = new MediaGatewayClient({ enabled: true, baseUrl: "https://gateway.example.test", jobTimeoutMs: 1000 }, async () => "token");
    client.getJob = async () => ({
        status: GATEWAY_JOB_STATUS.PLAYABLE,
        playbackAvailable: true
    });
    client.getPlayback = async () => ({ playback: { type: "hls", manifestUrl: "https://signed.example.test/index.m3u8" } });
    const job = await client.waitForReady("job", { pollMs: 1, timeoutMs: 100 });
    assert.equal(job.status, GATEWAY_JOB_STATUS.PLAYABLE);
    assert.equal(job.playback.manifestUrl, "https://signed.example.test/index.m3u8");
});
