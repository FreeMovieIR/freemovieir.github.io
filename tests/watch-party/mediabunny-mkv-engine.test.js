import test from "node:test";
import assert from "node:assert/strict";
import { MediaController } from "../../watch-party/js/media-controller.js";
import { MediabunnyMkvEngine } from "../../watch-party/js/mediabunny-mkv-engine.js";
import { createMediabunnyRelayFetch } from "../../watch-party/js/mediabunny-relay-fetch.js";

test("MKV selects Mediabunny and not native video or Gateway when decodable", async () => {
    const modules = makeMediabunnyModules();
    const video = makeVideo();
    const canvas = makeCanvas();
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        fetchCalls += 1;
        throw new Error("Gateway must not be called");
    };
    try {
        installBrowserGlobals();
        const controller = new MediaController(video, {
            mediaGateway: { enabled: true, baseUrl: "https://gateway.example.test" }
        }, {
            canvas,
            mediabunnyModules: modules,
            tokenProvider: async () => "token"
        });

        await controller.load("https://cdn.example.test/movie.mkv", 12);

        assert.equal(controller.engineName, "mediabunny");
        assert.equal(video.loadCalls <= 2, true, "native load is only called while clearing the video surface");
        assert.equal(video.srcSetCount, 0);
        assert.equal(fetchCalls, 0);
        assert.equal(modules.urlSourceUrls[0], "https://cdn.example.test/movie.mkv");
        assert.equal(modules.arrayBufferReads, 0);
        assert.equal(modules.ac3Registrations, 1);
        assert.equal(canvas.hidden, false);
        assert.equal(video.hidden, true);
        assert.equal(controller.duration, 120);
        controller.destroySource();
    } finally {
        globalThis.fetch = originalFetch;
        uninstallBrowserGlobals();
    }
});

test("MP4 remains native and returns the video surface", async () => {
    const modules = makeMediabunnyModules();
    const video = makeVideo();
    const canvas = makeCanvas();
    installBrowserGlobals();
    video.load = () => {
        video.loadCalls += 1;
        queueMicrotask(() => video.listeners.get("loadedmetadata")?.());
    };
    const controller = new MediaController(video, {
        mediaGateway: { enabled: true, baseUrl: "https://gateway.example.test" },
        nativeMetadataTimeoutMs: 50
    }, { canvas, mediabunnyModules: modules });

    await controller.load("https://cdn.example.test/movie.mp4");

    assert.equal(controller.engineName, "native");
    assert.equal(video.src, "https://cdn.example.test/movie.mp4");
    assert.equal(canvas.hidden, true);
    assert.equal(video.hidden, false);
    assert.equal(modules.urlSourceUrls.length, 0);
    uninstallBrowserGlobals();
});

test("media switching destroys old Mediabunny state and restores the correct surface", async () => {
    const modules = makeMediabunnyModules();
    const video = makeVideo();
    const canvas = makeCanvas();
    installBrowserGlobals();
    video.load = () => {
        video.loadCalls += 1;
        queueMicrotask(() => video.listeners.get("loadedmetadata")?.());
    };
    const controller = new MediaController(video, {
        mediaGateway: { enabled: false, baseUrl: "" },
        nativeMetadataTimeoutMs: 50
    }, { canvas, mediabunnyModules: modules });

    await controller.load("https://cdn.example.test/first.mp4");
    assert.equal(controller.engineName, "native");
    assert.equal(canvas.hidden, true);
    assert.equal(video.hidden, false);

    await controller.load("https://cdn.example.test/first.mkv", 2);
    assert.equal(controller.engineName, "mediabunny");
    assert.equal(canvas.hidden, false);
    assert.equal(video.hidden, true);
    assert.equal(controller.currentTime, 2);

    await controller.load("https://cdn.example.test/second.mkv", 3);
    assert.equal(controller.engineName, "mediabunny");
    assert.equal(modules.inputDisposals >= 1, true);
    assert.equal(modules.urlSourceUrls.at(-1), "https://cdn.example.test/second.mkv");
    assert.equal(controller.currentTime, 3);

    await controller.load("https://cdn.example.test/second.mp4");
    assert.equal(controller.engineName, "native");
    assert.equal(canvas.hidden, true);
    assert.equal(video.hidden, false);
    assert.equal(modules.inputDisposals >= 2, true);
    controller.destroySource();
    uninstallBrowserGlobals();
});

