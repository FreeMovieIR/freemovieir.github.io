import { isLocalHostname, MESSAGES, safeLog } from "../utils.js";
import { VoiceMedia } from "./voice-media.js";
import { VoiceSignaling, createVoiceSessionId } from "./voice-signaling.js";
import { collectVoiceStats } from "./voice-stats.js";
import { MICROPHONE_STATES, VOICE_LABELS, VOICE_STATES, VoiceStateMachine } from "./voice-state.js";

const DEFAULT_STUN_SERVERS = Object.freeze([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
]);

const activeInstances = new Set();

export class VoiceCall extends EventTarget {
    constructor(roomService, config, remoteAudio, options = {}) {
        super();
        this.roomService = roomService;
        this.config = normalizeRtcConfig(config);
        this.options = options;
        this.RTCPeerConnection = options.RTCPeerConnection || globalThis.RTCPeerConnection;
        this.RTCSessionDescription = options.RTCSessionDescription || globalThis.RTCSessionDescription;
        this.RTCIceCandidate = options.RTCIceCandidate || globalThis.RTCIceCandidate;
        this.stateMachine = new VoiceStateMachine();
        this.replaceTrackCount = 0;
        this.media = new VoiceMedia(remoteAudio, this.stateMachine, {
            ...options,
            onReplaceTrack: () => { this.replaceTrackCount += 1; }
        });
        this.signaling = new VoiceSignaling(roomService);
        this.peer = null;
        this.audioTransceiver = null;
        this.localSender = null;
        this.started = false;
        this.sessionId = "";
        this.knownSessionId = "";
        this.peerGeneration = 0;
        this.peerCreateCount = 0;
        this.offerCount = 0;
        this.answerCount = 0;
        this.restartOfferCount = 0;
        this.partnerMicActive = false;
        this.remoteDescriptionReady = false;
        this.pendingCandidates = [];
        this.seenCandidates = new Set();
        this.ignoredOldSessionCount = 0;
        this.disconnectedTimer = null;
        this.automaticRestartUsed = false;
        this.failed = false;
        this.instanceKey = makeInstanceKey(roomService);
        this.userErrors = new Set();
        this.stateMachine.addEventListener("status", (event) => this.dispatchEvent(new CustomEvent("status", { detail: event.detail })));
        this.media.addEventListener("remoteAudioBlocked", (event) => this.dispatchEvent(new CustomEvent("remoteAudioBlocked", { detail: event.detail })));
        this.media.addEventListener("userError", (event) => this.dispatchUserError(event.detail));
        this.assertSingleInstance();
        this.installPageLifecycleHandlers();
        this.stateMachine.emit();
    }

    assertSingleInstance() {
        if (!shouldAssertSingleInstance(this.config, this.options)) return;
        if (activeInstances.has(this.instanceKey)) throw new Error("Voice V2 duplicate instance blocked.");
        activeInstances.add(this.instanceKey);
    }

    async start() {
        if (this.started) return;
        this.started = true;
        this.signaling.listen({
            onSession: (sessionId) => this.handleSession(sessionId),
            onOffer: (offer) => this.handleOffer(offer),
            onAnswer: (answer) => this.handleAnswer(answer),
            onCandidate: (candidate) => this.handleRemoteCandidate(candidate)
        });
        this.stateMachine.transition(VOICE_STATES.WAITING_FOR_PARTNER);
    }

    get generationId() {
        return this.sessionId;
    }

    updateRoom(room) {
        const participants = Object.values(room?.participants || {});
        const hasPartner = participants.some((participant) => participant && participant.role !== this.roomService.role);
        if (!hasPartner) {
            if (!this.peer) this.stateMachine.transition(VOICE_STATES.WAITING_FOR_PARTNER);
            return;
        }
        if (this.roomService.role === "owner" && !this.sessionId && !this.knownSessionId) {
            this.beginOwnerSession().catch((error) => this.fail(error));
        }
    }

