export const WATCH_PARTY_MAX_RETENTION_MS = 12 * 60 * 60 * 1000;

export function shouldDeleteRoom(room, now = Date.now()) {
    if (!room || typeof room !== "object") return false;
    const deleteAt = Number(room.deleteAt || 0);
    if (Number.isFinite(deleteAt) && deleteAt > 0) return deleteAt <= now;
    const createdAt = Number(room.createdAt || 0);
    return Number.isFinite(createdAt) && createdAt > 0 && createdAt + WATCH_PARTY_MAX_RETENTION_MS <= now;
}

export function selectExpiredRooms(rooms = {}, now = Date.now(), limit = 100) {
    return Object.entries(rooms || {})
        .filter(([code, room]) => /^[A-HJ-NP-Z2-9]{8}$/.test(code) && shouldDeleteRoom(room, now))
        .sort((a, b) => Number(a[1]?.deleteAt || a[1]?.createdAt || 0) - Number(b[1]?.deleteAt || b[1]?.createdAt || 0))
        .slice(0, Math.max(1, limit))
        .map(([code]) => code);
}

export async function cleanupExpiredRooms({ db, now = Date.now(), batchSize = 100, logger = console } = {}) {
    if (!db?.ref) throw new Error("database-required");
    const query = db.ref("rooms")
        .orderByChild("deleteAt")
        .endAt(now)
        .limitToFirst(batchSize);
    const snap = await query.once("value");
    const rooms = snap.val() || {};
    const codes = selectExpiredRooms(rooms, now, batchSize);
    await Promise.all(codes.map((code) => db.ref(`rooms/${code}`).remove()));
    logger.info?.("watch-party cleanup completed", { deletedCount: codes.length });
    return { deletedCount: codes.length };
}
