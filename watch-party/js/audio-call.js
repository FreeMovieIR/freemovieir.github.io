import { MESSAGES, safeLog } from "./utils.js";

export class AudioCall extends EventTarget {
    constructor(roomService, config, remoteAudio) {
        super();
        this.roomService = roomService;
        this.config = config;
        this.remoteAudio = remoteAudio;
        this.peer = null;
        this.localStream = null;
        this.localSender = null;
        this.remoteDescriptionSet = false;
        this.pendingCandidates = [];
        this.seenCandidates = new Set();
        this.unsubscribers = [];
        this.remoteVolume = loadLocalNumber("watchPartyVoiceVolume", 1);
        this.remoteMuted = false;
        this.turnCache = null;
        this.applyRemoteVolume();
    }

    async enableMicrophone() {
        try {
            if (!isMicrophoneRuntimeAvailable()) throw new DOMException("Microphone unavailable", "NotFoundError");
            this.dispatchState("درخواست دسترسی...");
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
            await this.roomService.updateParticipant({ micEnabled: true, connectionState: "در حال اتصال صدا" });
            await this.ensurePeer();
            await this.attachLocalTrack();
            this.dispatchState("میکروفن روشن");
            return true;
        } catch (error) {
            const message = error.name === "NotAllowedError" ? MESSAGES.micDenied : MESSAGES.micUnavailable;
            this.dispatchEvent(new CustomEvent("error", { detail: message }));
            await this.roomService.updateParticipant({ micEnabled: false, connectionState: message }).catch(() => {});
            return false;
        }
    }

    async disableMicrophone() {
        this.localStream?.getTracks().forEach((track) => track.stop());
        this.localStream = null;
        if (this.localSender) await this.localSender.replaceTrack(null).catch(() => {});
        await this.roomService.updateParticipant({ micEnabled: false, connectionState: "میکروفن خاموش" }).catch(() => {});
        this.dispatchState("میکروفن خاموش");
    }

    setMuted(muted) {
        this.localStream?.getAudioTracks().forEach((track) => {
            track.enabled = !muted;
        });
        this.roomService.updateParticipant({
            micEnabled: Boolean(this.localStream),
            connectionState: muted ? "میکروفن بی‌صدا شد" : "میکروفن روشن"
        }).catch(() => {});
    }

    async ensurePeer() {
        if (this.peer) return;
        await this.cleanSignalingIfOwner();
        this.peer = new RTCPeerConnection(await this.buildRtcConfig());
        this.remoteDescriptionSet = false;
        this.pendingCandidates = [];
        this.seenCandidates.clear();

        this.peer.ontrack = (event) => {
            const [stream] = event.streams;
            this.remoteAudio.srcObject = stream;
            this.applyRemoteVolume();
            this.remoteAudio.play().catch(() => {});
            this.dispatchState("صدای همراه متصل است");
        };
        this.peer.onicecandidate = (event) => this.writeCandidate(event.candidate);
        this.peer.onconnectionstatechange = () => this.handleConnectionState();
        this.listenSignaling();

        if (this.roomService.role === "owner" && this.localStream) await this.attachLocalTrack();
    }

    async attachLocalTrack() {
        if (!this.peer || !this.localStream) return;
        const [track] = this.localStream.getAudioTracks();
        if (!track) return;
        if (this.localSender) {
            await this.localSender.replaceTrack(track);
        } else {
            this.localSender = this.peer.addTrack(track, this.localStream);
        }
        if (this.roomService.role === "owner" && this.peer.signalingState === "stable") {
            await this.createOffer();
        }
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
            this.turnCache = {
                iceServers: data.iceServers,
                expiresAt: Number(data.expiresAt || 0)
            };
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
        if (!this.peer || this.peer.signalingState !== "stable") return;
        const offer = await this.peer.createOffer({ offerToReceiveAudio: true, iceRestart: Boolean(options.iceRestart) });
        await this.peer.setLocalDescription(offer);
        const { db } = this.roomService.firebase;
        await db.set(db.child(this.roomService.roomRef(), "signaling/offer"), {
            type: offer.type,
            sdp: offer.sdp,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    async createAnswer(offer) {
        if (!this.peer || this.peer.signalingState !== "stable") return;
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
    }

    async applyAnswer(answer) {
        if (!this.peer || this.peer.signalingState !== "have-local-offer") return;
        await this.peer.setRemoteDescription(new RTCSessionDescription({ type: answer.type, sdp: answer.sdp }));
        this.remoteDescriptionSet = true;
        await this.flushCandidates();
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
            if (!candidate || candidate.uid === this.roomService.uid || this.seenCandidates.has(candidate.candidate)) return;
            this.seenCandidates.add(candidate.candidate);
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
        if (!candidate) return;
        const { db } = this.roomService.firebase;
        const path = this.roomService.role === "owner" ? "hostCandidates" : "guestCandidates";
        await db.push(db.child(this.roomService.roomRef(), `signaling/${path}`), {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    async handleConnectionState() {
        const state = this.peer?.connectionState || "closed";
        const labels = {
            connecting: "در حال اتصال صدا",
            connected: "صدای همراه متصل است",
            disconnected: "ارتباط صوتی قطع شد",
            failed: "تلاش مجدد",
            closed: "میکروفن خاموش"
        };
        await this.roomService.updateParticipant({ connectionState: labels[state] || state }).catch(() => {});
        this.dispatchState(labels[state] || state);
        if (state === "failed") await this.restartIce();
    }

    async restartIce() {
        try {
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

    fail(error) {
        safeLog("webrtc failed", { error: error.message });
        this.dispatchEvent(new CustomEvent("error", { detail: MESSAGES.rtcFailed }));
    }

    dispatchState(message) {
        this.dispatchEvent(new CustomEvent("state", { detail: message }));
    }

    closePeer() {
        this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
        this.peer?.getSenders().forEach((sender) => sender.track?.stop());
        this.peer?.close();
        this.peer = null;
        this.localSender = null;
        this.remoteAudio.srcObject = null;
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