    async beginOwnerSession({ manual = false, iceRestart = false } = {}) {
        if (this.roomService.role !== "owner") return;
        if (manual) await this.signaling.clearSession().catch(() => {});
        if (!iceRestart) {
            this.sessionId = createVoiceSessionId();
            this.knownSessionId = this.sessionId;
            this.pendingCandidates = [];
            this.seenCandidates.clear();
            this.automaticRestartUsed = false;
            await this.signaling.createSession(this.sessionId);
            await this.createPeer(this.sessionId, { addAudioTransceiver: true });
        } else if (!this.peer || !this.sessionId) {
            return;
        }
        await this.createOwnerOffer({ iceRestart });
    }

    async createPeer(sessionId, { addAudioTransceiver = true } = {}) {
        if (!this.RTCPeerConnection) throw new Error("RTCPeerConnection unavailable");
        if (this.peer && this.sessionId === sessionId) return this.peer;
        this.closePeer({ stopLocalTracks: false });
        this.sessionId = sessionId;
        this.remoteDescriptionReady = false;
        this.pendingCandidates = this.pendingCandidates.filter((candidate) => candidate?.sessionId === sessionId);
        this.seenCandidates.clear();
        this.failed = false;
        const generation = ++this.peerGeneration;
        this.peer = new this.RTCPeerConnection(await this.buildRtcConfig());
        this.peerCreateCount += 1;
        if (addAudioTransceiver) {
            this.audioTransceiver = this.peer.addTransceiver("audio", { direction: "sendrecv" });
            this.bindLocalSender(this.audioTransceiver.sender);
            await this.localSender.replaceTrack?.(this.media.localTrack || null).catch(() => {});
        }
        this.peer.ontrack = (event) => {
            if (generation !== this.peerGeneration) return;
            this.media.attachRemoteTrack(event.track, event.streams || []);
        };
        this.peer.onicecandidate = (event) => {
            if (generation !== this.peerGeneration) return;
            this.writeCandidate(event.candidate).catch((error) => safeLog("voiceV2 candidate write failed", { error: error?.message || String(error) }));
        };
        this.peer.onconnectionstatechange = () => this.handleConnectionState(generation);
        this.peer.oniceconnectionstatechange = () => this.handleConnectionState(generation);
        this.stateMachine.transition(VOICE_STATES.CONNECTING);
        return this.peer;
    }

    async createOwnerOffer({ iceRestart = false } = {}) {
        if (this.roomService.role !== "owner" || !this.peer || !this.sessionId) return;
        if (this.peer.signalingState !== "stable") return;
        if (iceRestart) this.peer.restartIce?.();
        const offer = await this.peer.createOffer({ iceRestart });
        await this.peer.setLocalDescription(offer);
        this.offerCount += 1;
        if (iceRestart) this.restartOfferCount += 1;
        await this.signaling.writeOffer({ sessionId: this.sessionId, type: offer.type, sdp: offer.sdp });
    }

    async handleSession(sessionId) {
        if (!sessionId) return;
        this.knownSessionId = String(sessionId);
        if (this.roomService.role === "owner") return;
        if (this.sessionId && this.sessionId !== this.knownSessionId) {
            this.closePeer({ stopLocalTracks: false });
        }
    }

    async handleOffer(offer) {
        if (!offer?.sessionId || !offer?.sdp || offer.uid === this.roomService.uid) return;
        if (this.roomService.role !== "guest") return;
        if (this.knownSessionId && offer.sessionId !== this.knownSessionId) {
            this.ignoredOldSessionCount += 1;
            return;
        }
        if (this.sessionId && offer.sessionId !== this.sessionId) {
            this.closePeer({ stopLocalTracks: false });
        }
        await this.createPeer(offer.sessionId, { addAudioTransceiver: false });
        if (!this.isCurrentSession(offer.sessionId)) return;
        await this.peer.setRemoteDescription(new this.RTCSessionDescription({ type: offer.type, sdp: offer.sdp }));
        this.bindAnswererTransceiver();
        this.remoteDescriptionReady = true;
        await this.flushCandidates();
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        this.answerCount += 1;
        await this.signaling.writeAnswer({ sessionId: this.sessionId, type: answer.type, sdp: answer.sdp });
    }

