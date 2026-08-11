import { MediabunnyMkvEngine } from "../js/mediabunny-mkv-engine.js";
import { createMediabunnyRelayFetch } from "../js/mediabunny-relay-fetch.js";

const els = {
    url: document.getElementById("url"),
    load: document.getElementById("load"),
    play: document.getElementById("play"),
    pause: document.getElementById("pause"),
    seek: document.getElementById("seek"),
    modeRelay: document.getElementById("mode-relay"),
    relayBaseUrl: document.getElementById("relayBaseUrl"),
    idToken: document.getElementById("idToken"),
    video: document.getElementById("video"),
    canvas: document.getElementById("canvas"),
    diagnostics: document.getElementById("diagnostics")
};

let engine = createEngine();
let lastEvent = "idle";

function createEngine() {
    const relayFetch = els.modeRelay?.checked ? createMediabunnyRelayFetch({
        relayBaseUrl: els.relayBaseUrl.value.trim(),
        tokenProvider: async () => els.idToken.value.trim()
    }) : null;
    return new MediabunnyMkvEngine({ video: els.video, canvas: els.canvas, relayFetch });
}

function resetEngineForCurrentMode() {
    engine?.destroy();
    engine = createEngine();
    attachEngineListeners(engine);
    return engine;
}

function getCanvasPixelSum() {
    const context = els.canvas.getContext("2d");
    if (!context || !els.canvas.width || !els.canvas.height) return 0;
    const sampleWidth = Math.min(16, els.canvas.width);
    const sampleHeight = Math.min(16, els.canvas.height);
    const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) sum += data[index];
    return sum;
}

function renderDiagnostics(eventName = lastEvent, extra = {}) {
    lastEvent = eventName;
    const diagnostics = {
        event: eventName,
        currentTime: engine.currentTime,
        duration: engine.duration,
        paused: engine.paused,
        canvasPixelSum: getCanvasPixelSum(),
        ...engine.getSafeDiagnostics(),
        ...extra
    };
    els.diagnostics.textContent = JSON.stringify(diagnostics, null, 2);
    return diagnostics;
}

function attachEngineListeners(target) {
    for (const eventName of ["metadata", "ready", "playing", "pause", "waiting", "timeupdate", "ended", "error"]) {
        target.addEventListener(eventName, (event) => {
            renderDiagnostics(eventName, eventName === "error" ? { category: event.detail?.category || "unknown" } : {});
        });
    }
}
attachEngineListeners(engine);

els.load.addEventListener("click", async () => {
    try {
        resetEngineForCurrentMode();
        await engine.load(els.url.value.trim(), 0);
    } catch (error) {
        els.diagnostics.textContent = JSON.stringify({
            category: error?.category || "unknown",
            message: error?.message || "load failed"
        }, null, 2);
    }
});
els.play.addEventListener("click", () => engine.play().catch((error) => {
    els.diagnostics.textContent = JSON.stringify({ category: error?.category || "unknown" }, null, 2);
}));
els.pause.addEventListener("click", () => engine.pause());
els.seek.addEventListener("click", () => engine.seek(30));

globalThis.__mediabunnyHarness = {
    get engine() { return engine; },
    load: (url, startTime = 0, options = {}) => {
        if (options.relay) {
            els.modeRelay.checked = true;
            if (options.relayBaseUrl) els.relayBaseUrl.value = options.relayBaseUrl;
            if (options.idToken) els.idToken.value = options.idToken;
        }
        resetEngineForCurrentMode();
        return engine.load(url, startTime);
    },
    play: () => engine.play(),
    pause: () => engine.pause(),
    seek: (time) => engine.seek(time),
    setPlaybackRate: (rate) => engine.setPlaybackRate(rate),
    setVolume: (value) => engine.setVolume(value),
    setMuted: (muted) => engine.setMuted(muted),
    destroy: () => engine.destroy(),
    diagnostics: () => renderDiagnostics(lastEvent),
    canvasPixelSum: getCanvasPixelSum
};
