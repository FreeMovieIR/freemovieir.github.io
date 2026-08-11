const MEDIABUNNY_MODULE_URL = "../vendor/mediabunny/mediabunny.min.mjs";
const MEDIABUNNY_AC3_MODULE_URL = "../vendor/mediabunny-ac3/mediabunny-ac3.min.mjs";
const TIMEUPDATE_MS = 180;
const AUDIO_AHEAD_SECONDS = 1.2;

let ac3Registered = false;

export const MEDIABUNNY_ERROR_CATEGORY = Object.freeze({
    SOURCE_ACCESS: "source-access",
    UNSUPPORTED_VIDEO_CODEC: "unsupported-video-codec",
    UNSUPPORTED_AUDIO_CODEC: "unsupported-audio-codec",
    DECODE: "decode",
    AUDIO_CONTEXT: "audio-context",
    ABORTED: "aborted",
    UNKNOWN: "unknown"
});

export class MediabunnyMkvError extends Error {
    constructor(category, message = category) {
        super(message);
        this.name = "MediabunnyMkvError";
        this.category = category;
        this.retryable = category === MEDIABUNNY_ERROR_CATEGORY.SOURCE_ACCESS;
    }
}

export class MediabunnyMkvEngine extends EventTarget {
    constructor({ video, canvas, config = {}, modules = null, audioContextFactory = null, clock = null, relayFetch = null } = {}) {
        super();
        this.video = video;
        this.canvas = canvas || createCanvasNear(video);
        this.config = config;
        this.modules = modules;
        this.relayFetch = relayFetch;
        this.audioContextFactory = audioContextFactory;
        this.clock = clock || globalThis.performance || Date;
        this.generation = 0;
        this.input = null;
        this.videoTrack = null;
        this.audioTrack = null;
        this.videoSink = null;
        this.audioSink = null;
        this.audioContext = null;
        this.gainNode = null;
        this.audioIterator = null;
        this.videoIterator = null;
        this.nextFrame = null;
        this.audioNodes = new Set();
        this.timers = new Set();
        this.rafId = 0;
        this.playing = false;
        this.playbackTimeAtStart = 0;
        this.clockTimeAtStart = 0;
        this.duration = 0;
        this.firstTimestamp = 0;
        this.endTimestamp = 0;
        this.playbackRate = 1;
        this.volume = 1;
        this.muted = false;
        this.diagnostics = {
            engine: "mediabunny",
            container: "matroska",
            videoCodec: "",
            audioCodec: "",
            videoDecodable: false,
            audioDecodable: false,
            canvasActive: false,
            audioContextState: "",
            generation: this.generation,
            videoFramesQueued: 0,
            audioNodesQueued: 0,
            currentTime: 0,
            duration: 0,
            transport: "direct",
            relayStatus: ""
        };
    }

    async load(url, startTime = 0) {
        const generation = await this.resetForLoad();
        try {
            await this.loadAttempt(url, startTime, generation, "direct");
        } catch (error) {
            const classified = classifyMediabunnyError(error);
            if (classified.category === MEDIABUNNY_ERROR_CATEGORY.SOURCE_ACCESS && this.relayFetch && this.isCurrent(generation)) {
                await this.releaseSourceResources();
                this.diagnostics = {
                    ...this.diagnostics,
                    transport: "relay",
                    relayStatus: "retrying"
                };
                this.dispatch("waiting");
                try {
                    await this.loadAttempt(url, startTime, generation, "relay");
                    return;
                } catch (relayError) {
                    this.deactivateCanvas();
                    if (relayError instanceof MediabunnyMkvError) throw relayError;
                    throw classifyMediabunnyError(relayError);
                }
            }
            this.deactivateCanvas();
            throw classified;
        }
    }

