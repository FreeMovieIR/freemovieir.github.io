import test from "node:test";
import assert from "node:assert/strict";
import { MediaController } from "../../watch-party/js/media-controller.js";

function makeVideo() {
    const listeners = new Map();
    return {
        parentElement: {},
        readyState: 0,
        videoWidth: 0,
        duration: Number.NaN,
        paused: true,
        currentTime: 0,
        playbackRate: 1,
        volume: 1,
        muted: false,
        src: "",
        canPlayType: () => "",
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); },
        pause() { this.paused = true; },
        load() {},
        removeAttribute(name) { delete this[name]; }
    };
}

function makeGatewayVideo({ recordLoads = null, playable = true } = {}) {
    const video = makeVideo();
    video.duration = 100;
    video.canPlayType = (type) => type === "application/vnd.apple.mpegurl" ? "maybe" : "";
    video.load = () => {
        recordLoads?.push(video.src || "");
        if (!video.src || video.src.includes(".m3u8")) {
            queueMicrotask(() => {
                video.readyState = 1;
                video.__listeners?.get("loadedmetadata")?.();
                if (playable) {
                    video.readyState = 2;
                    video.__listeners?.get("loadeddata")?.();
                }
            });
        }
    };
    const listeners = new Map();
    video.__listeners = listeners;
    video.addEventListener = (type, handler) => { listeners.set(type, handler); };
    video.removeEventListener = (type) => { listeners.delete(type); };
    return video;
}

test("direct native media still becomes ready on loadedmetadata", async () => {
    const video = makeVideo();
    const listeners = new Map();
    let readyEvents = 0;
    video.duration = 120;
    video.addEventListener = (type, handler) => { listeners.set(type, handler); };
    video.removeEventListener = (type) => { listeners.delete(type); };
    video.load = () => queueMicrotask(() => {
        video.readyState = 1;
        listeners.get("loadedmetadata")?.();
    });
    video.canPlayType = () => "maybe";
    const controller = new MediaController(video, {
        mediaGateway: { enabled: false, baseUrl: "" },
        nativeMetadataTimeoutMs: 50
    });
    controller.addEventListener("ready", () => { readyEvents += 1; });

    await controller.load("https://cdn.example.test/movie.mp4");

    assert.equal(readyEvents, 1);
    assert.equal(video.src, "https://cdn.example.test/movie.mp4");
    assert.equal(video.preload, "metadata");
    controller.destroySource();
});

test("Gateway native HLS loadedmetadata alone does not emit playable ready", async () => {
    const previous = {
        location: globalThis.location,
        navigator: globalThis.navigator,
        window: globalThis.window,
        document: globalThis.document,
        localStorage: globalThis.localStorage,
        fetch: globalThis.fetch,
        CSS: globalThis.CSS,
        isSecureContext: globalThis.isSecureContext
    };
    const video = makeGatewayVideo({ playable: false });
    const storage = new Map();
    let metadataEvents = 0;
    let readyEvents = 0;
    try {
        Object.defineProperty(globalThis, "location", {
            configurable: true,
            value: { hostname: "freemovieir.github.io", href: "https://freemovieir.github.io/watch-party/" }
        });
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" }
        });
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { MediaSource: undefined, ManagedMediaSource: undefined, VideoDecoder: undefined, AudioDecoder: undefined }
        });
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                body: { classList: { contains: () => false } },
                fullscreenEnabled: false,
                addEventListener() {},
                removeEventListener() {},
                createElement: () => ({ getContext: undefined, canPlayType: () => "" })
            }
        });
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key) => storage.get(key) ?? null,
                setItem: (key, value) => storage.set(key, String(value))
            }
        });
        Object.defineProperty(globalThis, "CSS", {
            configurable: true,
            value: { supports: () => true }
        });
        globalThis.isSecureContext = true;
        globalThis.fetch = async (url) => {
            if (url.endsWith("/v2/jobs")) {
                return {
                    ok: true,
                    json: async () => ({ jobId: "job-metadata-only", status: "processing", progress: { stage: "queued" } })
                };
            }
            if (url.endsWith("/v2/jobs/job-metadata-only")) {
                return {
                    ok: true,
                    json: async () => ({
                        jobId: "job-metadata-only",
                        status: "ready",
                        playbackAvailable: true,
                        playback: { manifestUrl: "/playback/job-metadata-only/index.m3u8" }
                    })
                };
            }
            throw new Error(`unexpected Gateway request: ${url}`);
        };

        const controller = new MediaController(video, {
            mediaGateway: {
                enabled: true,
                baseUrl: "https://gateway.example.test",
                requestTimeoutMs: 1000,
                jobTimeoutMs: 1000,
                pollMs: 1
            },
            nativeMetadataTimeoutMs: 25
        }, {
            tokenProvider: async () => "metadata-token"
        });
        controller.addEventListener("metadata", () => { metadataEvents += 1; });
        controller.addEventListener("ready", () => { readyEvents += 1; });

        await assert.rejects(
            () => controller.load("https://cdn.example.test/movie.mkv"),
            /اطلاعات|طول کشید|media/i
        );
        assert.equal(metadataEvents, 1);
        assert.equal(readyEvents, 0);
        assert.equal(video.preload, "auto");
        assert.equal(video.duration, 100);
        assert.equal(video.currentTime, 0);
        controller.destroySource();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            Object.defineProperty(globalThis, key, { configurable: true, value });
        }
    }
});

