export class VoiceSignaling {
    constructor(roomService) {
        this.roomService = roomService;
        this.unsubscribers = [];
    }

    voiceRef(path = "") {
        const { db } = this.roomService.firebase;
        return db.child(this.roomService.roomRef(), path ? `voiceV2/${path}` : "voiceV2");
    }

    async createSession(sessionId) {
        const { db } = this.roomService.firebase;
        await db.remove(this.voiceRef()).catch(() => {});
        await db.set(this.voiceRef("sessionId"), sessionId);
        await db.set(this.voiceRef("createdAt"), this.roomService.firebase.serverTimestamp());
    }

    async clearSession() {
        if (this.roomService.role !== "owner") return;
        const { db } = this.roomService.firebase;
        await db.remove(this.voiceRef());
    }

    async writeOffer({ sessionId, type, sdp }) {
        const { db } = this.roomService.firebase;
        await db.set(this.voiceRef("offer"), {
            sessionId,
            type,
            sdp,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    async writeAnswer({ sessionId, type, sdp }) {
        const { db } = this.roomService.firebase;
        await db.set(this.voiceRef("answer"), {
            sessionId,
            type,
            sdp,
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    async writeCandidate(sessionId, candidate) {
        const { db } = this.roomService.firebase;
        const path = this.roomService.role === "owner" ? "hostCandidates" : "guestCandidates";
        await db.push(this.voiceRef(path), {
            sessionId,
            candidate: candidate?.candidate || "",
            sdpMid: candidate?.sdpMid || "",
            sdpMLineIndex: Number(candidate?.sdpMLineIndex || 0),
            uid: this.roomService.uid,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
    }

    listen({ onSession, onOffer, onAnswer, onCandidate }) {
        if (this.unsubscribers.length) return;
        const { db } = this.roomService.firebase;
        this.unsubscribers.push(db.onValue(this.voiceRef("sessionId"), (snap) => onSession?.(snap.val())));
        this.unsubscribers.push(db.onValue(this.voiceRef("offer"), (snap) => onOffer?.(snap.val())));
        this.unsubscribers.push(db.onValue(this.voiceRef("answer"), (snap) => onAnswer?.(snap.val())));
        const remotePath = this.roomService.role === "owner" ? "guestCandidates" : "hostCandidates";
        this.unsubscribers.push(db.onChildAdded(this.voiceRef(remotePath), (snap) => onCandidate?.(snap.val())));
    }

    destroy() {
        this.unsubscribers.splice(0).forEach((unsubscribe) => {
            try { unsubscribe(); } catch {}
        });
    }
}

export function createVoiceSessionId() {
    const raw = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `v2-${raw}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}
