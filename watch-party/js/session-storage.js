import { isValidRoomCode, normalizeRoomCode } from "./utils.js";

export const ROOM_SESSION_KEY = "freemovie.watchParty.roomSession";
export const LEGACY_ROOM_SESSION_KEY = "watchPartySession";
export const RESTORE_MARKER_KEY = "freemovie.watchParty.restoreInProgress";
export const ROOM_SESSION_VERSION = 1;
export const DEFAULT_MAX_SESSION_AGE_MS = 6 * 60 * 60 * 1000;

const VALID_ROLES = new Set(["host", "guest"]);

export function makeRoomSession({ roomCode, role, uid, displayName = "", lastKnownStage = "lobby", savedAt = Date.now() }) {
    return {
        version: ROOM_SESSION_VERSION,
        roomCode: normalizeRoomCode(roomCode),
        role,
        uid: String(uid || ""),
        displayName: String(displayName || "").slice(0, 32),
        lastKnownStage,
        savedAt
    };
}

export function validateRoomSession(value, {
    uid = null,
    now = Date.now(),
    maxAgeMs = DEFAULT_MAX_SESSION_AGE_MS
} = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, reason: "malformed" };
    }
    if (value.version !== ROOM_SESSION_VERSION) {
        return { ok: false, reason: "version" };
    }
    const roomCode = normalizeRoomCode(value.roomCode);
    if (!isValidRoomCode(roomCode)) {
        return { ok: false, reason: "room-code" };
    }
    if (!VALID_ROLES.has(value.role)) {
        return { ok: false, reason: "role" };
    }
    if (!value.uid || typeof value.uid !== "string") {
        return { ok: false, reason: "uid" };
    }
    if (uid && value.uid !== uid) {
        return { ok: false, reason: "uid-mismatch" };
    }
    if (!Number.isFinite(value.savedAt)) {
        return { ok: false, reason: "saved-at" };
    }
    if (now - value.savedAt > maxAgeMs) {
        return { ok: false, reason: "expired" };
    }
    return {
        ok: true,
        session: {
            version: ROOM_SESSION_VERSION,
            roomCode,
            role: value.role,
            uid: value.uid,
            displayName: String(value.displayName || "").slice(0, 32),
            lastKnownStage: value.lastKnownStage === "active-room" ? "active-room" : "lobby",
            savedAt: value.savedAt
        }
    };
}

export function readStoredRoomSession({
    storage = globalThis.localStorage,
    uid = null,
    now = Date.now(),
    maxAgeMs = DEFAULT_MAX_SESSION_AGE_MS
} = {}) {
    const raw = storage?.getItem?.(ROOM_SESSION_KEY) || storage?.getItem?.(LEGACY_ROOM_SESSION_KEY);
    if (!raw) return { ok: false, reason: "missing" };
    try {
        return validateRoomSession(JSON.parse(raw), { uid, now, maxAgeMs });
    } catch {
        return { ok: false, reason: "malformed" };
    }
}

export function saveRoomSession(session, { storage = globalThis.localStorage } = {}) {
    const normalized = makeRoomSession(session);
    storage?.setItem?.(ROOM_SESSION_KEY, JSON.stringify(normalized));
    storage?.removeItem?.(LEGACY_ROOM_SESSION_KEY);
    return normalized;
}

export function clearStoredRoomSession({
    local = globalThis.localStorage,
    session = globalThis.sessionStorage
} = {}) {
    local?.removeItem?.(ROOM_SESSION_KEY);
    local?.removeItem?.(LEGACY_ROOM_SESSION_KEY);
    session?.removeItem?.(RESTORE_MARKER_KEY);
}

export function hasAnyStoredRoomSession({ storage = globalThis.localStorage } = {}) {
    return Boolean(storage?.getItem?.(ROOM_SESSION_KEY) || storage?.getItem?.(LEGACY_ROOM_SESSION_KEY));
}