test("mobile Safari MKV with disabled gateway fails safely without starting a gateway job", async () => {
    const previous = {
        location: globalThis.location,
        navigator: globalThis.navigator,
        window: globalThis.window,
        document: globalThis.document,
        localStorage: globalThis.localStorage,
        fetch: globalThis.fetch,
        CSS: globalThis.CSS,
        isSecureContext: globalThis.isSecureContext
    };
    let fetchCount = 0;
    const storage = new Map();
    const video = makeVideo();
    try {
        Object.defineProperty(globalThis, "location", {
            configurable: true,
            value: { hostname: "freemovieir.github.io", href: "https://freemovieir.github.io/watch-party/public/" }
        });
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
        });
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { MediaSource: undefined, ManagedMediaSource: undefined, VideoDecoder: undefined, AudioDecoder: undefined }
        });
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                body: { classList: { contains: () => false } },
                fullscreenEnabled: false,
                addEventListener() {},
                removeEventListener() {},
                createElement: () => ({ getContext: undefined, canPlayType: () => "" })
            }
        });
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key) => storage.get(key) ?? null,
                setItem: (key, value) => storage.set(key, String(value))
            }
        });
        Object.defineProperty(globalThis, "CSS", {
            configurable: true,
            value: { supports: () => true }
        });
        globalThis.isSecureContext = true;
        globalThis.fetch = async () => {
            fetchCount += 1;
            throw new Error("gateway must not be called");
        };

        const controller = new MediaController(video, {
            mediaGateway: { enabled: false, baseUrl: "" },
            nativeMetadataTimeoutMs: 25
        });
        let compatibilityEvents = 0;
        controller.addEventListener("compatibilityNeeded", (event) => {
            compatibilityEvents += 1;
            assert.equal(event.detail.gatewayAvailable, false);
        });

        await assert.rejects(
            () => controller.load("https://cdn.example.test/movie.mkv"),
            new RegExp(`MKV|${"\\u0622\\u06cc\\u0641\\u0648\\u0646"}`)
        );
        assert.equal(compatibilityEvents, 0);
        assert.equal(fetchCount, 0);
        assert.equal(controller.gateway.enabled, false);
        controller.destroySource();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            Object.defineProperty(globalThis, key, { configurable: true, value });
        }
    }
});