    async handleAnswer(answer) {
        if (!answer?.sessionId || !answer?.sdp || answer.uid === this.roomService.uid) return;
        if (this.roomService.role !== "owner") return;
        if (!this.isCurrentSession(answer.sessionId)) {
            this.ignoredOldSessionCount += 1;
            return;
        }
        if (!this.peer || this.peer.signalingState !== "have-local-offer") return;
        await this.peer.setRemoteDescription(new this.RTCSessionDescription({ type: answer.type, sdp: answer.sdp }));
        this.remoteDescriptionReady = true;
        await this.flushCandidates();
    }

    async handleRemoteCandidate(candidate) {
        if (!candidate?.sessionId || candidate.uid === this.roomService.uid) return;
        if (this.sessionId && candidate.sessionId !== this.sessionId) {
            this.ignoredOldSessionCount += 1;
            return;
        }
        const key = candidateKey(candidate);
        if (this.seenCandidates.has(key)) return;
        this.seenCandidates.add(key);
        if (!this.peer || !this.remoteDescriptionReady) {
            this.pendingCandidates.push(candidate);
            return;
        }
        await this.addCandidateRecord(candidate);
    }

    isCurrentSession(sessionId) {
        return Boolean(sessionId && this.sessionId && sessionId === this.sessionId);
    }

    async flushCandidates() {
        const candidates = this.pendingCandidates.splice(0);
        for (const candidate of candidates) {
            if (candidate?.sessionId === this.sessionId) await this.addCandidateRecord(candidate);
        }
    }

    bindAnswererTransceiver() {
        if (this.audioTransceiver && this.localSender) return;
        const transceivers = this.peer?.getTransceivers?.() || [];
        this.audioTransceiver = transceivers.find((transceiver) => transceiver.receiver?.track?.kind === "audio" || transceiver.sender?.track?.kind === "audio") || transceivers[0] || null;
        if (this.audioTransceiver?.sender) {
            this.bindLocalSender(this.audioTransceiver.sender);
            this.localSender.replaceTrack?.(this.media.localTrack || null).catch(() => {});
        }
    }

    bindLocalSender(sender) {
        this.localSender = sender || null;
        this.media.setSender(this.localSender);
    }

    async addCandidateRecord(candidate) {
        if (!this.peer) return;
        if (!candidate.candidate) {
            await this.peer.addIceCandidate?.(null).catch(() => {});
            return;
        }
        const ice = new this.RTCIceCandidate({
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid || "",
            sdpMLineIndex: Number(candidate.sdpMLineIndex || 0)
        });
        await this.peer.addIceCandidate(ice).catch((error) => safeLog("voiceV2 remote candidate rejected", { error: error?.message || String(error) }));
    }

    async writeCandidate(candidate) {
        if (!this.sessionId) return;
        await this.signaling.writeCandidate(this.sessionId, candidate);
    }

    handleConnectionState(generation) {
        if (generation !== this.peerGeneration || !this.peer) return;
        const state = this.peer.connectionState || this.peer.iceConnectionState || "new";
        if (state === "connected" || state === "completed") {
            clearTimeout(this.disconnectedTimer);
            this.stateMachine.transition(VOICE_STATES.CONNECTED, { remoteAudioBlocked: false });
            this.roomService.updateParticipant({ connectionState: VOICE_LABELS[VOICE_STATES.CONNECTED] }).catch(() => {});
            return;
        }
        if (state === "disconnected") {
            this.scheduleDisconnectedGrace(generation);
            return;
        }
        if (state === "failed") {
            this.handleVoiceFailure(generation);
        }
    }

    scheduleDisconnectedGrace(generation) {
        clearTimeout(this.disconnectedTimer);
        this.stateMachine.transition(VOICE_STATES.RECONNECTING);
        this.disconnectedTimer = setTimeout(() => {
            if (generation !== this.peerGeneration || !this.peer) return;
            const state = this.peer.connectionState || this.peer.iceConnectionState || "";
            if (state === "connected" || state === "completed") return;
            this.handleVoiceFailure(generation);
        }, Number(this.config.rtc.disconnectedGraceMs || 3000));
    }

