import { generateRoomCode, isValidRoomCode, MESSAGES, normalizeRoomCode, sanitizeDisplayName, safeLog } from "./utils.js";

const SCHEMA_VERSION = 1;

export class RoomService extends EventTarget {
    constructor(firebase, config) {
        super();
        this.firebase = firebase;
        this.config = config;
        this.roomCode = null;
        this.role = null;
        this.uid = firebase.user.uid;
        this.offsetMs = 0;
        this.unsubscribeRoom = null;
        this.unsubscribeConnected = null;
        this.unsubscribeOffset = null;
    }

    async initServerClock() {
        const { db, database } = this.firebase;
        this.unsubscribeOffset?.();
        this.unsubscribeOffset = db.onValue(db.ref(database, ".info/serverTimeOffset"), (snap) => {
            this.offsetMs = snap.val() || 0;
            this.dispatchEvent(new CustomEvent("offset", { detail: this.offsetMs }));
        });
    }

    async createRoom({ displayName, mediaUrl, subtitle, autoPauseOnBuffer, shouldContinue = () => true }) {
        const expiresAt = Date.now() + (this.config.roomLifetimeMs || 21600000);
        for (let attempt = 0; attempt < 12; attempt += 1) {
            if (!shouldContinue()) throw new Error("operation-cancelled");
            const code = generateRoomCode();
            const roomRef = this.roomRef(code);
            const result = await this.firebase.db.runTransaction(roomRef, (current) => {
                if (current !== null) return current;
                return this.makeRoomData({ code, displayName, mediaUrl, subtitle, autoPauseOnBuffer, expiresAt });
            }, { applyLocally: false });
            if (result.committed && result.snapshot.val()?.ownerUid === this.uid) {
                if (!shouldContinue()) {
                    await this.firebase.db.remove(roomRef).catch(() => {});
                    throw new Error("operation-cancelled");
                }
                await this.enterRoom(code, "owner", displayName);
                return code;
            }
        }
        throw new Error("ساخت کد یکتا ناموفق بود. دوباره تلاش کنید.");
    }

    makeRoomData({ displayName, mediaUrl, subtitle, autoPauseOnBuffer, expiresAt }) {
        const now = Date.now();
        return {
            schemaVersion: SCHEMA_VERSION,
            ownerUid: this.uid,
            guestUid: null,
            status: "open",
            createdAt: now,
            expiresAt,
            settings: {
                allowBothControls: true,
                autoPauseOnBuffer: Boolean(autoPauseOnBuffer)
            },
            media: {
                url: mediaUrl,
                type: "direct",
                playbackMode: "direct",
                compatibilityJobId: null,
                compatibilityManifestUrl: null,
                compatibilityExpiresAt: null,
                originalContainer: null,
                audioTrackId: null,
                updatedAt: now,
                updatedBy: this.uid
            },
            subtitle: subtitle || { mode: "none", updatedAt: now, updatedBy: this.uid },
            playback: {
                paused: true,
                pauseReason: "manual",
                currentTime: 0,
                playbackRate: 1,
                revision: 1,
                action: "create",
                updatedAt: now,
                updatedBy: this.uid
            },
            participants: {
                [this.uid]: this.makeParticipant(displayName, "owner", now)
            },
            chat: null,
            reactions: null,
            signaling: null
        };
    }

    makeParticipant(displayName, role, timestamp = Date.now()) {
        return {
            displayName: sanitizeDisplayName(displayName),
            role,
            online: true,
            ready: false,
            buffering: false,
            micEnabled: false,
            joinedAt: timestamp,
            lastSeen: timestamp,
            connectionState: "در حال اتصال"
        };
    }

