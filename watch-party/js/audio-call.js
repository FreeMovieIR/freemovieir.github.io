import { isLocalHostname, MESSAGES, safeLog } from "./utils.js";
import { MICROPHONE_STATES, MicrophoneStateMachine } from "./microphone-state-machine.js";

const DEFAULT_STUN_SERVERS = Object.freeze([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
]);

const VOICE_LABELS = Object.freeze({
    off: "میکروفن خاموش",
    requesting: "در حال دریافت اجازه",
    preparing: "در حال آماده‌سازی میکروفن",
    connecting: "در حال برقراری اتصال صوتی",
    on: "میکروفن روشن",
    muted: "میکروفن بی‌صدا شد",
    connected: "صدای همراه متصل است",
    blocked: "برای شنیدن صدا لمس کنید",
    relay: "اتصال مستقیم ناموفق؛ در حال استفاده از Relay",
    recovering: "اتصال صوتی در حال بازیابی است",
    failed: "اتصال صوتی برقرار نشد",
    directFailed: "اتصال مستقیم برقرار نشد؛ اتصال امن واسط در حال ایجاد است."
});

export class AudioCall extends EventTarget {
    constructor(roomService, config, remoteAudio, options = {}) {
        super();
        this.roomService = roomService;
        this.config = normalizeRtcConfig(config);
        this.remoteAudio = remoteAudio;
        this.peer = null;
        this.localStream = null;
        this.localSender = null;
        this.audioTransceiver = null;
        this.remoteStream = null;
        this.remoteTracks = new Set();
        this.partnerMicActive = false;
        this.pendingCandidates = [];
        this.seenCandidates = new Set();
        this.unsubscribers = [];
        this.remoteVolume = loadLocalNumber("watchPartyVoiceVolume", 1);
        this.remoteMuted = false;
        this.turnCache = null;
        this.generationId = "";
        this.connectionGeneration = 0;
        this.peerCreateCount = 0;
        this.makingOffer = false;
        this.ignoreOffer = false;
        this.isSettingRemoteAnswerPending = false;
        this.polite = this.roomService.role === "guest";
        this.relayMode = Boolean(options.forceRelay);
        this.relayFallbackAttempted = this.relayMode;
        this.iceRestartAttempts = 0;
        this.connectionTimer = null;
        this.lastPlayRejection = "";
        this.lastRecoverableError = "";
        this.started = false;
        this.stateMachine = new MicrophoneStateMachine();
        this.stateMachine.addEventListener("state", (event) => {
            this.dispatchEvent(new CustomEvent("micState", { detail: event.detail }));
        });
        this.applyRemoteVolume();
    }

    async start() {
        if (this.started) return;
        this.started = true;
        if (this.roomService.role === "owner") {
            await this.startOwnerGeneration({ relayOnly: this.relayMode });
            return;
        }
        await this.startGuestConnection();
    }

    async startOwnerGeneration({ relayOnly = false } = {}) {
        const generationId = makeGenerationId(this.roomService.uid);
        await this.cleanSignalingIfOwner();
        await this.setSignalingGeneration(generationId);
        await this.createPeer({ generationId, relayOnly });
        this.listenSignaling();
        await this.createOffer();
    }

    async startGuestConnection() {
        this.listenSignaling();
        const { db } = this.roomService.firebase;
        const [generationSnap, offerSnap] = await Promise.all([
            db.get(db.child(this.roomService.roomRef(), "signaling/generationId")).catch(() => null),
            db.get(db.child(this.roomService.roomRef(), "signaling/offer")).catch(() => null)
        ]);
        const generationId = generationSnap?.val();
        if (generationId) await this.createPeer({ generationId, relayOnly: this.relayMode });
        const offer = offerSnap?.val();
        if (offer?.sdp) await this.handleRemoteOffer(offer);
    }

