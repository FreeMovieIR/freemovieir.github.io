import { MESSAGES, safeLog } from "./utils.js";
import { MICROPHONE_STATES, MicrophoneStateMachine } from "./microphone-state-machine.js";

const VOICE_LABELS = Object.freeze({
    off: "میکروفن خاموش",
    requesting: "درخواست دسترسی...",
    connecting: "در حال اتصال صدا",
    on: "میکروفن روشن",
    muted: "میکروفن بی‌صدا شد",
    connected: "صدای همراه متصل است",
    disconnected: "ارتباط صوتی قطع شد",
    retrying: "تلاش مجدد",
    blocked: "برای شنیدن صدای همراه لمس کنید."
});

export class AudioCall extends EventTarget {
    constructor(roomService, config, remoteAudio) {
        super();
        this.roomService = roomService;
        this.config = config;
        this.remoteAudio = remoteAudio;
        this.peer = null;
        this.localStream = null;
        this.localSender = null;
        this.audioTransceiver = null;
        this.remoteDescriptionSet = false;
        this.pendingCandidates = [];
        this.seenCandidates = new Set();
        this.unsubscribers = [];
        this.remoteVolume = loadLocalNumber("watchPartyVoiceVolume", 1);
        this.remoteMuted = false;
        this.turnCache = null;
        this.generation = 0;
        this.makingOffer = false;
        this.ignoreOffer = false;
        this.iceRestartAttempts = 0;
        this.stateMachine = new MicrophoneStateMachine();
        this.stateMachine.addEventListener("state", (event) => {
            this.dispatchEvent(new CustomEvent("micState", { detail: event.detail }));
        });
        this.applyRemoteVolume();
    }

