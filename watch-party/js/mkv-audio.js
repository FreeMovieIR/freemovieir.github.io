import { isLocalHostname, safeLog } from "./utils.js";

const MEDIABUNNY_URL = "../vendor/mediabunny/mediabunny.min.mjs";
const MEDIABUNNY_AC3_URL = "../vendor/mediabunny-ac3/mediabunny-ac3.min.mjs";
const SUPPORTED_AUDIO_CODECS = new Set([
    "aac",
    "opus",
    "vorbis",
    "mp3",
    "flac",
    "ac3",
    "eac3",
    "pcm-s16",
    "pcm-s16be",
    "pcm-s24",
    "pcm-s24be",
    "pcm-s32",
    "pcm-s32be",
    "pcm-f32",
    "pcm-f32be",
    "pcm-u8",
    "pcm-s8"
]);

export const MKV_AUDIO_STATUS = Object.freeze({
    IDLE: "idle",
    INSPECTING: "inspecting",
    READY: "ready",
    NO_AUDIO: "no-audio",
    UNSUPPORTED: "unsupported",
    SUSPENDED: "suspended",
    ERROR: "error"
});

export class MkvAudioCompanion extends EventTarget {
    constructor(video, config = {}) {
        super();
        this.video = video;
        this.config = config;
        this.input = null;
        this.audioContext = null;
        this.gainNode = null;
        this.sink = null;
        this.tracks = [];
        this.selectedTrack = null;
        this.status = MKV_AUDIO_STATUS.IDLE;
        this.generation = 0;
        this.scheduledSources = new Set();
        this.decodeLoopActive = false;
        this.volume = Number(loadLocalNumber("watchPartyMovieVolume", 1));
        this.muted = loadLocalBoolean("watchPartyMovieMuted", false);
        this.metrics = {
            decodedBuffers: 0,
            scheduledBuffers: 0,
            lastTimestamp: null,
            lastDriftSeconds: null,
            lastScheduleTime: null
        };
        this.boundEvents = [
            ["play", () => this.play()],
            ["pause", () => this.pause()],
            ["seeking", () => this.resetScheduling()],
            ["ratechange", () => this.updatePlaybackRate()],
            ["volumechange", () => this.syncVolumeFromVideo()]
        ];
    }

    async load(url, { trackId = null, startTime = 0 } = {}) {
        this.destroy();
        const generation = ++this.generation;
        this.setStatus(MKV_AUDIO_STATUS.INSPECTING, "در حال آماده‌سازی صدا");
        if (!isSecurePlaybackContext()) {
            this.setStatus(MKV_AUDIO_STATUS.UNSUPPORTED, "مرورگر یا اتصال فعلی امکان استفاده از مسیر صدای MKV را ندارد.");
            return this.getDiagnostics();
        }

        try {
            const { Input, MATROSKA, UrlSource, AudioBufferSink } = await loadMediabunny(this.config);
            if (!this.isCurrent(generation)) return this.getDiagnostics();
            this.input = new Input({
                source: new UrlSource(url, {
                    requestInit: { mode: "cors", credentials: "omit" },
                    getRetryDelay: () => null,
                    maxCacheSize: Number(this.config.mkvMaxCacheSize || 32 * 1024 * 1024),
                    parallelism: 2
                }),
                formats: [MATROSKA]
            });
            const audioTracks = await this.input.getAudioTracks();
            if (!this.isCurrent(generation)) return this.getDiagnostics();
            this.tracks = await Promise.all(audioTracks.map((track) => describeAudioTrack(track)));
            if (!this.tracks.length) {
                this.setStatus(MKV_AUDIO_STATUS.NO_AUDIO, "این فایل ترک صوتی ندارد");
                return this.getDiagnostics();
            }
            const selected = chooseAudioTrack(this.tracks, trackId);
            this.selectedTrack = selected;
            const realTrack = audioTracks.find((track) => String(track.id) === String(selected?.id));
            if (!realTrack || !selected.supported) {
                this.setStatus(MKV_AUDIO_STATUS.UNSUPPORTED, unsupportedTrackMessage(selected));
                return this.getDiagnostics();
            }
            this.sink = new AudioBufferSink(realTrack);
            this.ensureAudioGraph();
            this.boundEvents.forEach(([type, listener]) => this.video.addEventListener(type, listener));
            this.video.muted = true;
            this.video.currentTime = Number.isFinite(startTime) ? startTime : 0;
            this.setStatus(MKV_AUDIO_STATUS.READY, "صدا آماده است");
            if (!this.video.paused) this.play();
            return this.getDiagnostics();
        } catch (error) {
            safeLog("mkv audio setup failed", { error: error.message });
            this.setStatus(MKV_AUDIO_STATUS.ERROR, "آماده‌سازی صدای MKV انجام نشد. ممکن است CORS یا کدک فایل پشتیبانی نشود.");
            return this.getDiagnostics();
        }
    }