    async joinRoom(rawCode, displayName, options = {}) {
        const shouldContinue = options.shouldContinue || (() => true);
        const code = normalizeRoomCode(rawCode);
        if (!isValidRoomCode(code)) throw new Error(MESSAGES.invalidRoom);
        if (!shouldContinue()) throw new Error("operation-cancelled");
        const roomRef = this.roomRef(code);
        const ownerSnap = await this.firebase.db.get(this.firebase.db.child(roomRef, "ownerUid")).catch(() => null);
        if (!ownerSnap?.exists()) throw new Error(MESSAGES.roomNotFound);
        if (ownerSnap.val() === this.uid) {
            if (!shouldContinue()) throw new Error("operation-cancelled");
            await this.enterRoom(code, "owner", displayName);
            return code;
        }
        const guestRef = this.firebase.db.child(roomRef, "guestUid");
        let result;
        try {
            result = await this.firebase.db.runTransaction(guestRef, (current) => {
                if (current === null || current === undefined || current === this.uid) return this.uid;
                return current;
            }, { applyLocally: false });
        } catch (error) {
            await this.throwJoinStateError(roomRef);
            throw error;
        }
        if (result.snapshot.val() !== this.uid) throw new Error(MESSAGES.roomFull);
        if (!shouldContinue()) {
            await this.firebase.db.runTransaction(guestRef, (current) => current === this.uid ? null : current).catch(() => {});
            throw new Error("operation-cancelled");
        }
        this.roomCode = code;
        await this.firebase.db.set(this.participantRef(this.uid), this.makeParticipant(displayName, "guest", Date.now()));
        if (!shouldContinue()) {
            await this.leaveRoom().catch(() => {});
            throw new Error("operation-cancelled");
        }
        await this.enterRoom(code, "guest", displayName);
        return code;
    }

    async throwJoinStateError(roomRef) {
        const { db } = this.firebase;
        const [statusSnap, expiresSnap, guestSnap] = await Promise.all([
            db.get(db.child(roomRef, "status")).catch(() => null),
            db.get(db.child(roomRef, "expiresAt")).catch(() => null),
            db.get(db.child(roomRef, "guestUid")).catch(() => null)
        ]);
        const status = statusSnap?.val();
        const expiresAt = expiresSnap?.val();
        if (status === null || status === undefined) throw new Error(MESSAGES.roomNotFound);
        if (status === "ended") throw new Error(MESSAGES.roomEnded);
        if (status === "expired" || (expiresAt && expiresAt < Date.now())) throw new Error(MESSAGES.roomExpired);
        if (guestSnap?.val()) throw new Error(MESSAGES.roomFull);
    }

    async enterRoom(code, role, displayName) {
        this.roomCode = code;
        this.role = role;
        const participantRef = this.participantRef(this.uid);
        await this.firebase.db.update(participantRef, {
            displayName: sanitizeDisplayName(displayName),
            role,
            online: true,
            lastSeen: this.firebase.serverTimestamp(),
            connectionState: "متصل"
        });
        await this.setupPresence();
        this.listenRoom();
    }

    async setupPresence() {
        const { db, database } = this.firebase;
        const connectedRef = db.ref(database, ".info/connected");
        const participantRef = this.participantRef(this.uid);
        this.unsubscribeConnected?.();
        this.unsubscribeConnected = db.onValue(connectedRef, async (snap) => {
            if (snap.val() !== true) {
                this.dispatchEvent(new CustomEvent("connection", { detail: "offline" }));
                return;
            }
            try {
                await db.onDisconnect(participantRef).update({
                    online: false,
                    ready: false,
                    buffering: false,
                    micEnabled: false,
                    lastSeen: this.firebase.serverTimestamp(),
                    connectionState: MESSAGES.reconnecting
                });
                await db.update(participantRef, {
                    online: true,
                    lastSeen: this.firebase.serverTimestamp(),
                    connectionState: "متصل"
                });
                this.dispatchEvent(new CustomEvent("connection", { detail: "online" }));
            } catch (error) {
                safeLog("presence update failed", { error: error?.message || String(error) });
                this.dispatchEvent(new CustomEvent("roomError", { detail: error }));
            }
        });
    }

    listenRoom() {
        this.unsubscribeRoom?.();
        this.unsubscribeRoom = this.firebase.db.onValue(this.roomRef(), (snap) => {
            const room = snap.val();
            this.dispatchEvent(new CustomEvent("room", { detail: room }));
        }, (error) => {
            safeLog("room listener error", { error: error.message });
            this.dispatchEvent(new CustomEvent("roomError", { detail: error }));
        });
    }