    async loadAttempt(url, startTime, generation, transport) {
        const modules = await this.loadModules();
        if (!this.isCurrent(generation)) return;
        await registerAc3Once(modules);
        const sourceOptions = transport === "relay" && this.relayFetch ? { fetchFn: this.relayFetch } : undefined;
        const input = new modules.Input({
            source: sourceOptions ? new modules.UrlSource(url, sourceOptions) : new modules.UrlSource(url),
            formats: modules.ALL_FORMATS
        });
        this.input = input;
        this.diagnostics.transport = transport;
        this.diagnostics.relayStatus = transport === "relay" ? "active" : "";
        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack) throw new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.UNSUPPORTED_VIDEO_CODEC, "No video track.");
        const audioTrack = await input.getPrimaryAudioTrack();
        this.videoTrack = videoTrack;
        this.audioTrack = audioTrack;

        const [format, tracks, firstTimestamp, metadataDuration, videoCodec, audioCodec, videoDecodable, audioDecodable] = await Promise.all([
            input.getFormat().catch(() => null),
            input.getTracks().catch(() => []),
            input.getFirstTimestamp().catch(() => 0),
            input.getDurationFromMetadata().catch(() => null),
            videoTrack.getCodecParameterString?.().catch(() => "") || videoTrack.getCodec?.().catch(() => ""),
            audioTrack ? (audioTrack.getCodecParameterString?.().catch(() => "") || audioTrack.getCodec?.().catch(() => "")) : Promise.resolve(""),
            videoTrack.canDecode(),
            audioTrack ? audioTrack.canDecode() : Promise.resolve(true)
        ]);
        this.firstTimestamp = finite(firstTimestamp);
        this.duration = finite(metadataDuration) || finite(await input.computeDuration(tracks).catch(() => 0));
        this.endTimestamp = this.firstTimestamp + this.duration;
        this.diagnostics = {
            ...this.diagnostics,
            transport,
            relayStatus: transport === "relay" ? "ready" : "",
            container: format?.name || "matroska",
            videoCodec: String(videoCodec || ""),
            audioCodec: String(audioCodec || ""),
            videoDecodable: Boolean(videoDecodable),
            audioDecodable: Boolean(audioDecodable),
            duration: this.duration
        };
        if (!videoDecodable) {
            throw new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.UNSUPPORTED_VIDEO_CODEC, "Video codec is not decodable in this browser.");
        }
        if (!audioDecodable) {
            throw new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.UNSUPPORTED_AUDIO_CODEC, "Audio codec is not decodable in this browser.");
        }

        this.videoSink = new modules.CanvasSink(videoTrack, { poolSize: 2, fit: "contain" });
        if (audioTrack) {
            this.audioSink = new modules.AudioBufferSink(audioTrack);
            await this.ensureAudioContext(audioTrack);
        }
        this.activateCanvas();
        this.playbackTimeAtStart = clampTime(startTime, this.duration);
        this.dispatch("metadata");
        await this.renderFrameAt(this.playbackTimeAtStart, generation);
        this.dispatch("ready");
    }

    async releaseSourceResources() {
        this.playing = false;
        this.stopScheduledAudio();
        this.clearTimers();
        await this.returnIterators();
        try { this.input?.dispose?.(); } catch {}
        try { await this.audioContext?.close?.(); } catch {}
        this.input = null;
        this.videoTrack = null;
        this.audioTrack = null;
        this.videoSink = null;
        this.audioSink = null;
        this.audioContext = null;
        this.gainNode = null;
        this.nextFrame = null;
    }

    async play() {
        if (!this.input) return;
        const generation = ++this.generation;
        if (this.audioContext?.state === "suspended") {
            try {
                await this.audioContext.resume();
            } catch (error) {
                throw new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.AUDIO_CONTEXT, safeMessage(error));
            }
        }
        if (!this.isCurrent(generation)) return;
        this.playing = true;
        this.clockTimeAtStart = this.now();
        this.dispatch("play");
        this.dispatch("playing");
        this.startTimeupdates(generation);
        this.startVideoLoop(generation);
        this.startAudioLoop(generation);
    }

    pause() {
        if (!this.playing) {
            this.stopScheduledAudio();
            return;
        }
        this.playbackTimeAtStart = this.currentTime;
        this.playing = false;
        this.stopScheduledAudio();
        this.clearTimers();
        this.dispatch("pause");
    }

    async seek(time) {
        const wasPlaying = this.playing;
        const generation = ++this.generation;
        this.playbackTimeAtStart = clampTime(time, this.duration);
        this.clockTimeAtStart = this.now();
        this.stopScheduledAudio();
        await this.returnIterators();
        this.dispatch("waiting");
        await this.renderFrameAt(this.playbackTimeAtStart, generation);
        this.dispatch("seeked");
        if (wasPlaying && this.isCurrent(generation)) await this.play();
    }

    async destroy() {
        this.generation += 1;
        await this.releaseSourceResources();
        this.deactivateCanvas();
        this.updateRuntimeDiagnostics();
    }

    setPlaybackRate(rate) {
        const next = Number(rate);
        if (!Number.isFinite(next) || next <= 0) return;
        const current = this.currentTime;
        this.playbackRate = next;
        this.playbackTimeAtStart = current;
        this.clockTimeAtStart = this.now();
        for (const node of this.audioNodes) {
            try { node.playbackRate.value = next; } catch {}
        }
        if (this.playing) {
            const generation = ++this.generation;
            this.stopScheduledAudio();
            this.returnIterators();
            this.startVideoLoop(generation);
            this.startAudioLoop(generation);
        }
        this.dispatch("ratechange");
    }

    setVolume(value) {
        this.volume = Math.min(1, Math.max(0, Number(value)));
        this.updateGain();
    }

    setMuted(muted) {
        this.muted = Boolean(muted);
        this.updateGain();
    }

    get currentTime() {
        if (!this.playing) return clampTime(this.playbackTimeAtStart, this.duration);
        const elapsed = Math.max(0, this.now() - this.clockTimeAtStart) * this.playbackRate;
        return clampTime(this.playbackTimeAtStart + elapsed, this.duration);
    }

    set currentTime(value) {
        this.seek(Number(value || 0));
    }

    get paused() {
        return !this.playing;
    }

    get readyState() {
        return this.input ? 2 : 0;
    }

    get networkState() {
        return this.input ? 1 : 0;
    }

    get ended() {
        return this.duration > 0 && this.currentTime >= this.duration;
    }

    get currentSrc() {
        return "";
    }

    async loadModules() {
        if (this.modules) return this.modules;
        const [mediabunny, ac3] = await Promise.all([
            import(MEDIABUNNY_MODULE_URL),
            import(MEDIABUNNY_AC3_MODULE_URL)
        ]);
        this.modules = { ...mediabunny, ...ac3 };
        return this.modules;
    }

    async ensureAudioContext(audioTrack) {
        const sampleRate = await audioTrack.getSampleRate?.().catch(() => 0);
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass && !this.audioContextFactory) {
            throw new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.AUDIO_CONTEXT, "AudioContext is unavailable.");
        }
        this.audioContext = this.audioContextFactory
            ? this.audioContextFactory({ sampleRate })
            : new AudioContextClass(sampleRate ? { sampleRate } : undefined);
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.updateGain();
        this.diagnostics.audioContextState = this.audioContext.state || "";
    }

    startTimeupdates(generation) {
        const tick = () => {
            if (!this.isCurrent(generation) || !this.playing) return;
            this.dispatch("timeupdate");
            if (this.ended) {
                this.playing = false;
                this.stopScheduledAudio();
                this.dispatch("ended");
                return;
            }
            this.setTimer(tick, TIMEUPDATE_MS);
        };
        tick();
    }

    async startVideoLoop(generation) {
        if (!this.videoSink) return;
        try {
            this.videoIterator = this.videoSink.canvases(this.firstTimestamp + this.currentTime, this.endTimestamp);
            this.nextFrame = null;
            const loop = async () => {
                if (!this.isCurrent(generation) || !this.playing) return;
                if (!this.nextFrame) {
                    const result = await this.videoIterator.next();
                    if (!this.isCurrent(generation) || !this.playing) return;
                    if (result.done) return;
                    this.nextFrame = result.value;
                }
                const frameTime = finite(this.nextFrame.timestamp) - this.firstTimestamp;
                if (frameTime <= this.currentTime + 0.02) {
                    this.drawWrappedCanvas(this.nextFrame);
                    this.nextFrame = null;
                }
                this.updateRuntimeDiagnostics();
                this.rafId = globalThis.requestAnimationFrame?.(loop) || this.setTimer(loop, 16);
            };
            loop();
        } catch (error) {
            if (this.isCurrent(generation)) this.dispatch("error", classifyMediabunnyError(error));
        }
    }

    async startAudioLoop(generation) {
        if (!this.audioSink || !this.audioContext || !this.gainNode) return;
        this.audioIterator = this.audioSink.buffers(this.firstTimestamp + this.currentTime, this.endTimestamp);
        const schedule = async () => {
            if (!this.isCurrent(generation) || !this.playing) return;
            try {
                while (this.audioNodes.size < 12) {
                    const next = await this.audioIterator.next();
                    if (!this.isCurrent(generation) || !this.playing || next.done) return;
                    const wrapped = next.value;
                    const mediaTimestamp = finite(wrapped.timestamp) - this.firstTimestamp;
                    const when = this.audioContext.currentTime + Math.max(0, (mediaTimestamp - this.currentTime) / this.playbackRate);
                    if (when - this.audioContext.currentTime > AUDIO_AHEAD_SECONDS) break;
                    const node = this.audioContext.createBufferSource();
                    node.buffer = wrapped.buffer;
                    node.playbackRate.value = this.playbackRate;
                    node.connect(this.gainNode);
                    const cleanupNode = () => {
                        this.audioNodes.delete(node);
                        this.updateRuntimeDiagnostics();
                    };
                    if ("onended" in node) node.onended = cleanupNode;
                    node.addEventListener?.("ended", cleanupNode, { once: true });
                    this.audioNodes.add(node);
                    node.start(when);
                }
                this.updateRuntimeDiagnostics();
            } catch (error) {
                if (this.isCurrent(generation)) this.dispatch("error", classifyMediabunnyError(error));
                return;
            }
            this.setTimer(schedule, 160);
        };
        schedule();
    }

    async renderFrameAt(time, generation) {
        if (!this.videoSink) return;
        const frame = await this.videoSink.getCanvas(this.firstTimestamp + clampTime(time, this.duration)).catch((error) => {
            throw classifyMediabunnyError(error);
        });
        if (!this.isCurrent(generation) || !frame) return;
        this.drawWrappedCanvas(frame);
    }

    drawWrappedCanvas(wrapped) {
        if (!this.canvas || !wrapped?.canvas) return;
        const width = wrapped.canvas.width || wrapped.canvas.videoWidth || this.canvas.width || 1;
        const height = wrapped.canvas.height || wrapped.canvas.videoHeight || this.canvas.height || 1;
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
        const context = this.canvas.getContext?.("2d");
        context?.drawImage?.(wrapped.canvas, 0, 0, this.canvas.width, this.canvas.height);
    }

    async returnIterators() {
        const iterators = [this.audioIterator, this.videoIterator];
        this.audioIterator = null;
        this.videoIterator = null;
        this.nextFrame = null;
        await Promise.all(iterators.map((iterator) => iterator?.return?.().catch?.(() => {})));
    }

    stopScheduledAudio() {
        for (const node of this.audioNodes) {
            try { node.stop(0); } catch {}
            try { node.disconnect?.(); } catch {}
        }
        this.audioNodes.clear();
        this.updateRuntimeDiagnostics();
    }

    updateGain() {
        if (!this.gainNode?.gain) return;
        this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }

    async resetForLoad() {
        await this.destroy();
        this.generation += 1;
        return this.generation;
    }

    activateCanvas() {
        if (this.video) {
            this.video.hidden = true;
            this.video.setAttribute?.("aria-hidden", "true");
            try {
                this.video.pause?.();
                this.video.removeAttribute?.("src");
                this.video.load?.();
            } catch {}
        }
        if (this.canvas) {
            this.canvas.hidden = false;
            this.canvas.dataset.mediaEngine = "mediabunny";
        }
        this.diagnostics.canvasActive = true;
    }

    deactivateCanvas() {
        if (this.canvas) {
            this.canvas.hidden = true;
            delete this.canvas.dataset.mediaEngine;
        }
        if (this.video) {
            this.video.hidden = false;
            this.video.removeAttribute?.("aria-hidden");
        }
        this.diagnostics.canvasActive = false;
    }

    getSafeDiagnostics() {
        this.updateRuntimeDiagnostics();
        return { ...this.diagnostics };
    }

    updateRuntimeDiagnostics() {
        this.diagnostics.currentTime = this.currentTime;
        this.diagnostics.duration = this.duration;
        this.diagnostics.generation = this.generation;
        this.diagnostics.videoFramesQueued = this.nextFrame ? 1 : 0;
        this.diagnostics.audioNodesQueued = this.audioNodes.size;
        this.diagnostics.audioContextState = this.audioContext?.state || "";
    }

    clearTimers() {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        if (this.rafId) {
            globalThis.cancelAnimationFrame?.(this.rafId);
            this.rafId = 0;
        }
    }

    setTimer(fn, ms) {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            fn();
        }, ms);
        timer.unref?.();
        this.timers.add(timer);
        return timer;
    }

    now() {
        if (this.audioTrack && this.audioContext && Number.isFinite(this.audioContext.currentTime)) {
            return this.audioContext.currentTime;
        }
        return typeof this.clock.now === "function" ? this.clock.now() / 1000 : Date.now() / 1000;
    }

    isCurrent(generation) {
        return generation === this.generation;
    }

    dispatch(type, detail = null) {
        this.updateRuntimeDiagnostics();
        this.dispatchEvent(new CustomEvent(type, { detail: detail || this.diagnostics }));
    }
}

