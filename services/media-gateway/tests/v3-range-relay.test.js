import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createMediaGatewayApi } from "../src/v2/api-server.js";
import { SAFE_ERROR } from "../src/v2/constants.js";
import { FakeJobExecutor } from "../src/v2/executors/fake-job-executor.js";
import { StaticTokenVerifier } from "../src/v2/auth-adapters.js";
import { MemoryJobStore } from "../src/v2/stores/memory-job-store.js";
import { MemoryObjectStore } from "../src/v2/stores/memory-object-store.js";

const PRODUCTION_ORIGIN = "https://freemovieir.github.io";
const PUBLIC_URL = "https://media.example/movie.mkv";

test("V3 range relay requires Firebase authentication", async () => {
    const fixture = await startRelayFixture({
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
        const response = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(PUBLIC_URL)}`, {
            headers: { range: "bytes=0-9" }
        });
        const body = await response.json();
        assert.equal(response.status, 401);
        assert.equal(body.safeError, SAFE_ERROR.AUTH_REQUIRED);
    } finally {
        await fixture.close();
    }
});

test("V3 range relay rejects malformed, private, localhost, and metadata URLs", async () => {
    const fixture = await startRelayFixture({
        relay: {
            lookup: async (hostname) => {
                if (hostname === "localhost") return [{ address: "127.0.0.1", family: 4 }];
                if (hostname === "10.0.0.1") return [{ address: "10.0.0.1", family: 4 }];
                return [{ address: "93.184.216.34", family: 4 }];
            }
        }
    });
    try {
        for (const rawUrl of ["not a url", "http://10.0.0.1/movie.mkv", "http://localhost/movie.mkv", "http://metadata.google.internal/movie.mkv"]) {
            const response = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(rawUrl)}`, {
                headers: { authorization: "Bearer local", range: "bytes=0-9" }
            });
            const body = await response.json();
            assert.equal(response.status, 400);
            assert.equal(body.safeError, SAFE_ERROR.SOURCE_BLOCKED);
        }
    } finally {
        await fixture.close();
    }
});

test("V3 range relay blocks public to private redirects and redirect loops", async () => {
    const fixture = await startRelayFixture({
        relay: {
            fetchFn: async (url) => {
                if (url.includes("loop")) return new Response(null, { status: 302, headers: { location: "https://loop.example/movie.mkv" } });
                return new Response(null, { status: 302, headers: { location: "http://private.example/movie.mkv" } });
            },
            lookup: async (hostname) => [{ address: hostname === "private.example" ? "127.0.0.1" : "93.184.216.34", family: 4 }]
        }
    });
    try {
        const privateRedirect = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(PUBLIC_URL)}`, {
            headers: { authorization: "Bearer local", range: "bytes=0-9" }
        });
        assert.equal(privateRedirect.status, 400);
        assert.equal((await privateRedirect.json()).safeError, SAFE_ERROR.SOURCE_BLOCKED);

        const loop = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent("https://loop.example/movie.mkv")}`, {
            headers: { authorization: "Bearer local", range: "bytes=0-9" }
        });
        assert.equal(loop.status, 508);
        assert.equal((await loop.json()).safeError, SAFE_ERROR.SOURCE_BLOCKED);
    } finally {
        await fixture.close();
    }
});