test("unsupported Mediabunny video codec calls Gateway fallback", async () => {
    const modules = makeMediabunnyModules({ videoDecodable: false });
    const video = makeVideo();
    const canvas = makeCanvas();
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith("/v2/jobs")) return jsonResponse({ jobId: "job1", status: "processing", progress: { stage: "queued" } });
        if (url.endsWith("/v2/jobs/job1")) return jsonResponse({
            jobId: "job1",
            status: "ready",
            playbackAvailable: true,
            playback: { manifestUrl: "/playback/job1/index.m3u8" }
        });
        throw new Error(`unexpected ${url}`);
    };
    video.canPlayType = (type) => type === "application/vnd.apple.mpegurl" ? "maybe" : "";
    video.load = () => {
        video.loadCalls += 1;
        queueMicrotask(() => {
            video.readyState = 2;
            video.listeners.get("loadedmetadata")?.();
            video.listeners.get("loadeddata")?.();
        });
    };
    try {
        installBrowserGlobals();
        const controller = new MediaController(video, {
            mediaGateway: {
                enabled: true,
                baseUrl: "https://gateway.example.test",
                pollMs: 1,
                requestTimeoutMs: 1000,
                jobTimeoutMs: 1000
            },
            nativeMetadataTimeoutMs: 50
        }, {
            canvas,
            mediabunnyModules: modules,
            tokenProvider: async () => "fallback-token"
        });

        await controller.load("https://cdn.example.test/movie.mkv");

        assert.equal(calls[0].url, "https://gateway.example.test/v2/jobs");
        assert.equal(calls[0].options.headers.authorization, "Bearer fallback-token");
        assert.equal(controller.engineName, "native");
        assert.equal(video.src, "https://gateway.example.test/playback/job1/index.m3u8");
    } finally {
        globalThis.fetch = originalFetch;
        uninstallBrowserGlobals();
    }
});

test("direct source-access retries Mediabunny with Relay and does not call Gateway when relay succeeds", async () => {
    const modules = makeMediabunnyModules({ failDirectSourceAccess: true });
    const video = makeVideo();
    const canvas = makeCanvas();
    const relayCalls = [];
    let gatewayCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        gatewayCalls += 1;
        throw new Error("Gateway must not be called");
    };
    try {
        installBrowserGlobals();
        const controller = new MediaController(video, {
            mediaGateway: { enabled: true, baseUrl: "https://gateway.example.test" }
        }, {
            canvas,
            mediabunnyModules: modules,
            tokenProvider: async () => "relay-token",
            relayFetch: async (input, init) => {
                relayCalls.push({ input, init });
                return jsonResponse({});
            }
        });

        await controller.load("https://cdn.example.test/movie.mkv");

        assert.equal(controller.engineName, "mediabunny");
        assert.equal(controller.diagnostics.transport, "relay");
        assert.equal(controller.diagnostics.relayStatus, "ready");
        assert.equal(modules.urlSourceUrls.length, 2);
        assert.equal(Boolean(modules.urlSourceOptions[1]?.fetchFn), true);
        assert.equal(gatewayCalls, 0);
    } finally {
        globalThis.fetch = originalFetch;
        uninstallBrowserGlobals();
    }
});

test("relay unsupported codec can use Gateway fallback", async () => {
    const modules = makeMediabunnyModules({ failDirectSourceAccess: true, videoDecodable: false });
    const video = makeVideo();
    const canvas = makeCanvas();
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith("/v2/jobs")) return jsonResponse({ jobId: "job1", status: "processing", progress: { stage: "queued" } });
        if (url.endsWith("/v2/jobs/job1")) return jsonResponse({
            jobId: "job1",
            status: "ready",
            playbackAvailable: true,
            playback: { manifestUrl: "/playback/job1/index.m3u8" }
        });
        throw new Error(`unexpected ${url}`);
    };
    video.canPlayType = (type) => type === "application/vnd.apple.mpegurl" ? "maybe" : "";
    video.load = () => {
        video.loadCalls += 1;
        queueMicrotask(() => {
            video.readyState = 2;
            video.listeners.get("loadedmetadata")?.();
            video.listeners.get("loadeddata")?.();
        });
    };
    try {
        installBrowserGlobals();
        const controller = new MediaController(video, {
            mediaGateway: {
                enabled: true,
                baseUrl: "https://gateway.example.test",
                pollMs: 1,
                requestTimeoutMs: 1000,
                jobTimeoutMs: 1000
            },
            nativeMetadataTimeoutMs: 50
        }, {
            canvas,
            mediabunnyModules: modules,
            tokenProvider: async () => "gateway-token",
            relayFetch: async () => jsonResponse({})
        });

        await controller.load("https://cdn.example.test/movie.mkv");

        assert.equal(calls[0].url, "https://gateway.example.test/v2/jobs");
        assert.equal(calls[0].options.headers.authorization, "Bearer gateway-token");
        assert.equal(controller.engineName, "native");
        assert.equal(modules.urlSourceUrls.length, 2);
    } finally {
        globalThis.fetch = originalFetch;
        uninstallBrowserGlobals();
    }
});

