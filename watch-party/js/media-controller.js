import { isHlsUrl, isHttpsUrl, MESSAGES, safeLog } from "./utils.js";
import { classifyMediaElementError, diagnoseMediaElement, MEDIA_ADAPTERS, MEDIA_ERROR_KIND, selectMediaAdapter } from "./media-probe.js";
import { MkvAudioCompanion } from "./mkv-audio.js";

const HLS_VERSION = "1.5.13";
const HLS_URL = `https://cdn.jsdelivr.net/npm/hls.js@${HLS_VERSION}/dist/hls.min.js`;

export class MediaController extends EventTarget {
    constructor(video, config = {}) {
        super();
        this.video = video;
        this.config = config;
        this.hls = null;
        this.abortController = null;
        this.generation = 0;
        this.diagnostics = null;
        this.mkvAudio = new MkvAudioCompanion(video, config);
        this.mkvAudio.addEventListener("status", (event) => {
            this.updateDiagnostics(this.lastSelection, MEDIA_ADAPTERS.MKV, {
                mkvAudio: event.detail.diagnostics
            });
            this.dispatchEvent(new CustomEvent("audioStatus", { detail: event.detail }));
        });
    }

    async load(url, startTime = 0, options = {}) {
        const generation = this.destroySource();
        if (!url) return;
        if (!isHttpsUrl(url)) throw new Error(MESSAGES.insecureUrl);

        const selection = selectMediaAdapter(url, {
            pageHostname: globalThis.location?.hostname || "",
            baseHref: globalThis.location?.href || "http://localhost/"
        });
        this.lastSelection = selection;
        this.updateDiagnostics(selection, MEDIA_ADAPTERS.NATIVE);

        if (selection.adapter === MEDIA_ADAPTERS.UNSUPPORTED) throw new Error(MESSAGES.invalidUrl);
        this.abortController = new AbortController();
        if (selection.adapter === MEDIA_ADAPTERS.MKV) {
            this.updateDiagnostics(selection, MEDIA_ADAPTERS.MKV, { mkvProbeStatus: "native-compatibility-attempt" });
            try {
                await this.loadNative(url, startTime, generation, selection, MEDIA_ADAPTERS.MKV);
                if (!this.isCurrent(generation)) return;
                const audioDiagnostics = await this.mkvAudio.load(url, {
                    trackId: options.audioTrackId,
                    startTime
                });
                this.updateDiagnostics(selection, MEDIA_ADAPTERS.MKV, {
                    mkvProbeStatus: "native-compatibility-with-mkv-audio",
                    mkvAudio: audioDiagnostics
                });
                this.dispatchEvent(new CustomEvent("audioTracks", { detail: audioDiagnostics }));
                return;
            } catch (error) {
                this.updateDiagnostics(selection, MEDIA_ADAPTERS.MKV, { mkvProbeStatus: "native-compatibility-failed" });
                throw new Error(`${MESSAGES.mkvLimited} ${error.message || ""}`.trim());
            }
        }
        if (selection.adapter === MEDIA_ADAPTERS.HLS && !this.video.canPlayType("application/vnd.apple.mpegurl")) {
            this.updateDiagnostics(selection, MEDIA_ADAPTERS.HLS);
            await this.loadHls(url, generation);
            return;
        }

        await this.loadNative(url, startTime, generation, selection, MEDIA_ADAPTERS.NATIVE);
    }

