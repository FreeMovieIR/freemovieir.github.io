import { MICROPHONE_STATES, VOICE_STATES, VOICE_LABELS } from "./voice-state.js";
import { MESSAGES } from "../utils.js";

const AUDIO_CONSTRAINTS = Object.freeze({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
});

export class VoiceMedia extends EventTarget {
    constructor(remoteAudio, stateMachine, options = {}) {
        super();
        this.remoteAudio = remoteAudio;
        this.stateMachine = stateMachine;
        this.getUserMedia = options.getUserMedia || globalThis.navigator?.mediaDevices?.getUserMedia?.bind(globalThis.navigator.mediaDevices);
        this.MediaStream = options.MediaStream || globalThis.MediaStream;
        this.sender = null;
        this.localStream = null;
        this.localTrack = null;
        this.remoteStream = null;
        this.remoteTrack = null;
        this.onReplaceTrack = typeof options.onReplaceTrack === "function" ? options.onReplaceTrack : () => {};
        this.remoteVolume = loadLocalNumber("watchPartyVoiceVolume", 1);
        this.remoteMuted = false;
        this.playAttemptCount = 0;
        this.unlockAttemptCount = 0;
        this.lastPlayRejection = "";
        this.applyRemoteVolume();
    }

    setSender(sender) {
        this.sender = sender || null;
    }

    async enableMicrophone() {
        if (!isMicrophoneRuntimeAvailable(this.getUserMedia)) {
            this.stateMachine.setMicrophoneState(MICROPHONE_STATES.UNAVAILABLE);
            this.dispatchEvent(new CustomEvent("userError", { detail: MESSAGES.micUnavailable }));
            return false;
        }
        this.stateMachine.setMicrophoneState(MICROPHONE_STATES.REQUESTING);
        try {
            const stream = await this.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
            const [track] = stream?.getAudioTracks?.() || [];
            if (!track || track.readyState !== "live") {
                stopStream(stream);
                throw new DOMException("Microphone unavailable", "NotFoundError");
            }
            stopStream(this.localStream);
            this.localStream = stream;
            this.localTrack = track;
            await this.replaceSenderTrack(track);
            this.stateMachine.setMicrophoneState(MICROPHONE_STATES.ON);
            return true;
        } catch (error) {
            stopStream(this.localStream);
            this.localStream = null;
            this.localTrack = null;
            const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
            this.stateMachine.setMicrophoneState(denied ? MICROPHONE_STATES.DENIED : MICROPHONE_STATES.UNAVAILABLE);
            this.dispatchEvent(new CustomEvent("userError", { detail: denied ? MESSAGES.micDenied : MESSAGES.micUnavailable }));
            return false;
        }
    }

    async disableMicrophone() {
        await this.replaceSenderTrack(null).catch(() => {});
        stopStream(this.localStream);
        this.localStream = null;
        this.localTrack = null;
        this.stateMachine.setMicrophoneState(MICROPHONE_STATES.OFF);
    }

    setMuted(muted) {
        if (this.localTrack) this.localTrack.enabled = !muted;
        this.stateMachine.setMicrophoneState(muted && this.localTrack ? MICROPHONE_STATES.MUTED : this.localTrack ? MICROPHONE_STATES.ON : MICROPHONE_STATES.OFF);
    }

    attachRemoteTrack(track, streams = []) {
        if (!track) return;
        this.remoteTrack = track;
        const [stream] = streams || [];
        if (stream) {
            this.remoteStream = stream;
        } else if (this.MediaStream) {
            this.remoteStream = new this.MediaStream();
            this.remoteStream.addTrack(track);
        }
        if (this.remoteAudio && this.remoteStream) {
            this.remoteAudio.srcObject = this.remoteStream;
            this.applyRemoteVolume();
            this.tryPlayRemoteAudio({ unlock: false });
        }
    }

    async tryPlayRemoteAudio({ unlock = false } = {}) {
        if (!this.remoteAudio?.srcObject || typeof this.remoteAudio.play !== "function") return true;
        this.playAttemptCount += 1;
        if (unlock) this.unlockAttemptCount += 1;
        try {
            await this.remoteAudio.play();
            this.lastPlayRejection = "";
            this.stateMachine.transition(VOICE_STATES.CONNECTED, { remoteAudioBlocked: false });
            return true;
        } catch (error) {
            this.lastPlayRejection = error?.name || "play-rejected";
            this.stateMachine.transition(VOICE_STATES.REMOTE_AUDIO_BLOCKED, { remoteAudioBlocked: true });
            this.dispatchEvent(new CustomEvent("remoteAudioBlocked", { detail: VOICE_LABELS.remoteAudioBlocked }));
            return false;
        }
    }

    unlockRemoteAudio() {
        return this.tryPlayRemoteAudio({ unlock: true });
    }

    setRemoteVolume(value) {
        this.remoteVolume = Math.max(0, Math.min(1, Number(value)));
        try { localStorage.setItem("watchPartyVoiceVolume", String(this.remoteVolume)); } catch {}
        this.applyRemoteVolume();
    }

    setRemoteMuted(muted) {
        this.remoteMuted = Boolean(muted);
        this.applyRemoteVolume();
    }

    applyRemoteVolume() {
        if (!this.remoteAudio) return;
        this.remoteAudio.volume = this.remoteMuted ? 0 : this.remoteVolume;
        this.remoteAudio.muted = Boolean(this.remoteMuted);
    }

    async replaceSenderTrack(track) {
        if (!this.sender?.replaceTrack) return;
        this.onReplaceTrack(track);
        await this.sender.replaceTrack(track);
    }

    destroy() {
        stopStream(this.localStream);
        this.localStream = null;
        this.localTrack = null;
        this.sender = null;
        this.remoteTrack = null;
        this.remoteStream = null;
        if (this.remoteAudio) this.remoteAudio.srcObject = null;
        this.stateMachine.setMicrophoneState(MICROPHONE_STATES.OFF);
    }

    diagnostics() {
        return {
            senderTrackState: this.sender?.track?.readyState || this.localTrack?.readyState || "",
            remoteTrackState: this.remoteTrack?.readyState || "",
            remoteAudioPaused: Boolean(this.remoteAudio?.paused),
            remoteAudioBlocked: Boolean(this.lastPlayRejection),
            playAttemptCount: this.playAttemptCount,
            unlockAttemptCount: this.unlockAttemptCount,
            localLiveAudioTrackCount: this.localTrack?.readyState === "live" ? 1 : 0,
            remoteReceivedTrackCount: this.remoteTrack && this.remoteTrack.readyState !== "ended" ? 1 : 0
        };
    }
}

function isMicrophoneRuntimeAvailable(getUserMedia) {
    return Boolean(getUserMedia && globalThis.RTCPeerConnection);
}

function stopStream(stream) {
    stream?.getTracks?.().forEach((track) => track.stop());
}

function loadLocalNumber(key, fallback) {
    try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
    } catch {
        return fallback;
    }
}