    async handleVoiceFailure(generation) {
        if (generation !== this.peerGeneration || this.failed) return;
        if (!this.automaticRestartUsed && this.roomService.role === "owner" && this.peer) {
            this.automaticRestartUsed = true;
            this.stateMachine.transition(VOICE_STATES.RECONNECTING);
            try {
                await this.createOwnerOffer({ iceRestart: true });
                return;
            } catch (error) {
                safeLog("voiceV2 ice restart failed", { error: error?.message || String(error) });
            }
        }
        this.failed = true;
        clearTimeout(this.disconnectedTimer);
        this.stateMachine.transition(VOICE_STATES.FAILED);
        this.roomService.updateParticipant({ connectionState: VOICE_LABELS[VOICE_STATES.FAILED] }).catch(() => {});
    }

    async reconnect() {
        clearTimeout(this.disconnectedTimer);
        this.failed = false;
        if (this.roomService.role === "owner") {
            this.closePeer({ stopLocalTracks: false });
            await this.beginOwnerSession({ manual: true });
            return;
        }
        this.closePeer({ stopLocalTracks: false });
        this.stateMachine.transition(VOICE_STATES.WAITING_FOR_PARTNER);
    }

    async enableMicrophone() {
        const ok = await this.media.enableMicrophone();
        if (ok) {
            await this.roomService.updateParticipant({ micEnabled: true, connectionState: VOICE_LABELS.micOn }).catch(() => {});
            this.stateMachine.transition(this.peer ? VOICE_STATES.CONNECTED : VOICE_STATES.MIC_ON);
        }
        return ok;
    }

    async disableMicrophone() {
        await this.media.disableMicrophone();
        await this.roomService.updateParticipant({ micEnabled: false, connectionState: VOICE_LABELS.micOff }).catch(() => {});
        if (this.peer) this.stateMachine.transition(VOICE_STATES.CONNECTED);
    }

    setMuted(muted) {
        this.media.setMuted(muted);
        this.roomService.updateParticipant({
            micEnabled: Boolean(this.media.localTrack),
            connectionState: muted ? VOICE_LABELS.micMuted : (this.media.localTrack ? VOICE_LABELS.micOn : VOICE_LABELS.micOff)
        }).catch(() => {});
    }

    setRemoteVolume(value) {
        this.media.setRemoteVolume(value);
    }

    setRemoteMuted(muted) {
        this.media.setRemoteMuted(muted);
    }

    unlockRemoteAudio() {
        return this.media.unlockRemoteAudio();
    }

    setPartnerMicEnabled(enabled) {
        this.partnerMicActive = Boolean(enabled);
        this.dispatchEvent(new CustomEvent("partnerStatus", {
            detail: this.partnerMicActive ? "میکروفن همراه روشن است" : VOICE_LABELS.partnerMicOff
        }));
    }

    dispatchUserError(message) {
        if (this.userErrors.has(message)) return;
        this.userErrors.add(message);
        this.dispatchEvent(new CustomEvent("userError", { detail: message }));
        setTimeout(() => this.userErrors.delete(message), 3000);
    }

    async buildRtcConfig() {
        const rtc = this.config.rtc;
        const endpointTurn = await this.fetchTurnIceServers(rtc.turnCredentialsEndpoint);
        let iceServers = [
            ...(Array.isArray(rtc.iceServers) ? rtc.iceServers : []),
            ...(this.config.optionalTurn?.enabled && Array.isArray(this.config.optionalTurn.iceServers) ? this.config.optionalTurn.iceServers : []),
            ...endpointTurn
        ].filter(isValidIceServer);
        if (!iceServers.length) iceServers = [...DEFAULT_STUN_SERVERS];
        return {
            iceServers,
            iceTransportPolicy: this.options.forceRelay ? "relay" : (rtc.iceTransportPolicy || "all")
        };
    }

    async fetchTurnIceServers(endpoint) {
        if (!endpoint) return [];
        try {
            const url = new URL(endpoint, location.href);
            if (url.protocol !== "https:" && !isLocalHostname(url.hostname)) return [];
            const token = await this.roomService.firebase.auth?.currentUser?.getIdToken?.();
            const response = await fetch(url.href, {
                credentials: "omit",
                cache: "no-store",
                headers: token ? { authorization: `Bearer ${token}` } : {}
            });
            if (!response.ok) return [];
            return validateTurnResponse(await response.json()).iceServers;
        } catch (error) {
            safeLog("voiceV2 turn endpoint unavailable", { error: error?.message || String(error) });
            return [];
        }
    }

