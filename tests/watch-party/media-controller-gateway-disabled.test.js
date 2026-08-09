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
        canPlayType: () => "",
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); },
        pause() { this.paused = true; },
        load() {},
        removeAttribute(name) { delete this[name]; }
    };
}

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
        assert.equal(compatibilityEvents, 1);
        assert.equal(fetchCount, 0);
        assert.equal(controller.gateway.enabled, false);
        controller.destroySource();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            Object.defineProperty(globalThis, key, { configurable: true, value });
        }
    }
});