async function registerAc3Once(modules) {
    if (ac3Registered) return;
    modules.registerAc3Decoder?.();
    ac3Registered = true;
}

function createCanvasNear(video) {
    const doc = video?.ownerDocument || globalThis.document;
    const canvas = doc?.createElement?.("canvas");
    if (!canvas) return null;
    canvas.hidden = true;
    canvas.className = "mediabunny-canvas";
    canvas.dataset.testid = "mediabunny-canvas";
    video?.after?.(canvas);
    return canvas;
}

function classifyMediabunnyError(error) {
    if (error instanceof MediabunnyMkvError) return error;
    const message = safeMessage(error);
    if (/cors|cross-origin|fetch|network|range|failed to fetch|load|source|request|response|connect|connection|refused|unreachable|err_/i.test(message)) {
        return new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.SOURCE_ACCESS, "The MKV source could not be read by the browser.");
    }
    if (/decode|decoder|codec/i.test(message)) {
        return new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.DECODE, "The MKV source could not be decoded.");
    }
    if (/abort|disposed|cancel/i.test(message)) {
        return new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.ABORTED, "Playback was cancelled.");
    }
    return new MediabunnyMkvError(MEDIABUNNY_ERROR_CATEGORY.UNKNOWN, "MKV playback failed.");
}

function safeMessage(error) {
    const parts = [error?.name, error?.message].filter(Boolean);
    return String(parts.length ? parts.join(" ") : error || "").slice(0, 160);
}

function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function clampTime(value, duration = 0) {
    const time = Math.max(0, finite(value));
    return duration > 0 ? Math.min(time, duration) : time;
}
