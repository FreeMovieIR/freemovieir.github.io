import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPrivateMediaController } from "../../watch-party/js/private-media-controller.js";

test("private MediaController Gateway requests use the authenticated Firebase ID token", async () => {
    const calls = [];
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return {
            ok: true,
            json: async () => ({ jobId: "job-private", status: "queued" })
        };
    };
    try {
        const controller = createPrivateMediaController(makeVideo(), gatewayConfig(), {
            auth: {
                currentUser: {
                    getIdToken: async () => "private-id-token"
                }
            }
        });

        const job = await controller.gateway.createJob("https://cdn.example.test/movie.mkv");

        assert.equal(job.jobId, "job-private");
        assert.equal(calls.length, 1);
        assert.equal(calls[0].options.headers.authorization, "Bearer private-id-token");
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("private MediaController sends no token when Firebase user token is unavailable", async () => {
    const calls = [];
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return {
            ok: true,
            json: async () => ({ jobId: "job-private", status: "queued" })
        };
    };
    try {
        const controller = createPrivateMediaController(makeVideo(), gatewayConfig(), {
            auth: { currentUser: null }
        });

        await controller.gateway.createJob("https://cdn.example.test/movie.mkv");

        assert.equal(calls.length, 1);
        assert.equal("authorization" in calls[0].options.headers, false);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("private direct playback path remains Gateway-free when Gateway is disabled", async () => {
    const oldFetch = globalThis.fetch;
    let fetchCount = 0;
    const video = makeVideo({ nativeReady: true });
    globalThis.fetch = async () => {
        fetchCount += 1;
        throw new Error("Gateway must not be called");
    };
    try {
        const controller = createPrivateMediaController(video, {
            mediaGateway: { enabled: false, baseUrl: "" },
            nativeMetadataTimeoutMs: 25
        }, {
            auth: {
                currentUser: {
                    getIdToken: async () => "unused-token"
                }
            }
        });

        await controller.load("https://cdn.example.test/movie.mp4");

        assert.equal(fetchCount, 0);
        assert.equal(video.src, "https://cdn.example.test/movie.mp4");
        assert.equal(controller.gateway.enabled, false);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("public MediaController token wiring remains intact", async () => {
    const source = await readFile("watch-party/public/js/public-app.js", "utf8");
    assert.match(source, /new MediaController\(els\.publicVideo,\s*state\.config,\s*\{/);
    assert.match(source, /tokenProvider:\s*async\s*\(\)\s*=>\s*state\.service\?\.auth\?\.currentUser\?\.getIdToken\?\.\(\)\s*\|\|\s*""/);
});

function gatewayConfig() {
    return {
        mediaGateway: {
            enabled: true,
            baseUrl: "https://gateway.example.test",
            requestTimeoutMs: 1000,
            jobTimeoutMs: 1000,
            pollMs: 1
        }
    };
}

function makeVideo({ nativeReady = false, canPlayType = () => "maybe" } = {}) {
    const listeners = new Map();
    return {
        parentElement: {},
        readyState: 0,
        videoWidth: 0,
        duration: 100,
        paused: true,
        currentTime: 0,
        playbackRate: 1,
        volume: 1,
        muted: false,
        src: "",
        canPlayType,
        addEventListener(type, handler) {
            listeners.set(type, handler);
        },
        removeEventListener(type) {
            listeners.delete(type);
        },
        pause() {
            this.paused = true;
        },
        load() {
            if (nativeReady) queueMicrotask(() => listeners.get("loadedmetadata")?.());
        },
        removeAttribute(name) {
            delete this[name];
        }
    };
}
