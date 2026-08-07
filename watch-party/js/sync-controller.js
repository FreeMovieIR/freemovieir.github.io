import { clamp, serverNow, safeLog } from "./utils.js";

export function expectedPlaybackTime(playback, offsetMs = 0, nowMs = serverNow(offsetMs)) {
    const base = Number(playback?.currentTime || 0);
    if (!playback || playback.paused) return base;
    const updatedAt = typeof playback.updatedAt === "number" ? playback.updatedAt : nowMs;
    const elapsed = Math.max(0, (nowMs - updatedAt) / 1000);
    return base + elapsed * (playback.playbackRate || 1);
}

export function getDriftCorrection({ expected, currentTime, duration, paused, targetRate, config = {} }) {
    if (!Number.isFinite(expected) || !duration) return { type: "none" };
    const drift = expected - currentTime;
    const absMs = Math.abs(drift * 1000);
    const small = config.smallDriftMs || 250;
    const hard = config.hardSeekDriftMs || 1000;
    if (absMs < small) return { type: "none", drift };
    if (absMs >= hard || paused) return { type: "seek", currentTime: clamp(expected, 0, duration || expected), drift };
    const delta = config.softCorrectionRateDelta || 0.06;
    return { type: "rate", playbackRate: clamp(targetRate + (drift > 0 ? delta : -delta), 0.5, 2), drift };
}

export class SyncController extends EventTarget {
    constructor(video, roomService, config) {
        super();
        this.video = video;
        this.roomService = roomService;
        this.config = config.sync || {};
        this.isApplyingRemoteState = false;
        this.lastRevision = 0;
        this.heartbeatTimer = null;
        this.originalRateTimer = null;
        this.bufferPauseRequested = false;
    }

    attach() {
        this.video.addEventListener("play", () => this.broadcastUserAction("play"));
        this.video.addEventListener("pause", () => this.broadcastUserAction("pause"));
        this.video.addEventListener("seeked", () => this.broadcastUserAction("seek"));
        this.video.addEventListener("ratechange", () => this.broadcastUserAction("rate"));
    }

    startHeartbeat(isAuthority) {
        clearInterval(this.heartbeatTimer);
        if (!isAuthority) return;
        this.heartbeatTimer = setInterval(() => {
            if (!this.video.paused && !this.isApplyingRemoteState) {
                this.broadcast("heartbeat", false, "playing");
            }
        }, this.config.heartbeatMs || 5000);
    }

    async broadcastUserAction(action) {
        if (this.isApplyingRemoteState) return;
        const paused = action === "play" ? false : action === "pause" ? true : this.video.paused;
        const pauseReason = paused ? "manual" : "playing";
        await this.broadcast(action, paused, pauseReason);
    }

    async broadcast(action, paused, pauseReason) {
        await this.roomService.setPlaybackPatch({
            paused,
            pauseReason,
            currentTime: this.video.currentTime || 0,
            playbackRate: this.video.playbackRate || 1,
            action
        });
    }

    async requestBufferPause() {
        if (this.bufferPauseRequested) return;
        this.bufferPauseRequested = true;
        await this.roomService.setPlaybackPatch({
            paused: true,
            pauseReason: "buffer",
            currentTime: this.video.currentTime || 0,
            playbackRate: this.video.playbackRate || 1,
            action: "buffer-pause"
        });
    }

    async resumeAfterBuffer(room) {
        if (!this.bufferPauseRequested || room?.playback?.pauseReason !== "buffer") return;
        const participants = Object.values(room.participants || {});
        const canResume = participants.length === 2 && participants.every((p) => p.online && !p.buffering);
        if (!canResume) return;
        this.bufferPauseRequested = false;
        await this.roomService.setPlaybackPatch({
            paused: false,
            pauseReason: "playing",
            currentTime: this.video.currentTime || 0,
            playbackRate: this.video.playbackRate || 1,
            action: "buffer-resume"
        });
    }

    async apply(playback, offsetMs) {
        if (!playback || playback.updatedBy === this.roomService.uid || playback.revision <= this.lastRevision) return;
        this.lastRevision = playback.revision;
        this.isApplyingRemoteState = true;
        try {
            const expected = this.expectedTime(playback, offsetMs);
            this.correctDrift(expected, playback.playbackRate || 1);
            if (this.video.playbackRate !== playback.playbackRate) this.video.playbackRate = playback.playbackRate || 1;
            if (playback.paused) {
                if (!this.video.paused) this.video.pause();
                this.video.currentTime = expected;
            } else if (this.video.paused) {
                this.video.currentTime = expected;
                try {
                    await this.video.play();
                } catch {
                    this.dispatchEvent(new CustomEvent("autoplay"));
                }
            }
        } catch (error) {
            safeLog("apply playback failed", { error: error.message });
        } finally {
            setTimeout(() => {
                this.isApplyingRemoteState = false;
            }, 80);
        }
    }

    expectedTime(playback, offsetMs) {
        return expectedPlaybackTime(playback, offsetMs);
    }

    correctDrift(expected, targetRate) {
        const correction = getDriftCorrection({
            expected,
            currentTime: this.video.currentTime,
            duration: this.video.duration,
            paused: this.video.paused,
            targetRate,
            config: this.config
        });
        if (correction.type === "none") return;
        if (correction.type === "seek") {
            this.video.currentTime = correction.currentTime;
            return;
        }
        clearTimeout(this.originalRateTimer);
        this.video.playbackRate = correction.playbackRate;
        this.originalRateTimer = setTimeout(() => {
            this.video.playbackRate = targetRate;
        }, 1800);
    }

    destroy() {
        clearInterval(this.heartbeatTimer);
        clearTimeout(this.originalRateTimer);
    }
}