test("relay fetch preserves Range, uses fresh tokens, keeps token out of URL, and supports abort", async () => {
    const calls = [];
    const relayFetch = createMediabunnyRelayFetch({
        relayBaseUrl: "https://gateway.example.test",
        tokenProvider: async () => `token-${calls.length + 1}`,
        fetchFn: async (url, options) => {
            calls.push({ url, options });
            return jsonResponse({});
        }
    });
    const controller = new AbortController();
    await relayFetch(new Request("https://cdn.example.test/movie.mkv?private=1", {
        headers: { range: "bytes=10-19" }
    }), { signal: controller.signal });
    await relayFetch("https://cdn.example.test/movie.mkv", {
        headers: { range: "bytes=20-29" },
        signal: controller.signal
    });

    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[0].url).pathname, "/v3/range");
    assert.equal(new URL(calls[0].url).searchParams.get("url"), "https://cdn.example.test/movie.mkv?private=1");
    assert.equal(calls[0].url.includes("token-1"), false);
    assert.equal(calls[0].options.headers.get("authorization"), "Bearer token-1");
    assert.equal(calls[0].options.headers.get("range"), "bytes=10-19");
    assert.equal(calls[1].options.headers.get("authorization"), "Bearer token-2");
    assert.equal(calls[1].options.headers.get("range"), "bytes=20-29");
    assert.equal(calls[1].options.signal, controller.signal);
});

test("Mediabunny engine play, pause, seek, rate, and local gain are semantic", async () => {
    const modules = makeMediabunnyModules();
    const audio = makeAudioContext();
    const engine = new MediabunnyMkvEngine({
        video: makeVideo(),
        canvas: makeCanvas(),
        modules,
        audioContextFactory: () => audio.context,
        clock: audio.clock
    });
    await engine.load("https://cdn.example.test/movie.mkv", 0);
    await engine.play();
    await waitFor(() => audio.nodes.length > 0);
    assert.equal(engine.paused, false);
    assert.equal(audio.nodes.length > 0, true);
    engine.setVolume(0.4);
    assert.equal(audio.gain.gain.value, 0.4);
    engine.setMuted(true);
    assert.equal(audio.gain.gain.value, 0);
    audio.clock.advance(2);
    assert.equal(Math.round(engine.currentTime), 2);
    engine.setPlaybackRate(2);
    audio.clock.advance(2);
    assert.equal(Math.round(engine.currentTime), 6);
    const nodesBeforeSeek = [...audio.nodes];
    await engine.seek(30);
    assert.equal(modules.videoIteratorReturns > 0, true);
    assert.equal(nodesBeforeSeek.every((node) => node.stopped), true);
    engine.pause();
    assert.equal(engine.paused, true);
    engine.destroy();
    assert.equal(audio.nodes.every((node) => node.stopped), true);
});

test("stale frame after seek cannot render", async () => {
    const modules = makeMediabunnyModules({ delayedCanvas: true });
    const canvas = makeCanvas();
    const engine = new MediabunnyMkvEngine({
        video: makeVideo(),
        canvas,
        modules,
        audioContextFactory: () => makeAudioContext().context
    });
    modules.delayedCanvas = false;
    await engine.load("https://cdn.example.test/movie.mkv", 0);
    modules.delayedCanvas = true;
    const stale = engine.renderFrameAt(5, engine.generation);
    const fresh = engine.seek(20);
    await new Promise((resolve) => setImmediate(resolve));
    modules.releaseCanvas();
    await Promise.allSettled([stale, fresh]);
    assert.equal(canvas.lastDrawSource, "frame-20");
});