    async enableMicrophone() {
        return this.stateMachine.run(async ({ isCurrent }) => {
            try {
                if (!isMicrophoneRuntimeAvailable()) throw new DOMException("Microphone unavailable", "NotFoundError");
                this.stateMachine.transition(MICROPHONE_STATES.REQUESTING_PERMISSION);
                this.dispatchState(VOICE_LABELS.requesting);
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: false
                });
                if (!isCurrent()) {
                    stream.getTracks().forEach((track) => track.stop());
                    return false;
                }
                this.localStream?.getTracks().forEach((track) => track.stop());
                this.localStream = stream;
                this.stateMachine.transition(MICROPHONE_STATES.STARTING);
                await this.roomService.updateParticipant({ micEnabled: true, connectionState: VOICE_LABELS.connecting });
                await this.ensurePeer();
                await this.attachLocalTrack();
                this.stateMachine.transition(MICROPHONE_STATES.ON);
                this.dispatchState(VOICE_LABELS.on);
                return true;
            } catch (error) {
                const denied = error.name === "NotAllowedError";
                this.stateMachine.transition(denied ? MICROPHONE_STATES.PERMISSION_DENIED : MICROPHONE_STATES.NO_DEVICE);
                const message = denied ? MESSAGES.micDenied : MESSAGES.micUnavailable;
                this.dispatchEvent(new CustomEvent("error", { detail: message }));
                await this.roomService.updateParticipant({ micEnabled: false, connectionState: message }).catch(() => {});
                return false;
            }
        });
    }

    async disableMicrophone() {
        return this.stateMachine.run(async () => {
            this.stateMachine.transition(MICROPHONE_STATES.STOPPING);
            this.localStream?.getTracks().forEach((track) => track.stop());
            this.localStream = null;
            await this.localSender?.replaceTrack(null).catch(() => {});
            await this.roomService.updateParticipant({ micEnabled: false, connectionState: VOICE_LABELS.off }).catch(() => {});
            this.stateMachine.transition(MICROPHONE_STATES.OFF);
            this.dispatchState(VOICE_LABELS.off);
        });
    }

    setMuted(muted) {
        this.localStream?.getAudioTracks().forEach((track) => {
            track.enabled = !muted;
        });
        this.stateMachine.transition(muted ? MICROPHONE_STATES.MUTED : MICROPHONE_STATES.ON);
        this.roomService.updateParticipant({
            micEnabled: Boolean(this.localStream),
            connectionState: muted ? VOICE_LABELS.muted : VOICE_LABELS.on
        }).catch(() => {});
    }

    async ensurePeer() {
        if (this.peer) return;
        const generation = ++this.generation;
        await this.cleanSignalingIfOwner();
        this.peer = new RTCPeerConnection(await this.buildRtcConfig());
        this.remoteDescriptionSet = false;
        this.pendingCandidates = [];
        this.seenCandidates.clear();
        this.audioTransceiver = this.peer.addTransceiver("audio", { direction: "sendrecv" });
        this.localSender = this.audioTransceiver.sender;

        this.peer.ontrack = (event) => {
            if (generation !== this.generation) return;
            const [stream] = event.streams;
            if (!stream) return;
            this.remoteAudio.srcObject = stream;
            this.applyRemoteVolume();
            this.tryPlayRemoteAudio();
            this.dispatchState(VOICE_LABELS.connected);
        };
        this.peer.onicecandidate = (event) => this.writeCandidate(event.candidate);
        this.peer.onconnectionstatechange = () => this.handleConnectionState();
        this.peer.onnegotiationneeded = async () => {
            if (this.roomService.role !== "owner") return;
            await this.createOffer().catch((error) => this.fail(error));
        };
        this.listenSignaling();
        if (this.roomService.role === "owner") await this.createOffer();
    }

    async attachLocalTrack() {
        if (!this.peer || !this.localStream) return;
        const [track] = this.localStream.getAudioTracks();
        if (!track) return;
        if (!this.localSender) {
            this.audioTransceiver = this.peer.addTransceiver("audio", { direction: "sendrecv" });
            this.localSender = this.audioTransceiver.sender;
        }
        await this.localSender.replaceTrack(track);
        if (this.roomService.role === "owner" && this.peer.signalingState === "stable") await this.createOffer();
    }

    async buildRtcConfig() {
        const legacyBase = this.config.rtcConfig || {};
        const rtc = this.config.rtc || {};
        const baseIce = rtc.iceServers || legacyBase.iceServers || [];
        const optionalTurn = this.config.optionalTurn?.enabled ? this.config.optionalTurn.iceServers || [] : [];
        const endpointTurn = await this.fetchTurnIceServers(rtc.turnCredentialsEndpoint);
        return { ...legacyBase, iceServers: [...baseIce, ...optionalTurn, ...endpointTurn] };
    }

    async fetchTurnIceServers(endpoint) {
        if (!endpoint) return [];
        if (this.turnCache?.expiresAt && this.turnCache.expiresAt > Date.now() + 30000) return this.turnCache.iceServers || [];
        try {
            const url = new URL(endpoint, location.href);
            if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return [];
            const response = await fetch(url.href, { credentials: "omit", cache: "no-store" });
            if (!response.ok) return [];
            const data = await response.json();
            if (!Array.isArray(data.iceServers)) return [];
            this.turnCache = { iceServers: data.iceServers, expiresAt: Number(data.expiresAt || 0) };
            return this.turnCache.iceServers;
        } catch (error) {
            safeLog("turn endpoint unavailable", { error: error.message });
            this.dispatchState("اتصال صوتی با STUN-only ادامه دارد");
            return [];
        }
    }

    async cleanSignalingIfOwner() {
        if (this.roomService.role !== "owner") return;
        const { db } = this.roomService.firebase;
        await db.remove(db.child(this.roomService.roomRef(), "signaling"));
    }

    async createOffer(options = {}) {
        if (!this.peer || this.peer.signalingState !== "stable" || this.makingOffer) return;
        this.makingOffer = true;
        this.stateMachine.transition(MICROPHONE_STATES.NEGOTIATING);
        try {
            const offer = await this.peer.createOffer({ offerToReceiveAudio: true, iceRestart: Boolean(options.iceRestart) });
            await this.peer.setLocalDescription(offer);
            const { db } = this.roomService.firebase;
            await db.set(db.child(this.roomService.roomRef(), "signaling/offer"), {
                type: offer.type,
                sdp: offer.sdp,
                uid: this.roomService.uid,
                createdAt: this.roomService.firebase.serverTimestamp()
            });
        } finally {
            this.makingOffer = false;
        }
    }

    async createAnswer(offer) {
        if (!this.peer) return;
        const offerCollision = this.makingOffer || this.peer.signalingState !== "stable";
        const polite = this.roomService.role === "guest";
        this.ignoreOffer = !polite && offerCollision;
        if (this.ignoreOffer) return;
        await this.peer.setRemoteDescription(new RTCSessionDescription({ type: offer.type, sdp: offer.sdp }));
        this.remoteDescriptionSet = true;
        await this.flushCandidates();
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        const { db } = this.roomService.firebase;
        await db.set(db.child(this.roomService.roomRef(), "signaling/answer"), {
            type: answer.type,
            sdp: answer.sdp,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
        this.stateMachine.transition(this.localStream ? MICROPHONE_STATES.ON : MICROPHONE_STATES.OFF);
    }

    async applyAnswer(answer) {
        if (!this.peer || this.peer.signalingState !== "have-local-offer") return;
        await this.peer.setRemoteDescription(new RTCSessionDescription({ type: answer.type, sdp: answer.sdp }));
        this.remoteDescriptionSet = true;
        await this.flushCandidates();
        this.stateMachine.transition(this.localStream ? MICROPHONE_STATES.ON : MICROPHONE_STATES.OFF);
    }

    listenSignaling() {
        const { db } = this.roomService.firebase;
        const roomRef = this.roomService.roomRef();
        if (this.roomService.role === "guest") {
            this.unsubscribers.push(db.onValue(db.child(roomRef, "signaling/offer"), async (snap) => {
                const offer = snap.val();
                if (offer?.sdp && offer.uid !== this.roomService.uid) {
                    try {
                        await this.ensurePeer();
                        await this.createAnswer(offer);
                    } catch (error) {
                        this.fail(error);
                    }
                }
            }));
            this.listenCandidates("hostCandidates");
        } else {
            this.unsubscribers.push(db.onValue(db.child(roomRef, "signaling/answer"), async (snap) => {
                const answer = snap.val();
                if (answer?.sdp && answer.uid !== this.roomService.uid) {
                    try { await this.applyAnswer(answer); } catch (error) { this.fail(error); }
                }
            }));
            this.listenCandidates("guestCandidates");
        }
    }

    listenCandidates(path) {
        const { db } = this.roomService.firebase;
        this.unsubscribers.push(db.onChildAdded(db.child(this.roomService.roomRef(), `signaling/${path}`), async (snap) => {
            const candidate = snap.val();
            const key = candidate?.candidate || `${candidate?.sdpMid}:${candidate?.sdpMLineIndex}:end`;
            if (!candidate || candidate.uid === this.roomService.uid || this.seenCandidates.has(key)) return;
            this.seenCandidates.add(key);
            if (!candidate.candidate) {
                if (this.remoteDescriptionSet) await this.peer.addIceCandidate(null).catch(() => {});
                return;
            }
            const ice = new RTCIceCandidate(candidate);
            if (!this.remoteDescriptionSet) {
                this.pendingCandidates.push(ice);
                return;
            }
            try { await this.peer.addIceCandidate(ice); } catch (error) { safeLog("ice candidate failed", { error: error.message }); }
        }));
    }

    async flushCandidates() {
        while (this.pendingCandidates.length) {
            await this.peer.addIceCandidate(this.pendingCandidates.shift()).catch((error) => safeLog("queued ice failed", { error: error.message }));
        }
    }

    async writeCandidate(candidate) {
        if (!this.peer) return;
        const { db } = this.roomService.firebase;
        const path = this.roomService.role === "owner" ? "hostCandidates" : "guestCandidates";
        await db.push(db.child(this.roomService.roomRef(), `signaling/${path}`), {
            candidate: candidate?.candidate || "",
            sdpMid: candidate?.sdpMid || "",
            sdpMLineIndex: candidate?.sdpMLineIndex || 0,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    async handleConnectionState() {
        const state = this.peer?.connectionState || "closed";
        const labels = {
            connecting: VOICE_LABELS.connecting,
            connected: VOICE_LABELS.connected,
            disconnected: VOICE_LABELS.disconnected,
            failed: VOICE_LABELS.retrying,
            closed: VOICE_LABELS.off
        };
        await this.roomService.updateParticipant({ connectionState: labels[state] || state }).catch(() => {});
        this.dispatchState(labels[state] || state);
        if (state === "connected") this.iceRestartAttempts = 0;
        if (state === "failed") await this.restartIce();
    }

    async restartIce() {
        try {
            if (this.iceRestartAttempts >= 2) throw new Error("ICE restart limit reached");
            this.iceRestartAttempts += 1;
            this.stateMachine.transition(MICROPHONE_STATES.RECONNECTING);
            this.peer?.restartIce();
            if (this.roomService.role === "owner") await this.createOffer({ iceRestart: true });
        } catch (error) {
            this.fail(error);
        }
    }

    setRemoteVolume(value) {
        this.remoteVolume = Math.max(0, Math.min(1, Number(value)));
        localStorage.setItem("watchPartyVoiceVolume", String(this.remoteVolume));
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

    async tryPlayRemoteAudio() {
        try {
            await this.remoteAudio.play();
        } catch {
            this.dispatchEvent(new CustomEvent("remoteAudioBlocked", { detail: VOICE_LABELS.blocked }));
        }
    }

    unlockRemoteAudio() {
        return this.tryPlayRemoteAudio();
    }

    fail(error) {
        safeLog("webrtc failed", { error: error.message });
        this.stateMachine.transition(MICROPHONE_STATES.FAILED);
        this.dispatchEvent(new CustomEvent("error", { detail: MESSAGES.rtcFailed }));
    }

    dispatchState(message) {
        this.dispatchEvent(new CustomEvent("state", { detail: message }));
    }

    closePeer() {
        this.generation += 1;
        this.stateMachine.cancel();
        this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
        this.peer?.getSenders().forEach((sender) => sender.track?.stop());
        this.peer?.close();
        this.peer = null;
        this.localSender = null;
        this.audioTransceiver = null;
        this.remoteDescriptionSet = false;
        this.pendingCandidates = [];
        this.seenCandidates.clear();
        if (this.remoteAudio) this.remoteAudio.srcObject = null;
    }

    destroy() {
        this.localStream?.getTracks().forEach((track) => track.stop());
        this.localStream = null;
        this.closePeer();
    }
}

function isMicrophoneRuntimeAvailable() {
    return Boolean(
        globalThis.isSecureContext
        && navigator.mediaDevices
        && navigator.mediaDevices.getUserMedia
        && globalThis.RTCPeerConnection
    );
}

function loadLocalNumber(key, fallback) {
    try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
    } catch {
        return fallback;
    }
}