    async updateParticipant(patch) {
        return this.firebase.db.update(this.participantRef(this.uid), {
            ...patch,
            lastSeen: this.firebase.serverTimestamp()
        });
    }

    async setReady(ready) {
        return this.updateParticipant({ ready: Boolean(ready) });
    }

    async setPlaybackPatch(patch) {
        const playbackRef = this.firebase.db.child(this.roomRef(), "playback");
        return this.firebase.db.runTransaction(playbackRef, (current) => {
            const nextRevision = (current?.revision || 0) + 1;
            return {
                ...(current || {}),
                ...patch,
                revision: nextRevision,
                updatedAt: this.firebase.serverTimestamp(),
                updatedBy: this.uid
            };
        });
    }

    async updateMedia(url) {
        await this.firebase.db.update(this.firebase.db.child(this.roomRef(), "media"), {
            url,
            type: "direct",
            playbackMode: "direct",
            compatibilityJobId: null,
            compatibilityManifestUrl: null,
            compatibilityExpiresAt: null,
            originalContainer: null,
            audioTrackId: null,
            updatedAt: this.firebase.serverTimestamp(),
            updatedBy: this.uid
        });
        return this.setPlaybackPatch({ paused: true, pauseReason: "manual", currentTime: 0, action: "media" });
    }

    async updateCompatibilityMedia(patch) {
        return this.firebase.db.update(this.firebase.db.child(this.roomRef(), "media"), {
            playbackMode: patch.playbackMode || "gateway-hls",
            compatibilityJobId: patch.compatibilityJobId || null,
            compatibilityManifestUrl: patch.compatibilityManifestUrl || null,
            compatibilityExpiresAt: patch.compatibilityExpiresAt || null,
            originalContainer: patch.originalContainer || null,
            updatedAt: this.firebase.serverTimestamp(),
            updatedBy: this.uid
        });
    }

    async updateAudioTrack(audioTrackId) {
        return this.firebase.db.update(this.firebase.db.child(this.roomRef(), "media"), {
            audioTrackId: audioTrackId ? String(audioTrackId).slice(0, 64) : null,
            updatedAt: this.firebase.serverTimestamp(),
            updatedBy: this.uid
        });
    }

    async updateSubtitle(subtitle) {
        return this.firebase.db.set(this.firebase.db.child(this.roomRef(), "subtitle"), {
            ...subtitle,
            updatedAt: this.firebase.serverTimestamp(),
            updatedBy: this.uid
        });
    }

    async endRoom() {
        if (this.role !== "owner") return;
        const { db } = this.firebase;
        await Promise.all([
            db.set(db.child(this.roomRef(), "status"), "ended"),
            db.set(db.child(this.roomRef(), "endedAt"), this.firebase.serverTimestamp()),
            db.set(db.child(this.roomRef(), "endedBy"), this.uid)
        ]);
    }

    async leaveRoom() {
        if (!this.roomCode) return;
        const updates = {
            online: false,
            ready: false,
            buffering: false,
            micEnabled: false,
            connectionState: "اتاق ترک شد",
            lastSeen: this.firebase.serverTimestamp()
        };
        await this.firebase.db.update(this.participantRef(this.uid), updates);
        if (this.role === "guest") {
            await this.firebase.db.runTransaction(this.firebase.db.child(this.roomRef(), "guestUid"), (current) => current === this.uid ? null : current);
        }
        this.detach();
    }

    detach() {
        this.unsubscribeRoom?.();
        this.unsubscribeConnected?.();
        this.unsubscribeOffset?.();
        this.unsubscribeRoom = null;
        this.unsubscribeConnected = null;
        this.unsubscribeOffset = null;
    }

    roomRef(code = this.roomCode) {
        return this.firebase.db.ref(this.firebase.database, `rooms/${code}`);
    }

    participantRef(uid) {
        return this.firebase.db.ref(this.firebase.database, `rooms/${this.roomCode}/participants/${uid}`);
    }
}