test("mobile Safari MKV routes through Gateway when enabled and configured", async () => {
    const previous = {
        location: globalThis.location,
        navigator: globalThis.navigator,
        window: globalThis.window,
        document: globalThis.document,
        localStorage: globalThis.localStorage,
        fetch: globalThis.fetch,
        CSS: globalThis.CSS,
        isSecureContext: globalThis.isSecureContext
    };
    const calls = [];
    const storage = new Map();
    const video = makeGatewayVideo();
    try {
        Object.defineProperty(globalThis, "location", {
            configurable: true,
            value: { hostname: "freemovieir.github.io", href: "https://freemovieir.github.io/watch-party/" }
        });
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
        });
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { MediaSource: undefined, ManagedMediaSource: undefined, VideoDecoder: undefined, AudioDecoder: undefined }
        });
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                body: { classList: { contains: () => false } },
                fullscreenEnabled: false,
                addEventListener() {},
                removeEventListener() {},
                createElement: () => ({ getContext: undefined, canPlayType: () => "" })
            }
        });
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key) => storage.get(key) ?? null,
                setItem: (key, value) => storage.set(key, String(value))
            }
        });
        Object.defineProperty(globalThis, "CSS", {
            configurable: true,
            value: { supports: () => true }
        });
        globalThis.isSecureContext = true;
        globalThis.fetch = async (url, options) => {
            calls.push({ url, options });
            if (url.endsWith("/v2/jobs")) {
                return {
                    ok: true,
                    json: async () => ({ jobId: "job1", status: "processing", progress: { stage: "queued" } })
                };
            }
            if (url.endsWith("/v2/jobs/job1")) {
                return {
                    ok: true,
                    json: async () => ({
                        jobId: "job1",
                        status: "ready",
                        playbackAvailable: true,
                        playback: { manifestUrl: "/playback/job1/index.m3u8" }
                    })
                };
            }
            throw new Error(`unexpected Gateway request: ${url}`);
        };

        const controller = new MediaController(video, {
            mediaGateway: {
                enabled: true,
                baseUrl: "https://gateway.example.test",
                requestTimeoutMs: 1000,
                jobTimeoutMs: 1000,
                pollMs: 1
            },
            nativeMetadataTimeoutMs: 25
        }, {
            tokenProvider: async () => "mobile-token"
        });

        await controller.load("https://cdn.example.test/movie.mkv");

        assert.equal(calls[0].url, "https://gateway.example.test/v2/jobs");
        assert.equal(calls[0].options.headers.authorization, "Bearer mobile-token");
        assert.equal(video.src, "https://gateway.example.test/playback/job1/index.m3u8");
        assert.equal(video.preload, "auto");
        assert.equal(controller.diagnostics.adapter, "gateway-hls");
        controller.destroySource();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            Object.defineProperty(globalThis, key, { configurable: true, value });
        }
    }
});

test("iPhone Chrome MKV routes through Gateway immediately without native metadata timeout", async () => {
    const previous = {
        location: globalThis.location,
        navigator: globalThis.navigator,
        window: globalThis.window,
        document: globalThis.document,
        localStorage: globalThis.localStorage,
        fetch: globalThis.fetch,
        CSS: globalThis.CSS,
        isSecureContext: globalThis.isSecureContext
    };
    const calls = [];
    const loadedSources = [];
    const storage = new Map();
    const video = makeGatewayVideo({ recordLoads: loadedSources });
    try {
        Object.defineProperty(globalThis, "location", {
            configurable: true,
            value: { hostname: "freemovieir.github.io", href: "https://freemovieir.github.io/watch-party/" }
        });
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0.0.0 Mobile/15E148 Safari/604.1" }
        });
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { MediaSource: undefined, ManagedMediaSource: undefined, VideoDecoder: undefined, AudioDecoder: undefined }
        });
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                body: { classList: { contains: () => false } },
                fullscreenEnabled: false,
                addEventListener() {},
                removeEventListener() {},
                createElement: () => ({ getContext: undefined, canPlayType: () => "" })
            }
        });
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key) => storage.get(key) ?? null,
                setItem: (key, value) => storage.set(key, String(value))
            }
        });
        Object.defineProperty(globalThis, "CSS", {
            configurable: true,
            value: { supports: () => true }
        });
        globalThis.isSecureContext = true;
        globalThis.fetch = async (url, options) => {
            calls.push({ url, options });
            if (url.endsWith("/v2/jobs")) {
                return {
                    ok: true,
                    json: async () => ({ jobId: "job-chrome-ios", status: "processing", progress: { stage: "queued" } })
                };
            }
            if (url.endsWith("/v2/jobs/job-chrome-ios")) {
                return {
                    ok: true,
                    json: async () => ({
                        jobId: "job-chrome-ios",
                        status: "ready",
                        playbackAvailable: true,
                        playback: { manifestUrl: "/playback/job-chrome-ios/index.m3u8" }
                    })
                };
            }
            throw new Error(`unexpected Gateway request: ${url}`);
        };

        const controller = new MediaController(video, {
            mediaGateway: {
                enabled: true,
                baseUrl: "https://gateway.example.test",
                requestTimeoutMs: 1000,
                jobTimeoutMs: 1000,
                pollMs: 1
            },
            nativeMetadataTimeoutMs: 50
        }, {
            tokenProvider: async () => "ios-chrome-token"
        });

        await controller.load("https://cdn.example.test/movie.mkv");

        assert.equal(calls[0].url, "https://gateway.example.test/v2/jobs");
        assert.equal(calls[0].options.headers.authorization, "Bearer ios-chrome-token");
        assert.equal(loadedSources.includes("https://cdn.example.test/movie.mkv"), false);
        assert.equal(video.src, "https://gateway.example.test/playback/job-chrome-ios/index.m3u8");
        assert.equal(controller.diagnostics.adapter, "gateway-hls");
        controller.destroySource();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            Object.defineProperty(globalThis, key, { configurable: true, value });
        }
    }
});