    async enableMicrophone() {
        await this.start().catch((error) => this.fail(error));
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
                    stopStream(stream);
                    return false;
                }
                const [track] = stream.getAudioTracks();
                if (!track || track.readyState !== "live") throw new DOMException("Microphone unavailable", "NotFoundError");
                this.stateMachine.transition(MICROPHONE_STATES.STARTING);
                this.dispatchState(VOICE_LABELS.preparing);
                stopStream(this.localStream);
                this.localStream = stream;
                await this.ensureSender();
                await this.localSender.replaceTrack(track);
                await this.roomService.updateParticipant({ micEnabled: true, connectionState: this.connectionLabel() });
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
        await this.start().catch(() => {});
        return this.stateMachine.run(async () => {
            this.stateMachine.transition(MICROPHONE_STATES.STOPPING);
            await this.localSender?.replaceTrack(null).catch(() => {});
            stopStream(this.localStream);
            this.localStream = null;
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
            connectionState: muted ? VOICE_LABELS.muted : (this.localStream ? VOICE_LABELS.on : VOICE_LABELS.off)
        }).catch(() => {});
    }

    async createPeer({ generationId, relayOnly = false }) {
        if (this.peer && this.generationId === generationId && this.relayMode === relayOnly) return;
        this.closePeer({ stopLocalTracks: false });
        this.generationId = String(generationId || makeGenerationId(this.roomService.uid));
        this.relayMode = Boolean(relayOnly);
        const generation = ++this.connectionGeneration;
        this.pendingCandidates = [];
        this.seenCandidates.clear();
        this.remoteTracks.clear();
        this.remoteStream = null;
        this.peer = new RTCPeerConnection(await this.buildRtcConfig({ relayOnly: this.relayMode }));
        this.peerCreateCount += 1;
        this.audioTransceiver = this.peer.addTransceiver("audio", { direction: "sendrecv" });
        this.localSender = this.audioTransceiver.sender;
        await this.localSender.replaceTrack(this.localStream?.getAudioTracks?.()[0] || null).catch(() => {});

        this.peer.ontrack = (event) => {
            if (!this.isCurrentGeneration(generation)) return;
            const [stream] = event.streams;
            const track = event.track;
            if (track) this.remoteTracks.add(track);
            if (stream) {
                this.remoteStream = stream;
                this.remoteAudio.srcObject = stream;
            } else if (track) {
                this.remoteStream = new MediaStream([track]);
                this.remoteAudio.srcObject = this.remoteStream;
            }
            this.applyRemoteVolume();
            this.tryPlayRemoteAudio();
            this.dispatchState(this.connectionLabel());
        };
        this.peer.onicecandidate = (event) => this.writeCandidate(event.candidate);
        this.peer.onconnectionstatechange = () => this.handleConnectionState();
        this.peer.oniceconnectionstatechange = () => this.handleConnectionState();
        this.peer.onnegotiationneeded = async () => {
            if (this.roomService.role !== "owner") return;
            await this.createOffer().catch((error) => this.fail(error));
        };
        this.startConnectionTimer();
        this.dispatchState(this.relayMode ? VOICE_LABELS.relay : VOICE_LABELS.connecting);
    }

    async ensureSender() {
        if (!this.peer) await this.start();
        if (!this.localSender) {
            this.audioTransceiver = this.peer.addTransceiver("audio", { direction: "sendrecv" });
            this.localSender = this.audioTransceiver.sender;
        }
        return this.localSender;
    }

    async buildRtcConfig({ relayOnly = false } = {}) {
        const rtc = this.config.rtc;
        const baseIce = Array.isArray(rtc.iceServers) ? rtc.iceServers : [];
        const optionalTurn = this.config.optionalTurn?.enabled ? this.config.optionalTurn.iceServers || [] : [];
        const endpointTurn = await this.fetchTurnIceServers(rtc.turnCredentialsEndpoint);
        let iceServers = [...baseIce, ...optionalTurn, ...endpointTurn].filter(isValidIceServer);
        if (!iceServers.length) iceServers = [...DEFAULT_STUN_SERVERS];
        return {
            iceServers,
            iceTransportPolicy: relayOnly ? "relay" : "all"
        };
    }

    async fetchTurnIceServers(endpoint) {
        if (!endpoint) return [];
        if (this.turnCache?.expiresAt && this.turnCache.expiresAt > Date.now() + 30000) return this.turnCache.iceServers || [];
        try {
            const url = new URL(endpoint, location.href);
            const production = this.config.environment === "production";
            if (url.protocol !== "https:" && (production || !isLocalHostname(url.hostname))) return [];
            const token = await this.roomService.firebase.auth?.currentUser?.getIdToken?.();
            const response = await fetch(url.href, {
                credentials: "omit",
                cache: "no-store",
                headers: token ? { authorization: `Bearer ${token}` } : {}
            });
            if (!response.ok) return [];
            const data = await response.json();
            const parsed = validateTurnResponse(data);
            this.turnCache = parsed;
            return parsed.iceServers;
        } catch (error) {
            this.lastRecoverableError = "turn-endpoint-unavailable";
            safeLog("turn endpoint unavailable", { error: error.message });
            return [];
        }
    }

    async cleanSignalingIfOwner() {
        if (this.roomService.role !== "owner") return;
        const { db } = this.roomService.firebase;
        await db.remove(db.child(this.roomService.roomRef(), "signaling"));
    }

    async setSignalingGeneration(generationId) {
        const { db } = this.roomService.firebase;
        await db.set(db.child(this.roomService.roomRef(), "signaling/generationId"), generationId);
    }

    async createOffer(options = {}) {
        if (!this.peer || this.makingOffer) return;
        if (this.peer.signalingState !== "stable") return;
        this.makingOffer = true;
        try {
            const offer = await this.peer.createOffer({ offerToReceiveAudio: true, iceRestart: Boolean(options.iceRestart) });
            await this.peer.setLocalDescription(offer);
            const { db } = this.roomService.firebase;
            await db.set(db.child(this.roomService.roomRef(), "signaling/offer"), {
                generationId: this.generationId,
                type: offer.type,
                sdp: offer.sdp,
                uid: this.roomService.uid,
                createdAt: this.roomService.firebase.serverTimestamp()
            });
        } finally {
            this.makingOffer = false;
        }
    }

    async handleRemoteOffer(offer) {
        if (!offer?.sdp || offer.uid === this.roomService.uid || !offer.generationId) return;
        if (this.roomService.role === "guest" && offer.generationId !== this.generationId) {
            await this.createPeer({ generationId: offer.generationId, relayOnly: this.relayMode });
        }
        if (!this.peer || !this.isCurrentSignal(offer)) return;
        const readyForOffer = !this.makingOffer && (this.peer.signalingState === "stable" || this.isSettingRemoteAnswerPending);
        const offerCollision = !readyForOffer;
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) return;
        await this.peer.setRemoteDescription(new RTCSessionDescription({ type: offer.type, sdp: offer.sdp }));
        await this.flushCandidates();
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        const { db } = this.roomService.firebase;
        await db.set(db.child(this.roomService.roomRef(), "signaling/answer"), {
            generationId: this.generationId,
            type: answer.type,
            sdp: answer.sdp,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    async applyAnswer(answer) {
        if (!this.peer || !this.isCurrentSignal(answer) || answer.uid === this.roomService.uid) return;
        if (this.peer.signalingState !== "have-local-offer") return;
        this.isSettingRemoteAnswerPending = true;
        try {
            await this.peer.setRemoteDescription(new RTCSessionDescription({ type: answer.type, sdp: answer.sdp }));
            await this.flushCandidates();
        } finally {
            this.isSettingRemoteAnswerPending = false;
        }
    }

    listenSignaling() {
        if (this.unsubscribers.length) return;
        const { db } = this.roomService.firebase;
        const roomRef = this.roomService.roomRef();
        this.unsubscribers.push(db.onValue(db.child(roomRef, "signaling/offer"), async (snap) => {
            const offer = snap.val();
            try { await this.handleRemoteOffer(offer); } catch (error) { this.fail(error); }
        }));
        this.unsubscribers.push(db.onValue(db.child(roomRef, "signaling/answer"), async (snap) => {
            const answer = snap.val();
            try { await this.applyAnswer(answer); } catch (error) { this.fail(error); }
        }));
        this.listenCandidates(this.roomService.role === "owner" ? "guestCandidates" : "hostCandidates");
    }

    listenCandidates(path) {
        const { db } = this.roomService.firebase;
        this.unsubscribers.push(db.onChildAdded(db.child(this.roomService.roomRef(), `signaling/${path}`), async (snap) => {
            const candidate = snap.val();
            if (!candidate || candidate.uid === this.roomService.uid || !this.isCurrentSignal(candidate)) return;
            const key = `${candidate.generationId}:${candidate.candidate || ""}:${candidate.sdpMid || ""}:${candidate.sdpMLineIndex ?? ""}`;
            if (this.seenCandidates.has(key)) return;
            this.seenCandidates.add(key);
            if (!candidate.candidate) {
                if (this.hasRemoteDescription()) await this.peer.addIceCandidate(null).catch(() => {});
                return;
            }
            const ice = new RTCIceCandidate({
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid || "",
                sdpMLineIndex: candidate.sdpMLineIndex || 0
            });
            if (!this.hasRemoteDescription()) {
                this.pendingCandidates.push(ice);
                return;
            }
            try { await this.peer.addIceCandidate(ice); } catch (error) { safeLog("ice candidate failed", { error: error.message }); }
        }));
    }

    async flushCandidates() {
        while (this.pendingCandidates.length && this.peer) {
            await this.peer.addIceCandidate(this.pendingCandidates.shift()).catch((error) => safeLog("queued ice failed", { error: error.message }));
        }
    }

    async writeCandidate(candidate) {
        if (!this.peer || !this.generationId) return;
        const { db } = this.roomService.firebase;
        const path = this.roomService.role === "owner" ? "hostCandidates" : "guestCandidates";
        await db.push(db.child(this.roomService.roomRef(), `signaling/${path}`), {
            generationId: this.generationId,
            candidate: candidate?.candidate || "",
            sdpMid: candidate?.sdpMid || "",
            sdpMLineIndex: candidate?.sdpMLineIndex || 0,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    async handleConnectionState() {
        if (!this.peer) return;
        const state = this.peer.connectionState || this.peer.iceConnectionState || "closed";
        if (state === "connected" || state === "completed") {
            this.iceRestartAttempts = 0;
            clearTimeout(this.connectionTimer);
        }
        const label = this.connectionLabel();
        await this.roomService.updateParticipant({ connectionState: label }).catch(() => {});
        this.dispatchState(label);
        if (state === "failed") await this.restartIce();
    }

    startConnectionTimer() {
        clearTimeout(this.connectionTimer);
        const timeoutMs = Number(this.config.rtc.connectionTimeoutMs || 10000);
        this.connectionTimer = setTimeout(() => this.handleConnectionTimeout(), timeoutMs);
    }

    async handleConnectionTimeout() {
        if (!this.peer || ["connected", "completed"].includes(this.peer.connectionState) || this.relayFallbackAttempted) return;
        if (!this.config.rtc.relayFallback) return;
        const turnServers = await this.fetchTurnIceServers(this.config.rtc.turnCredentialsEndpoint);
        if (!turnServers.length) return;
        this.relayFallbackAttempted = true;
        this.dispatchState(VOICE_LABELS.directFailed);
        if (this.roomService.role === "owner") {
            await this.startOwnerGeneration({ relayOnly: true }).catch((error) => this.fail(error));
        }
    }

    async restartIce() {
        try {
            if (this.iceRestartAttempts >= Number(this.config.rtc.maxIceRestarts || 2)) throw new Error("ICE restart limit reached");
            this.iceRestartAttempts += 1;
            this.stateMachine.transition(MICROPHONE_STATES.RECONNECTING);
            this.dispatchState(VOICE_LABELS.recovering);
            this.peer?.restartIce?.();
            if (this.roomService.role === "owner") await this.createOffer({ iceRestart: true });
        } catch (error) {
            this.fail(error);
        }
    }

    async getDiagnostics() {
        const stats = await this.getSelectedCandidateStats();
        const senders = this.peer?.getSenders?.() || [];
        const transceivers = this.peer?.getTransceivers?.() || (this.audioTransceiver ? [this.audioTransceiver] : []);
        return {
            iceServersEmpty: !(await this.buildRtcConfig({ relayOnly: this.relayMode })).iceServers.length,
            signalingState: this.peer?.signalingState || "closed",
            iceGatheringState: this.peer?.iceGatheringState || "closed",
            iceConnectionState: this.peer?.iceConnectionState || "closed",
            connectionState: this.peer?.connectionState || "closed",
            candidatePath: stats.path,
            protocol: stats.protocol,
            localCandidateType: stats.localCandidateType,
            remoteCandidateType: stats.remoteCandidateType,
            packetsReceived: stats.packetsReceived,
            bytesReceived: stats.bytesReceived,
            jitter: stats.jitter,
            packetsLost: stats.packetsLost,
            roundTripTime: stats.roundTripTime,
            peerCount: this.peer ? 1 : 0,
            peerCreateCount: this.peerCreateCount,
            senderCount: senders.length,
            transceiverCount: transceivers.length,
            localLiveAudioTrackCount: this.localStream?.getAudioTracks?.().filter((track) => track.readyState === "live").length || 0,
            remoteReceivedTrackCount: [...this.remoteTracks].filter((track) => track.readyState !== "ended").length,
            remoteAudio: {
                srcObjectPresent: Boolean(this.remoteAudio?.srcObject),
                paused: Boolean(this.remoteAudio?.paused),
                muted: Boolean(this.remoteAudio?.muted),
                volume: Number(this.remoteAudio?.volume ?? 0),
                playRejected: Boolean(this.lastPlayRejection),
                playRejectionReason: this.lastPlayRejection,
                remoteTrackReadyState: [...this.remoteTracks][0]?.readyState || ""
            },
            staleSignalsIgnored: this.ignoreOffer,
            generationId: this.generationId ? "[set]" : ""
        };
    }

    async getSelectedCandidateStats() {
        const empty = {
            path: "unknown",
            protocol: "",
            localCandidateType: "",
            remoteCandidateType: "",
            packetsReceived: 0,
            bytesReceived: 0,
            jitter: 0,
            packetsLost: 0,
            roundTripTime: 0
        };
        if (!this.peer?.getStats) return empty;
        try {
            const report = await this.peer.getStats();
            let selectedPair = null;
            for (const stat of report.values()) {
                if (stat.type === "candidate-pair" && (stat.selected || stat.nominated || stat.state === "succeeded")) selectedPair = stat;
            }
            if (!selectedPair) return empty;
            const local = report.get(selectedPair.localCandidateId) || {};
            const remote = report.get(selectedPair.remoteCandidateId) || {};
            const inbound = [...report.values()].find((stat) => stat.type === "inbound-rtp" && stat.kind === "audio") || {};
            const type = local.candidateType || remote.candidateType || "";
            return {
                path: type === "relay" ? "TURN" : type === "srflx" ? "STUN" : type === "host" ? "direct" : "unknown",
                protocol: String(local.protocol || remote.protocol || "").toUpperCase(),
                localCandidateType: local.candidateType || "",
                remoteCandidateType: remote.candidateType || "",
                packetsReceived: Number(inbound.packetsReceived || 0),
                bytesReceived: Number(inbound.bytesReceived || 0),
                jitter: Number(inbound.jitter || 0),
                packetsLost: Number(inbound.packetsLost || 0),
                roundTripTime: Number(selectedPair.currentRoundTripTime || 0)
            };
        } catch {
            return empty;
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

    setPartnerMicEnabled(enabled) {
        this.partnerMicActive = Boolean(enabled);
        this.dispatchState(this.connectionLabel());
    }

    applyRemoteVolume() {
        if (!this.remoteAudio) return;
        this.remoteAudio.volume = this.remoteMuted ? 0 : this.remoteVolume;
        this.remoteAudio.muted = Boolean(this.remoteMuted);
    }

    async tryPlayRemoteAudio() {
        if (!this.remoteAudio?.srcObject) return;
        try {
            await this.remoteAudio.play();
            this.lastPlayRejection = "";
        } catch (error) {
            this.lastPlayRejection = error?.name || "play-rejected";
            this.dispatchEvent(new CustomEvent("remoteAudioBlocked", { detail: VOICE_LABELS.blocked }));
        }
    }

    unlockRemoteAudio() {
        return this.tryPlayRemoteAudio();
    }

    connectionLabel() {
        const state = this.peer?.connectionState || this.peer?.iceConnectionState || "new";
        if (state === "connected" || state === "completed") {
            if (this.remoteTracks.size || !this.partnerMicEnabled()) return VOICE_LABELS.connected;
            return VOICE_LABELS.connecting;
        }
        if (state === "failed") return VOICE_LABELS.failed;
        if (state === "disconnected") return VOICE_LABELS.recovering;
        return this.relayMode ? VOICE_LABELS.relay : VOICE_LABELS.connecting;
    }

    partnerMicEnabled() {
        return this.partnerMicActive;
    }

    hasRemoteDescription() {
        return Boolean(this.peer?.remoteDescription);
    }

    isCurrentSignal(record) {
        return Boolean(record?.generationId && record.generationId === this.generationId);
    }

    isCurrentGeneration(generation) {
        return generation === this.connectionGeneration;
    }

    fail(error) {
        this.lastRecoverableError = error?.name || error?.message || "voice-failed";
        safeLog("webrtc failed", { error: error?.message || String(error) });
        this.stateMachine.transition(MICROPHONE_STATES.FAILED);
        this.dispatchEvent(new CustomEvent("error", { detail: MESSAGES.rtcFailed }));
        this.dispatchState(VOICE_LABELS.failed);
    }

    dispatchState(message) {
        this.dispatchEvent(new CustomEvent("state", { detail: message }));
    }

    closePeer({ stopLocalTracks = true } = {}) {
        clearTimeout(this.connectionTimer);
        this.connectionGeneration += 1;
        this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
        if (stopLocalTracks) {
            this.stateMachine.cancel();
            stopStream(this.localStream);
            this.localStream = null;
        }
        this.peer?.close();
        this.peer = null;
        this.localSender = null;
        this.audioTransceiver = null;
        this.pendingCandidates = [];
        this.seenCandidates.clear();
        this.remoteTracks.clear();
        this.remoteStream = null;
        if (this.remoteAudio) this.remoteAudio.srcObject = null;
    }

    destroy() {
        this.started = false;
        this.closePeer({ stopLocalTracks: true });
    }
}

function normalizeRtcConfig(config = {}) {
    const rtc = config.rtc || {};
    return {
        ...config,
        rtc: {
            iceServers: Array.isArray(rtc.iceServers) ? rtc.iceServers : [],
            turnCredentialsEndpoint: rtc.turnCredentialsEndpoint || "",
            connectionTimeoutMs: Number(rtc.connectionTimeoutMs || 10000),
            maxIceRestarts: Number(rtc.maxIceRestarts || 2),
            relayFallback: rtc.relayFallback !== false
        }
    };
}

export function validateTurnResponse(data) {
    const expiresAt = Number(data?.expiresAt || 0);
    const maxLifetimeMs = 12 * 60 * 60 * 1000;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30000 || expiresAt > Date.now() + maxLifetimeMs) {
        throw new Error("Invalid TURN credential expiry.");
    }
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error("Invalid TURN iceServers.");
    const iceServers = data.iceServers.filter(isValidIceServer);
    if (!iceServers.some((server) => toUrlArray(server.urls).some((url) => /^turns?:/i.test(url)))) {
        throw new Error("TURN response has no TURN URL.");
    }
    return { iceServers, expiresAt };
}

export function isValidIceServer(server) {
    if (!server || typeof server !== "object" || Array.isArray(server)) return false;
    const urls = toUrlArray(server.urls);
    if (!urls.length || urls.some((url) => typeof url !== "string" || !/^(stun|turns?):/i.test(url))) return false;
    const hasTurn = urls.some((url) => /^turns?:/i.test(url));
    if (hasTurn && (!server.username || !server.credential)) return false;
    return true;
}

function toUrlArray(urls) {
    return Array.isArray(urls) ? urls : urls ? [urls] : [];
}

function makeGenerationId() {
    const random = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `voice-${random}`.slice(0, 80);
}

function isMicrophoneRuntimeAvailable() {
    return Boolean(
        globalThis.isSecureContext
        && globalThis.navigator?.mediaDevices
        && globalThis.navigator.mediaDevices.getUserMedia
        && globalThis.RTCPeerConnection
    );
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