function makeMediabunnyModules({ videoDecodable = true, audioDecodable = true, delayedCanvas = false, failDirectSourceAccess = false } = {}) {
    const canvasResolvers = [];
    const modules = {
        urlSourceUrls: [],
        arrayBufferReads: 0,
        ac3Registrations: 0,
        videoIteratorReturns: 0,
        inputDisposals: 0,
        urlSourceOptions: [],
        releaseCanvas: () => {
            while (canvasResolvers.length) canvasResolvers.shift()();
        },
        delayedCanvas,
        registerAc3Decoder() { modules.ac3Registrations += 1; },
        ALL_FORMATS: ["all"],
        UrlSource: class UrlSource {
            constructor(url, options = null) {
                modules.urlSourceUrls.push(url);
                modules.urlSourceOptions.push(options);
                this.url = url;
                this.options = options;
            }
            async arrayBuffer() {
                modules.arrayBufferReads += 1;
                return new ArrayBuffer(0);
            }
        },
        Input: class Input {
            constructor(options) { this.options = options; }
            async getFormat() { return { name: "matroska/webm" }; }
            async getTracks() { return [videoTrack, audioTrack]; }
            async getFirstTimestamp() { return 0; }
            async getDurationFromMetadata() { return 120; }
            async computeDuration() { return 120; }
            async getPrimaryVideoTrack() {
                if (failDirectSourceAccess && !this.options?.source?.options?.fetchFn) {
                    throw new Error("Failed to fetch source due to CORS");
                }
                return videoTrack;
            }
            async getPrimaryAudioTrack() { return audioTrack; }
            dispose() {
                this.disposed = true;
                modules.inputDisposals += 1;
            }
        },
        CanvasSink: class CanvasSink {
            constructor() {}
            async getCanvas(timestamp) {
                if (modules.delayedCanvas) {
                    await new Promise((resolve) => { canvasResolvers.push(resolve); });
                }
                return { canvas: makeSourceCanvas(`frame-${Math.round(timestamp)}`), timestamp, duration: 1 };
            }
            canvases(start) {
                let done = false;
                return {
                    async next() {
                        if (done) return { done: true };
                        done = true;
                        return { done: false, value: { canvas: makeSourceCanvas(`frame-${Math.round(start)}`), timestamp: start, duration: 1 } };
                    },
                    async return() {
                        modules.videoIteratorReturns += 1;
                        done = true;
                        return { done: true };
                    }
                };
            }
        },
        AudioBufferSink: class AudioBufferSink {
            buffers(start) {
                let index = 0;
                return {
                    async next() {
                        if (index > 2) return { done: true };
                        const timestamp = start + index * 0.25;
                        index += 1;
                        return { done: false, value: { buffer: { duration: 0.25 }, timestamp, duration: 0.25 } };
                    },
                    async return() { return { done: true }; }
                };
            }
        }
    };
    const videoTrack = {
        async getCodecParameterString() { return "avc1.640028"; },
        async canDecode() { return videoDecodable; }
    };
    const audioTrack = {
        async getCodecParameterString() { return "ac-3"; },
        async getSampleRate() { return 48000; },
        async canDecode() { return audioDecodable; }
    };
    return modules;
}

function makeVideo() {
    const listeners = new Map();
    let src = "";
    return {
        parentElement: { querySelector: () => null },
        ownerDocument: { createElement: () => makeCanvas() },
        listeners,
        hidden: false,
        readyState: 1,
        duration: 120,
        currentTime: 0,
        playbackRate: 1,
        volume: 1,
        muted: false,
        paused: true,
        loadCalls: 0,
        srcSetCount: 0,
        canPlayType: () => "",
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); },
        pause() { this.paused = true; },
        play() { this.paused = false; return Promise.resolve(); },
        load() { this.loadCalls += 1; },
        setAttribute() {},
        removeAttribute(name) { if (name === "src") src = ""; },
        get src() { return src; },
        set src(value) { src = value; this.srcSetCount += 1; }
    };
}

function makeCanvas() {
    const canvas = {
        hidden: true,
        width: 0,
        height: 0,
        dataset: {},
        getContext: () => ({
            drawImage: (source) => { canvas.lastDrawSource = source.id; }
        })
    };
    return canvas;
}

function makeSourceCanvas(id) {
    return { id, width: 640, height: 360 };
}

function makeAudioContext() {
    let now = 0;
    const nodes = [];
    const gain = {
        gain: { value: 1 },
        connect() {}
    };
    const context = {
        state: "running",
        destination: {},
        get currentTime() { return now; },
        createGain: () => gain,
        createBufferSource: () => {
            const node = {
                playbackRate: { value: 1 },
                stopped: false,
                connect() {},
                addEventListener() {},
                start() {},
                stop() { this.stopped = true; },
                disconnect() {}
            };
            nodes.push(node);
            return node;
        },
        resume: async () => { context.state = "running"; },
        close: async () => { context.state = "closed"; }
    };
    return {
        context,
        gain,
        nodes,
        clock: {
            now: () => now * 1000,
            advance: (seconds) => { now += seconds; }
        }
    };
}

function jsonResponse(body) {
    return { ok: true, json: async () => body };
}

async function waitFor(predicate, attempts = 10) {
    for (let index = 0; index < attempts; index += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

function installBrowserGlobals() {
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { MediaSource: function MediaSource() {}, VideoDecoder: function VideoDecoder() {}, AudioDecoder: function AudioDecoder() {} }
    });
    globalThis.AudioContext = class FakeAudioContext {
        constructor() {
            return makeAudioContext().context;
        }
    };
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { fullscreenEnabled: false, createElement: (name) => name === "canvas" ? makeCanvas() : makeVideo() }
    });
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { userAgent: "Mozilla/5.0 desktop", platform: "Win32", maxTouchPoints: 0 }
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { hostname: "localhost", href: "http://localhost/watch-party/" }
    });
}

function uninstallBrowserGlobals() {
    for (const key of ["window", "document", "navigator", "location", "AudioContext"]) {
        Reflect.deleteProperty(globalThis, key);
    }
}