    async loadNative(url, startTime, generation, selection, adapter = MEDIA_ADAPTERS.NATIVE) {
        this.video.removeAttribute("crossorigin");
        this.video.preload = "metadata";
        const timeoutMs = Number(this.config.nativeMetadataTimeoutMs || 15000);
        const signal = this.abortController.signal;

        const result = await new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                clearTimeout(timer);
                this.video.removeEventListener("loadedmetadata", ready);
                this.video.removeEventListener("canplay", ready);
                this.video.removeEventListener("error", fail);
            };
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                cleanup();
                fn(value);
            };
            const ready = () => finish(resolve, { ok: true });
            const fail = () => finish(reject, makeMediaError(this.video));
            const timer = setTimeout(() => finish(reject, makeMediaError(this.video, true)), timeoutMs);
            signal.addEventListener("abort", () => finish(reject, new DOMException("Media load cancelled", "AbortError")), { once: true });
            this.video.addEventListener("loadedmetadata", ready);
            this.video.addEventListener("canplay", ready);
            this.video.addEventListener("error", fail);
            this.video.src = url;
            this.video.load();
        });

        if (!this.isCurrent(generation)) return result;
        if (Number.isFinite(startTime) && startTime > 0) {
            this.video.currentTime = Math.min(startTime, this.video.duration || startTime);
        }
        this.updateDiagnostics(selection, adapter);
        this.dispatchEvent(new CustomEvent("ready", { detail: this.diagnostics }));
        return result;
    }

    async loadHls(url, generation) {
        await this.ensureHlsScript();
        if (!this.isCurrent(generation)) return;
        if (!window.Hls?.isSupported()) {
            await this.loadNative(url, 0, generation, selectMediaAdapter(url));
            return;
        }
        this.hls = new window.Hls({ enableWorker: true });
        this.hls.on(window.Hls.Events.ERROR, (_, data) => {
            if (data?.fatal) this.dispatchEvent(new CustomEvent("error", { detail: MESSAGES.network }));
        });
        this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            if (!this.isCurrent(generation)) return;
            this.updateDiagnostics(selectMediaAdapter(url), MEDIA_ADAPTERS.HLS);
            this.dispatchEvent(new CustomEvent("ready", { detail: this.diagnostics }));
        });
        this.hls.loadSource(url);
        this.hls.attachMedia(this.video);
    }

    ensureHlsScript() {
        if (window.Hls) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = HLS_URL;
            script.crossOrigin = "anonymous";
            script.onload = resolve;
            script.onerror = () => reject(new Error(MESSAGES.unsupportedFormat));
            document.head.append(script);
        });
    }

    updateDiagnostics(selection, adapter, extra = {}) {
        this.diagnostics = {
            adapter,
            reason: selection?.reason || "",
            ...diagnoseMediaElement(this.video, selection?.parsed),
            canPlayType: selection?.parsed?.mimeHint ? this.video.canPlayType(selection.parsed.mimeHint) : "",
            ...extra
        };
        if (globalThis.location?.hostname === "localhost" || globalThis.location?.hostname === "127.0.0.1") {
            globalThis.__watchPartyMediaDiagnostics = this.diagnostics;
            safeLog("media diagnostics", this.diagnostics);
        }
    }

    destroySource() {
        this.generation += 1;
        const generation = this.generation;
        this.abortController?.abort();
        this.abortController = null;
        this.mkvAudio?.destroy();
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        try {
            this.video.pause();
            this.video.removeAttribute("src");
            this.video.removeAttribute("crossorigin");
            this.video.load();
        } catch {}
        return generation;
    }

    setMovieVolume(value) {
        this.video.volume = Math.min(1, Math.max(0, Number(value)));
        this.mkvAudio?.setVolume(this.video.volume);
    }

    setMovieMuted(muted) {
        if (this.diagnostics?.adapter === MEDIA_ADAPTERS.MKV && this.mkvAudio?.status === "ready") {
            this.mkvAudio.setMuted(Boolean(muted));
            this.video.muted = true;
            return;
        }
        this.video.muted = Boolean(muted);
    }

    selectAudioTrack(trackId) {
        return this.mkvAudio?.selectTrack(trackId);
    }

    isCurrent(generation) {
        return generation === this.generation;
    }
}

function makeMediaError(video, timeout = false) {
    const kind = classifyMediaElementError(video, timeout);
    const messages = {
        [MEDIA_ERROR_KIND.NETWORK]: MESSAGES.network,
        [MEDIA_ERROR_KIND.DECODE]: MESSAGES.decoding,
        [MEDIA_ERROR_KIND.SOURCE_NOT_SUPPORTED]: MESSAGES.unsupportedFormat,
        [MEDIA_ERROR_KIND.TIMEOUT]: MESSAGES.mediaTimeout,
        [MEDIA_ERROR_KIND.ABORTED]: MESSAGES.expiredMedia,
        [MEDIA_ERROR_KIND.EXPIRED_OR_DENIED]: MESSAGES.expiredMedia,
        [MEDIA_ERROR_KIND.UNKNOWN]: MESSAGES.expiredMedia
    };
    return new Error(messages[kind] || MESSAGES.expiredMedia);
}