    async play() {
        if (!this.sink || !this.audioContext || this.status !== MKV_AUDIO_STATUS.READY) return;
        if (this.audioContext.state === "suspended") {
            try {
                await this.audioContext.resume();
            } catch {
                this.setStatus(MKV_AUDIO_STATUS.SUSPENDED, "صدا توسط مرورگر متوقف شده؛ برای ادامه کلیک کنید");
                return;
            }
        }
        if (this.audioContext.state !== "running") {
            this.setStatus(MKV_AUDIO_STATUS.SUSPENDED, "صدا توسط مرورگر متوقف شده؛ برای ادامه کلیک کنید");
            return;
        }
        this.decodeLoop();
    }

    pause() {
        this.stopScheduledSources();
    }

    setVolume(value) {
        this.volume = clamp(Number(value), 0, 1);
        localStorage.setItem("watchPartyMovieVolume", String(this.volume));
        this.applyGain();
    }

    setMuted(muted) {
        this.muted = Boolean(muted);
        localStorage.setItem("watchPartyMovieMuted", this.muted ? "1" : "0");
        this.applyGain();
    }

    selectTrack(trackId) {
        return this.load(this.video.currentSrc || this.video.src, { trackId, startTime: this.video.currentTime || 0 });
    }

    getDiagnostics() {
        return {
            status: this.status,
            tracks: this.tracks,
            selectedTrackId: this.selectedTrack?.id ?? null,
            selectedCodec: this.selectedTrack?.codec ?? null,
            audioContextState: this.audioContext?.state || null,
            volume: this.volume,
            muted: this.muted,
            metrics: { ...this.metrics }
        };
    }

    destroy() {
        this.generation += 1;
        this.decodeLoopActive = false;
        this.boundEvents.forEach(([type, listener]) => this.video.removeEventListener(type, listener));
        this.stopScheduledSources();
        this.input?.dispose?.();
        this.input = null;
        this.sink = null;
        this.tracks = [];
        this.selectedTrack = null;
        this.gainNode?.disconnect();
        this.gainNode = null;
        this.audioContext?.close?.().catch(() => {});
        this.audioContext = null;
        this.status = MKV_AUDIO_STATUS.IDLE;
    }

    async decodeLoop() {
        if (this.decodeLoopActive) return;
        this.decodeLoopActive = true;
        const generation = this.generation;
        let cursor = Math.max(0, this.video.currentTime || 0);
        try {
            while (this.isCurrent(generation) && !this.video.paused && this.sink && this.audioContext?.state === "running") {
                const ahead = this.scheduledAheadSeconds();
                if (ahead > 1.6) {
                    await sleep(120);
                    continue;
                }
                const wrapped = await this.sink.getBuffer(cursor, { skipLiveWait: true });
                if (!this.isCurrent(generation) || !wrapped) {
                    await sleep(80);
                    cursor += 0.08;
                    continue;
                }
                this.metrics.decodedBuffers += 1;
                if (wrapped.timestamp + wrapped.duration < this.video.currentTime - 0.15) {
                    cursor = Math.max(this.video.currentTime, wrapped.timestamp + wrapped.duration);
                    continue;
                }
                this.scheduleBuffer(wrapped);
                cursor = Math.max(cursor + 0.01, wrapped.timestamp + wrapped.duration);
            }
        } catch (error) {
            if (this.isCurrent(generation)) {
                safeLog("mkv audio decode loop failed", { error: error.message });
                this.setStatus(MKV_AUDIO_STATUS.ERROR, "پخش صدای MKV متوقف شد.");
            }
        } finally {
            this.decodeLoopActive = false;
        }
    }

    scheduleBuffer(wrapped) {
        const source = this.audioContext.createBufferSource();
        source.buffer = wrapped.buffer;
        source.playbackRate.value = this.video.playbackRate || 1;
        source.connect(this.gainNode);
        const mediaDelta = (wrapped.timestamp - (this.video.currentTime || 0)) / (this.video.playbackRate || 1);
        const when = Math.max(this.audioContext.currentTime + 0.02, this.audioContext.currentTime + mediaDelta);
        source.onended = () => this.scheduledSources.delete(source);
        this.scheduledSources.add(source);
        source.start(when);
        this.metrics.scheduledBuffers += 1;
        this.metrics.lastTimestamp = wrapped.timestamp;
        this.metrics.lastScheduleTime = when;
        this.metrics.lastDriftSeconds = wrapped.timestamp - (this.video.currentTime || 0);
    }

    scheduledAheadSeconds() {
        if (!this.metrics.lastTimestamp) return 0;
        return Math.max(0, this.metrics.lastTimestamp - (this.video.currentTime || 0));
    }

    resetScheduling() {
        this.stopScheduledSources();
        this.decodeLoopActive = false;
        if (!this.video.paused) this.decodeLoop();
    }