    installPageLifecycleHandlers() {
        this.visibilityHandler = () => {
            if (document.visibilityState === "visible" && this.peer) this.handleConnectionState(this.peerGeneration);
        };
        this.pageHideHandler = () => {};
        this.pageShowHandler = () => {
            if (this.peer) this.handleConnectionState(this.peerGeneration);
        };
        globalThis.document?.addEventListener?.("visibilitychange", this.visibilityHandler);
        globalThis.addEventListener?.("pagehide", this.pageHideHandler);
        globalThis.addEventListener?.("pageshow", this.pageShowHandler);
    }

    async getDiagnostics() {
        const transceivers = this.peer?.getTransceivers?.() || (this.audioTransceiver ? [this.audioTransceiver] : []);
        const senders = this.peer?.getSenders?.() || (this.localSender ? [this.localSender] : []);
        return {
            ...(await collectVoiceStats(this.peer, this.media.diagnostics())),
            peerCount: this.peer ? 1 : 0,
            peerCreateCount: this.peerCreateCount,
            offerCount: this.offerCount,
            answerCount: this.answerCount,
            restartOfferCount: this.restartOfferCount,
            automaticRestartUsed: this.automaticRestartUsed,
            senderCount: senders.length,
            transceiverCount: transceivers.length,
            replaceTrackCount: this.replaceTrackCount,
            sessionId: this.sessionId ? "[set]" : "",
            generationId: this.sessionId ? "[set]" : "",
            pendingCandidateCount: this.pendingCandidates.length,
            ignoredOldSessionCount: this.ignoredOldSessionCount,
            microphoneState: this.stateMachine.microphoneState,
            voiceState: this.stateMachine.connectionState
        };
    }

    closePeer({ stopLocalTracks = true } = {}) {
        clearTimeout(this.disconnectedTimer);
        this.peerGeneration += 1;
        this.remoteDescriptionReady = false;
        try { this.peer?.close?.(); } catch {}
        this.peer = null;
        this.audioTransceiver = null;
        this.localSender = null;
        this.media.setSender(null);
        if (stopLocalTracks) this.media.destroy();
    }

    destroy() {
        this.started = false;
        clearTimeout(this.disconnectedTimer);
        this.signaling.destroy();
        this.closePeer({ stopLocalTracks: true });
        activeInstances.delete(this.instanceKey);
        globalThis.document?.removeEventListener?.("visibilitychange", this.visibilityHandler);
        globalThis.removeEventListener?.("pagehide", this.pageHideHandler);
        globalThis.removeEventListener?.("pageshow", this.pageShowHandler);
        this.stateMachine.transition(VOICE_STATES.CLOSED);
    }

    fail(error) {
        safeLog("voiceV2 failed", { error: error?.message || String(error) });
        this.failed = true;
        this.stateMachine.transition(VOICE_STATES.FAILED);
    }
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

function normalizeRtcConfig(config = {}) {
    const rtc = config.rtc || {};
    return {
        ...config,
        rtc: {
            iceServers: Array.isArray(rtc.iceServers) ? rtc.iceServers : [],
            turnCredentialsEndpoint: rtc.turnCredentialsEndpoint || "",
            iceTransportPolicy: rtc.iceTransportPolicy || "all",
            disconnectedGraceMs: Number(rtc.disconnectedGraceMs || 3000)
        }
    };
}

function toUrlArray(urls) {
    return Array.isArray(urls) ? urls : urls ? [urls] : [];
}

function candidateKey(candidate) {
    return `${candidate.sessionId}:${candidate.candidate || ""}:${candidate.sdpMid || ""}:${candidate.sdpMLineIndex ?? ""}`;
}

function makeInstanceKey(roomService) {
    return `${roomService.roomCode || "room"}:${roomService.uid || "uid"}:${roomService.role || "role"}`;
}

function shouldAssertSingleInstance(config, options) {
    if (options.disableInstanceGuard) return false;
    if (options.assertSingleInstance) return true;
    return config?.environment === "test" || config?.environment === "local" || isLocalHostname(globalThis.location?.hostname || "");
}
