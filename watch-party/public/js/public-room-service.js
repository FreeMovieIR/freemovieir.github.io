import { normalizePublicRoomError, PublicRoomError, PUBLIC_ROOM_ERROR_CODES } from "./public-room-errors.js";
import { isValidPublicRoomId } from "./public-room-state.js";

const FIREBASE_VERSION = "10.12.5";
const APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;
const DB_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`;
const FUNCTIONS_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-functions.js`;
const PUBLIC_APP_NAME = "freemovieir-public-rooms";
const connectedEmulators = new Set();

export async function loadPublicRoomConfig() {
    try {
        const module = await import(withBuildQuery("../../runtime-config.js"));
        return module.watchPartyConfig;
    } catch {
        try {
            const module = await import("../../firebase-config.js");
            return module.watchPartyConfig;
        } catch {
            return { missing: true, publicRooms: { enabled: false } };
        }
    }
}

export class PublicRoomService extends EventTarget {
    constructor({ config, modules, app, auth, database, functions }) {
        super();
        this.config = config;
        this.modules = modules;
        this.app = app;
        this.auth = auth;
        this.database = database;
        this.functions = functions;
        this.user = null;
        this.roomId = null;
        this.role = null;
        this.unsubDirectory = null;
        this.unsubRoom = null;
        this.unsubNotice = null;
        this.unsubConnected = null;
    }

    static async create(config) {
        const modules = await loadFirebaseModules();
        const app = modules.app.getApps().find((item) => item.name === PUBLIC_APP_NAME)
            || modules.app.initializeApp(config.firebase, PUBLIC_APP_NAME);
        const auth = modules.auth.getAuth(app);
        const database = modules.db.getDatabase(app);
        const region = config?.emulators?.functions?.region || "us-central1";
        const functions = modules.functions.getFunctions(app, region);
        if (shouldUsePublicEmulators(config)) connectEmulatorsOnce({ config, auth, database, functions, modules });
        return new PublicRoomService({ config, modules, app, auth, database, functions });
    }

    async ensureAuth() {
        if (this.auth.currentUser) {
            this.user = this.auth.currentUser;
            return this.user;
        }
        await this.modules.auth.signInAnonymously(this.auth);
        this.user = this.auth.currentUser;
        return this.user;
    }

    listenDirectory(callback) {
        const { db } = this.modules;
        this.unsubDirectory?.();
        const limit = Number(this.config?.publicRooms?.maxDirectoryRooms || 50);
        const query = db.query(db.ref(this.database, "publicRoomDirectory"), db.orderByChild("createdAt"), db.limitToLast(limit));
        this.unsubDirectory = db.onValue(query, (snap) => {
            const rooms = Object.entries(snap.val() || {})
                .map(([id, value]) => ({ id, ...value }))
                .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
            callback(rooms);
        }, (error) => this.dispatchEvent(new CustomEvent("error", { detail: normalizePublicRoomError(error) })));
        return this.unsubDirectory;
    }