    updatePlaybackRate() {
        this.scheduledSources.forEach((source) => {
            try { source.playbackRate.value = this.video.playbackRate || 1; } catch {}
        });
        this.resetScheduling();
    }

    syncVolumeFromVideo() {
        if (!this.video.muted) this.setMuted(false);
        this.setVolume(this.video.volume);
    }

    ensureAudioGraph() {
        if (!this.audioContext) {
            const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
            this.audioContext = new AudioContextCtor();
        }
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.applyGain();
    }

    applyGain() {
        if (this.gainNode) this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }

    stopScheduledSources() {
        this.scheduledSources.forEach((source) => {
            try { source.stop(); } catch {}
            try { source.disconnect(); } catch {}
        });
        this.scheduledSources.clear();
    }

    setStatus(status, message) {
        this.status = status;
        this.dispatchEvent(new CustomEvent("status", { detail: { status, message, diagnostics: this.getDiagnostics() } }));
    }

    isCurrent(generation) {
        return generation === this.generation;
    }
}

export async function inspectMkvAudioTracks(url, config = {}) {
    const { Input, MATROSKA, UrlSource } = await loadMediabunny(config);
    const input = new Input({
        source: new UrlSource(url, {
            requestInit: { mode: "cors", credentials: "omit" },
            getRetryDelay: () => null,
            maxCacheSize: Number(config.mkvMaxCacheSize || 32 * 1024 * 1024)
        }),
        formats: [MATROSKA]
    });
    try {
        const tracks = await input.getAudioTracks();
        return Promise.all(tracks.map((track) => describeAudioTrack(track)));
    } finally {
        input.dispose();
    }
}

async function describeAudioTrack(track) {
    const [codec, codecParameter, internalCodecId, language, title, channelCount, sampleRate, disposition, decoderConfig, canDecode] = await Promise.all([
        track.getCodec().catch(() => null),
        track.getCodecParameterString().catch(() => null),
        track.getInternalCodecId().catch(() => null),
        track.getLanguageCode().catch(() => "und"),
        track.getName().catch(() => null),
        track.getNumberOfChannels().catch(() => null),
        track.getSampleRate().catch(() => null),
        track.getDisposition().catch(() => ({})),
        track.getDecoderConfig().catch(() => null),
        track.canDecode().catch(() => false)
    ]);
    const supported = Boolean(canDecode && codec && SUPPORTED_AUDIO_CODECS.has(codec));
    return {
        id: String(track.id),
        number: track.number,
        codec,
        codecParameter,
        internalCodecId: formatInternalCodecId(internalCodecId),
        language,
        title,
        channelCount,
        sampleRate,
        default: Boolean(disposition?.default || disposition?.primary),
        forced: Boolean(disposition?.forced),
        browserCanDecode: Boolean(canDecode),
        supported,
        decoderConfig: decoderConfig ? {
            codec: decoderConfig.codec,
            numberOfChannels: decoderConfig.numberOfChannels,
            sampleRate: decoderConfig.sampleRate
        } : null
    };
}

async function loadMediabunny(config = {}) {
    if (cachedModules) return cachedModules;
    const mediaUrl = config.mediabunny?.moduleUrl || MEDIABUNNY_URL;
    const ac3Url = config.mediabunny?.ac3ModuleUrl || MEDIABUNNY_AC3_URL;
    const [mediabunny, ac3] = await Promise.all([import(mediaUrl), import(ac3Url)]);
    ac3.registerAc3Decoder?.();
    cachedModules = mediabunny;
    return cachedModules;
}

let cachedModules = null;

function chooseAudioTrack(tracks, requestedId) {
    if (requestedId) {
        const requested = tracks.find((track) => String(track.id) === String(requestedId));
        if (requested) return requested;
    }
    return tracks.find((track) => track.default && track.supported)
        || tracks.find((track) => track.supported)
        || tracks[0]
        || null;
}

function unsupportedTrackMessage(track) {
    if (!track) return "این فایل ترک صوتی ندارد";
    const codec = String(track.codec || track.internalCodecId || "").toLowerCase();
    if (codec.includes("dts")) return "صدای این فایل با DTS فشرده شده و نسخه مرورگری پلیر فعلاً امکان پخش آن را ندارد.";
    return "تصویر فیلم قابل پخش است، اما کدک صدای این نسخه پشتیبانی نمی‌شود.";
}

function formatInternalCodecId(value) {
    if (value instanceof Uint8Array) return Array.from(value).map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    return value == null ? null : String(value);
}

function isSecurePlaybackContext() {
    return Boolean(globalThis.isSecureContext || isLocalHostname(globalThis.location?.hostname || ""));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadLocalNumber(key, fallback) {
    try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function loadLocalBoolean(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value === "1";
    } catch {
        return fallback;
    }
}