test("V3 range relay forwards only safe Range semantics and streams 206 headers/body", async () => {
    const upstreamCalls = [];
    let arrayBufferCalled = false;
    const fixture = await startRelayFixture({
        relay: {
            fetchFn: async (url, options) => {
                upstreamCalls.push({ url, options });
                const response = new Response("0123456789", {
                    status: 206,
                    headers: {
                        "content-type": "video/x-matroska",
                        "content-length": "10",
                        "content-range": "bytes 10-19/100",
                        "accept-ranges": "bytes",
                        "etag": "\"abc\"",
                        "last-modified": "Tue, 11 Aug 2026 00:00:00 GMT",
                        "set-cookie": "private=1"
                    }
                });
                response.arrayBuffer = async () => {
                    arrayBufferCalled = true;
                    throw new Error("arrayBuffer must not be called");
                };
                return response;
            }
        }
    });
    try {
        const response = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(PUBLIC_URL)}`, {
            headers: {
                authorization: "Bearer local",
                cookie: "do-not-forward=1",
                range: "bytes=10-19",
                origin: PRODUCTION_ORIGIN
            }
        });
        assert.equal(response.status, 206);
        assert.equal(await response.text(), "0123456789");
        assert.equal(response.headers.get("content-range"), "bytes 10-19/100");
        assert.equal(response.headers.get("content-type"), "video/x-matroska");
        assert.equal(response.headers.get("accept-ranges"), "bytes");
        assert.equal(response.headers.get("etag"), "\"abc\"");
        assert.equal(response.headers.get("set-cookie"), null);
        assert.equal(response.headers.get("access-control-allow-origin"), PRODUCTION_ORIGIN);
        assert.match(response.headers.get("access-control-expose-headers") || "", /Content-Range/);
        assert.equal(arrayBufferCalled, false);
        assert.equal(upstreamCalls.length, 1);
        assert.equal(upstreamCalls[0].options.method, "GET");
        assert.equal(upstreamCalls[0].options.headers.range, "bytes=10-19");
        assert.equal("authorization" in upstreamCalls[0].options.headers, false);
        assert.equal("cookie" in upstreamCalls[0].options.headers, false);
    } finally {
        await fixture.close();
    }
});

test("V3 range relay preserves 416 and rejects upstream 200 for ranged GET", async () => {
    let mode = "416";
    const fixture = await startRelayFixture({
        relay: {
            fetchFn: async () => mode === "416"
                ? new Response("", { status: 416, headers: { "content-range": "bytes */100" } })
                : new Response("whole movie", { status: 200, headers: { "content-length": "999999999" } })
        }
    });
    try {
        const unsatisfiable = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(PUBLIC_URL)}`, {
            headers: { authorization: "Bearer local", range: "bytes=999-1000" }
        });
        assert.equal(unsatisfiable.status, 416);
        assert.equal(unsatisfiable.headers.get("content-range"), "bytes */100");

        mode = "200";
        const unsupported = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(PUBLIC_URL)}`, {
            headers: { authorization: "Bearer local", range: "bytes=0-9" }
        });
        assert.equal(unsupported.status, 502);
        assert.equal((await unsupported.json()).safeError, SAFE_ERROR.RANGE_UNSUPPORTED);
    } finally {
        await fixture.close();
    }
});

test("V3 range relay CORS permits Range for FreeMovie origin and rejects unknown origins", async () => {
    const fixture = await startRelayFixture();
    try {
        const allowed = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(PUBLIC_URL)}`, {
            method: "OPTIONS",
            headers: {
                origin: PRODUCTION_ORIGIN,
                "access-control-request-method": "GET",
                "access-control-request-headers": "Authorization,Range"
            }
        });
        assert.equal(allowed.status, 204);
        assert.equal(allowed.headers.get("access-control-allow-origin"), PRODUCTION_ORIGIN);
        assert.match(allowed.headers.get("access-control-allow-methods") || "", /HEAD/);
        assert.match(allowed.headers.get("access-control-allow-headers") || "", /Range/);
        assert.match(allowed.headers.get("access-control-expose-headers") || "", /Content-Range/);

        const rejected = await fetch(`${fixture.baseUrl}/v3/range?url=${encodeURIComponent(PUBLIC_URL)}`, {
            headers: {
                authorization: "Bearer local",
                range: "bytes=0-9",
                origin: "https://evil.example"
            }
        });
        assert.equal(rejected.status, 403);
        assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    } finally {
        await fixture.close();
    }
});

async function startRelayFixture(overrides = {}) {
    const config = {
        allowedOrigins: overrides.allowedOrigins || [PRODUCTION_ORIGIN],
        limits: {
            jobTtlMs: 60 * 60 * 1000,
            playbackTtlMs: 10 * 60 * 1000,
            leaseTtlMs: 60 * 1000,
            maxActivePerUid: 50,
            maxCreatePerHour: 50,
            maxGlobalActive: 50,
            requestBodyLimit: 16 * 1024
        },
        relay: {
            fetchFn: async () => new Response("ok", {
                status: 206,
                headers: {
                    "content-range": "bytes 0-1/2",
                    "content-length": "2",
                    "accept-ranges": "bytes"
                }
            }),
            lookup: async () => [{ address: "93.184.216.34", family: 4 }],
            ...(overrides.relay || {})
        }
    };
    const server = createMediaGatewayApi({
        jobStore: new MemoryJobStore(),
        objectStore: new MemoryObjectStore(),
        executor: new FakeJobExecutor(),
        tokenVerifier: overrides.tokenVerifier || new StaticTokenVerifier("uid-a"),
        config
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address();
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => server.close(resolve))
    };
}