    async getDirectoryRoom(roomId) {
        if (!isValidPublicRoomId(roomId)) throw new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.NOT_FOUND);
        const { db } = this.modules;
        const snap = await db.get(db.ref(this.database, `publicRoomDirectory/${roomId}`));
        return snap.exists() ? { id: roomId, ...snap.val() } : null;
    }

    async createRoom(payload) {
        await this.ensureAuth();
        const result = await this.call("createPublicRoom", payload);
        this.roomId = result.roomId;
        this.role = "host";
        await this.setupPresence();
        return result;
    }

    async joinRoom(roomId, displayName) {
        await this.ensureAuth();
        const result = await this.call("joinPublicRoom", { roomId, displayName });
        this.roomId = result.roomId;
        this.role = "guest";
        await this.setupPresence();
        return result;
    }

    async leaveRoom() {
        if (!this.roomId) return;
        await this.call("leavePublicRoom", { roomId: this.roomId });
        this.clearRoomSession();
    }

    async kickMember(uid) {
        return this.call("kickPublicRoomMember", { roomId: this.roomId, uid });
    }

    async setLock(locked) {
        return this.call("setPublicRoomLock", { roomId: this.roomId, locked: Boolean(locked) });
    }

    async updateMedia({ movieTitle, mediaUrl }) {
        if (!this.roomId) return {};
        return this.call("updatePublicRoomMedia", { roomId: this.roomId, movieTitle, mediaUrl });
    }

    async sendMessage(text) {
        if (!this.roomId) return {};
        return this.call("sendPublicRoomMessage", { roomId: this.roomId, text });
    }

    async deleteMessage(messageId) {
        if (!this.roomId) return {};
        return this.call("deletePublicRoomMessage", { roomId: this.roomId, messageId });
    }

    async sendReaction(emoji) {
        if (!this.roomId) return {};
        return this.call("sendPublicRoomReaction", { roomId: this.roomId, emoji });
    }

    async updateSocialSettings(settings) {
        if (!this.roomId) return {};
        return this.call("updatePublicRoomSocialSettings", { roomId: this.roomId, ...settings });
    }

    async endRoom() {
        if (!this.roomId) return;
        await this.call("endPublicRoom", { roomId: this.roomId });
        this.clearRoomSession();
    }

    async updatePlayback(patch) {
        if (!this.roomId) return;
        const { db } = this.modules;
        const snap = await db.get(db.ref(this.database, `publicRooms/${this.roomId}/playback`));
        const previous = snap.val() || {};
        const playback = {
            paused: Boolean(patch.paused),
            currentTime: Math.max(0, Number(patch.currentTime || 0)),
            playbackRate: Math.min(4, Math.max(0.25, Number(patch.playbackRate || 1))),
            revision: Number(previous.revision || 0) + 1,
            action: String(patch.action || "update").slice(0, 32),
            updatedAt: this.modules.db.serverTimestamp(),
            updatedBy: this.user.uid
        };
        await db.update(db.ref(this.database), {
            [`publicRooms/${this.roomId}/playback`]: playback,
            [`publicRoomDirectory/${this.roomId}/playbackPaused`]: playback.paused
        });
    }

    listenRoom(roomId, callback) {
        if (!isValidPublicRoomId(roomId)) throw new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.NOT_FOUND);
        const { db } = this.modules;
        this.roomId = roomId;
        this.unsubRoom?.();
        this.unsubRoom = db.onValue(db.ref(this.database, `publicRooms/${roomId}`), (snap) => {
            if (!snap.exists()) {
                callback(null);
                return;
            }
            callback({ id: roomId, ...snap.val() });
        }, (error) => this.dispatchEvent(new CustomEvent("error", { detail: normalizePublicRoomError(error) })));
        return this.unsubRoom;
    }

    listenMemberNotice(roomId, callback) {
        if (!isValidPublicRoomId(roomId) || !this.user?.uid) return () => {};
        const { db } = this.modules;
        this.unsubNotice?.();
        this.unsubNotice = db.onValue(db.ref(this.database, `publicRoomMemberNotices/${roomId}/${this.user.uid}`), (snap) => {
            if (snap.exists()) callback(snap.val());
        }, (error) => this.dispatchEvent(new CustomEvent("error", { detail: normalizePublicRoomError(error) })));
        return this.unsubNotice;
    }

    async setupPresence() {
        if (!this.roomId || !this.user) return;
        const { db } = this.modules;
        const memberRef = db.ref(this.database, `publicRooms/${this.roomId}/members/${this.user.uid}`);
        this.unsubConnected?.();
        this.unsubConnected = db.onValue(db.ref(this.database, ".info/connected"), async (snap) => {
            if (snap.val() !== true) return;
            await db.onDisconnect(memberRef).update({
                online: false,
                lastSeen: db.serverTimestamp()
            }).catch(() => {});
            await db.update(memberRef, {
                online: true,
                lastSeen: db.serverTimestamp()
            }).catch(() => {});
        });
    }

    async call(name, payload) {
        try {
            const callable = this.modules.functions.httpsCallable(this.functions, name);
            const timeoutMs = Number(this.config?.publicRooms?.functionTimeoutMs || 10000);
            const result = await withTimeout(callable(payload || {}), timeoutMs);
            return result.data?.result || result.data || {};
        } catch (error) {
            throw normalizePublicRoomError(error);
        }
    }

    clearRoomSession() {
        this.unsubRoom?.();
        this.unsubNotice?.();
        this.unsubConnected?.();
        this.unsubRoom = null;
        this.unsubNotice = null;
        this.unsubConnected = null;
        this.roomId = null;
        this.role = null;
    }

    destroy() {
        this.unsubDirectory?.();
        this.clearRoomSession();
    }
}

async function loadFirebaseModules() {
    const [app, auth, db, functions] = await Promise.all([
        import(APP_URL),
        import(AUTH_URL),
        import(DB_URL),
        import(FUNCTIONS_URL)
    ]);
    return { app, auth, db, functions };
}

function shouldUsePublicEmulators(config, hostname = globalThis.location?.hostname || "") {
    if (config?.environment === "production") return false;
    return Boolean(config?.useEmulators && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"));
}

function connectEmulatorsOnce({ config, auth, database, functions, modules }) {
    if (connectedEmulators.has(PUBLIC_APP_NAME)) return;
    modules.auth.connectAuthEmulator(auth, config.emulators.auth.url, { disableWarnings: true });
    modules.db.connectDatabaseEmulator(database, config.emulators.database.host, Number(config.emulators.database.port));
    const fn = config.emulators.functions || { host: "127.0.0.1", port: 5001 };
    modules.functions.connectFunctionsEmulator(functions, fn.host, Number(fn.port));
    connectedEmulators.add(PUBLIC_APP_NAME);
}

function withBuildQuery(path) {
    const buildId = String(globalThis.wpBuildId || "");
    return buildId ? `${path}?v=${encodeURIComponent(buildId)}` : path;
}

function withTimeout(promise, timeoutMs) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error("PUBLIC-ROOM-TIMEOUT");
            error.code = "PUBLIC-ROOM-TIMEOUT";
            reject(error);
        }, Math.max(1000, timeoutMs));
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
