export const PUBLIC_ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PUBLIC_ROOM_ID_LENGTH = 12;
export const PUBLIC_ROOM_SCHEMA_VERSION = 1;
export const PUBLIC_ROOM_MAX_CAPACITY = 7;
export const PUBLIC_ROOM_MIN_CAPACITY = 2;
export const PUBLIC_ROOM_RETENTION_MS = 12 * 60 * 60 * 1000;
export const PUBLIC_ROOM_STALE_GUEST_MS = 2 * 60 * 1000;
export const PUBLIC_ROOM_STALE_HOST_MS = 2 * 60 * 1000;
export const PUBLIC_CHAT_MAX_LENGTH = 500;
export const PUBLIC_CHAT_MAX_MESSAGES = 300;
export const PUBLIC_REACTION_MAX_ITEMS = 50;
export const PUBLIC_REACTION_RETENTION_MS = 5 * 60 * 1000;
export const PUBLIC_REACTION_RATE_LIMIT_MS = 800;
export const PUBLIC_CREATE_RATE_LIMIT_MAX = 3;
export const PUBLIC_CREATE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const PUBLIC_JOIN_RATE_LIMIT_MAX = 10;
export const PUBLIC_JOIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const PUBLIC_CHAT_BURST_MAX = 5;
export const PUBLIC_CHAT_BURST_WINDOW_MS = 10 * 1000;
export const PUBLIC_SLOW_MODE_VALUES = Object.freeze([0, 3000, 5000, 10000, 30000]);
export const PUBLIC_ALLOWED_REACTIONS = Object.freeze(["❤️", "😂", "😱", "😢", "🍿", "👏", "🔥"]);

export class PublicRoomCommandError extends Error {
    constructor(code, message = code) {
        super(message);
        this.name = "PublicRoomCommandError";
        this.code = code;
    }
}

export function generatePublicRoomId(random = Math.random) {
    let id = "";
    for (let index = 0; index < PUBLIC_ROOM_ID_LENGTH; index += 1) {
        id += PUBLIC_ROOM_ID_ALPHABET[Math.floor(random() * PUBLIC_ROOM_ID_ALPHABET.length)];
    }
    return id;
}

export function assertUid(auth) {
    const uid = auth?.uid;
    if (!uid) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED");
    return uid;
}

export function sanitizeText(value, max, field = "text") {
    const text = String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
    if (!text) throw new PublicRoomCommandError("PUBLIC-ROOM-VALIDATION", `${field}-required`);
    return text;
}

export function sanitizeMessageText(value) {
    const text = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!text) throw new PublicRoomCommandError("PUBLIC-CHAT-VALIDATION", "message-required");
    if (text.length > PUBLIC_CHAT_MAX_LENGTH) throw new PublicRoomCommandError("PUBLIC-CHAT-TOO-LONG");
    return text;
}

export function validateSlowMode(value) {
    const slowModeMs = Number(value);
    if (!PUBLIC_SLOW_MODE_VALUES.includes(slowModeMs)) {
        throw new PublicRoomCommandError("PUBLIC-ROOM-VALIDATION", "slow-mode-invalid");
    }
    return slowModeMs;
}

export function validateCapacity(value) {
    const capacity = Number(value);
    if (!Number.isInteger(capacity) || capacity < PUBLIC_ROOM_MIN_CAPACITY || capacity > PUBLIC_ROOM_MAX_CAPACITY) {
        throw new PublicRoomCommandError("PUBLIC-ROOM-VALIDATION", "capacity-invalid");
    }
    return capacity;
}

export function validateMediaUrl(value, { production = false } = {}) {
    const text = sanitizeText(value, 1900, "mediaUrl");
    let url;
    try {
        url = new URL(text);
    } catch {
        throw new PublicRoomCommandError("PUBLIC-ROOM-VALIDATION", "media-url-invalid");
    }
    if (url.protocol === "https:") return url.href;
    const isLoopback = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (!production && isLoopback) return url.href;
    throw new PublicRoomCommandError("PUBLIC-ROOM-VALIDATION", "media-url-insecure");
}

export function makePublicRoomData({ uid, displayName, roomName, movieTitle, mediaUrl, capacity, language, roomId, now }) {
    const deleteAt = now + PUBLIC_ROOM_RETENTION_MS;
    return {
        room: {
            schemaVersion: PUBLIC_ROOM_SCHEMA_VERSION,
            hostUid: uid,
            roomName,
            movieTitle,
            language,
            capacity,
            createdAt: now,
            expiresAt: deleteAt,
            deleteAt,
            status: "open",
            settings: {
                chatEnabled: true,
                reactionsEnabled: true,
                slowModeMs: 3000
            },
            media: {
                url: mediaUrl,
                type: "direct",
                updatedAt: now,
                updatedBy: uid
            },
            playback: {
                paused: true,
                currentTime: 0,
                playbackRate: 1,
                revision: 1,
                action: "create",
                updatedAt: now,
                updatedBy: uid
            },
            members: {
                [uid]: makeMember({ uid, displayName, role: "host", now })
            },
            bans: null,
            chat: null,
            reactions: null
        },
        directory: buildPublicDirectoryEntry({
            schemaVersion: PUBLIC_ROOM_SCHEMA_VERSION,
            hostUid: uid,
            roomName,
            movieTitle,
            language,
            capacity,
            createdAt: now,
            deleteAt,
            status: "open",
            settings: {
                chatEnabled: true,
                reactionsEnabled: true
            },
            playback: { paused: true },
            members: {
                [uid]: { displayName, role: "host" }
            }
        }),
        hostIndex: {
            roomId,
            createdAt: now,
            deleteAt
        }
    };
}

export function makeMember({ displayName, role, now }) {
    return {
        displayName,
        role,
        online: true,
        joinedAt: now,
        lastSeen: now
    };
}

export function directoryFromRoom(room) {
    return buildPublicDirectoryEntry(room);
}

export function getPublicRoomMemberCount(room) {
    return Object.keys(room?.members || {}).length;
}

export function buildPublicDirectoryEntry(room) {
    const members = getPublicRoomMemberCount(room);
    const capacity = Number(room?.capacity || PUBLIC_ROOM_MAX_CAPACITY);
    const status = String(room?.status || "open");
    const entry = {
        schemaVersion: PUBLIC_ROOM_SCHEMA_VERSION,
        roomName: String(room?.roomName || "Public Room").slice(0, 40),
        movieTitle: String(room?.movieTitle || "Movie").slice(0, 80),
        hostDisplayName: String(room?.members?.[room?.hostUid]?.displayName || "Host").slice(0, 32),
        memberCount: members,
        capacity,
        createdAt: Number(room?.createdAt || 0),
        status,
        language: String(room?.language || "Persian").slice(0, 24),
        joinable: status === "open" && members < capacity,
        chatEnabled: room?.settings?.chatEnabled === true,
        reactionsEnabled: room?.settings?.reactionsEnabled === true,
        playbackPaused: room?.playback?.paused !== false,
        deleteAt: Number(room?.deleteAt || 0)
    };
    return assertSafeDirectoryEntry(entry);
}

export function assertSafeDirectoryEntry(entry) {
    const forbidden = ["media", "members", "hostUid", "bans", "chat", "reactions", "playback", "voice", "uid", "url"];
    for (const key of forbidden) {
        if (Object.prototype.hasOwnProperty.call(entry || {}, key)) {
            throw new PublicRoomCommandError("PUBLIC-ROOM-VALIDATION", `directory-private-key-${key}`);
        }
    }
    return entry;
}

export function publicRoomDeleteUpdates(roomId, hostUid) {
    const updates = {
        [`publicRooms/${roomId}`]: null,
        [`publicRoomDirectory/${roomId}`]: null,
        [`publicRoomMemberNotices/${roomId}`]: null,
        [`publicRoomEphemeral/${roomId}`]: null
    };
    if (hostUid) updates[`publicRoomHostIndex/${hostUid}`] = null;
    return updates;
}

export function assertRoomMember(room, uid) {
    const member = room?.members?.[uid];
    if (!member) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED");
    if (room?.bans?.[uid]) throw new PublicRoomCommandError("PUBLIC-ROOM-BANNED");
    if (room?.status === "ending") throw new PublicRoomCommandError("PUBLIC-ROOM-ENDED");
    return member;
}

export function assertRoomHost(room, uid) {
    if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
    if (room.hostUid !== uid) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED");
}

export function pruneByCreatedAt(collection, maxItems, cutoff = -Infinity) {
    const entries = Object.entries(collection || {})
        .filter(([, value]) => Number(value?.createdAt || 0) >= cutoff)
        .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
    const keep = new Set(entries.slice(Math.max(0, entries.length - maxItems)).map(([id]) => id));
    const updates = {};
    for (const [id] of Object.entries(collection || {})) {
        if (!keep.has(id)) updates[id] = null;
    }
    return updates;
}

export function safePublicRoomLog(operation, fields = {}) {
    const allowed = new Set(["operation", "success", "category", "durationBucket", "memberCountBucket", "functionVersion"]);
    const output = { operation: String(operation || "unknown").slice(0, 64) };
    for (const [key, value] of Object.entries(fields || {})) {
        if (!allowed.has(key)) continue;
        output[key] = typeof value === "number" || typeof value === "boolean"
            ? value
            : String(value || "").slice(0, 64);
    }
    return output;
}

async function enforceRateLimit({ db, path, now, max, windowMs, bypass = false }) {
    if (bypass) return { allowed: true };
    const ref = db.ref(path);
    let allowed = false;
    const timestamp = now();
    await ref.transaction((record) => {
        const windowStart = Number(record?.windowStart || 0);
        const count = Number(record?.count || 0);
        if (!record || windowStart + windowMs <= timestamp) {
            allowed = true;
            return { windowStart: timestamp, count: 1, expiresAt: timestamp + windowMs };
        }
        if (count >= max) {
            allowed = false;
            return record;
        }
        allowed = true;
        return { windowStart, count: count + 1, expiresAt: windowStart + windowMs };
    }, undefined, false);
    if (!allowed) throw new PublicRoomCommandError("PUBLIC-ROOM-RATE-LIMIT");
    return { allowed: true };
}

async function reconcilePublicRoomMemberCountInternal(db, roomId, room = null) {
    const currentRoom = room || (await db.ref(`publicRooms/${roomId}`).once("value")).val();
    if (!currentRoom) {
        await db.ref(`publicRoomDirectory/${roomId}`).set(null);
        return { room: null, memberCount: 0 };
    }
    const directory = buildPublicDirectoryEntry(currentRoom);
    await db.ref(`publicRoomDirectory/${roomId}`).set(directory);
    return { room: currentRoom, memberCount: directory.memberCount, directory };
}

export async function reconcilePublicRoomMemberCount({ db, roomId, room = null } = {}) {
    if (!db?.ref) throw new Error("database-required");
    const safeRoomId = sanitizeText(roomId, 12, "roomId");
    return reconcilePublicRoomMemberCountInternal(db, safeRoomId, room);
}

function childId(prefix, uid, timestamp) {
    const safeUid = String(uid || "user").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "user";
    return `${prefix}-${timestamp}-${safeUid}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makePublicRoomHandlers({ db, now = () => Date.now(), idGenerator = generatePublicRoomId, production = false } = {}) {
    if (!db?.ref) throw new Error("database-required");
    return {
        async createPublicRoom(data, auth) {
            const uid = assertUid(auth);
            const displayName = sanitizeText(data.displayName, 32, "displayName");
            const roomName = sanitizeText(data.roomName, 40, "roomName");
            const movieTitle = sanitizeText(data.movieTitle, 80, "movieTitle");
            const mediaUrl = validateMediaUrl(data.mediaUrl, { production });
            const capacity = validateCapacity(data.capacity);
            const language = sanitizeText(data.language || "فارسی", 24, "language");
            const timestamp = now();
            const hostIndexRef = db.ref(`publicRoomHostIndex/${uid}`);
            const existing = await hostIndexRef.once("value");
            if (existing.exists()) {
                const existingRoomId = existing.val()?.roomId;
                const existingRoom = existingRoomId ? (await db.ref(`publicRooms/${existingRoomId}`).once("value")).val() : null;
                if (existingRoom?.hostUid === uid) {
                    await reconcilePublicRoomMemberCountInternal(db, existingRoomId, existingRoom);
                    return { roomId: existingRoomId, reused: true };
                }
                await hostIndexRef.set(null);
            }
            await enforceRateLimit({
                db,
                path: `publicRoomRateLimits/create/${uid}`,
                now,
                max: PUBLIC_CREATE_RATE_LIMIT_MAX,
                windowMs: PUBLIC_CREATE_RATE_LIMIT_WINDOW_MS
            });
            let roomId;
            for (let attempt = 0; attempt < 12; attempt += 1) {
                roomId = idGenerator();
                const snap = await db.ref(`publicRooms/${roomId}`).once("value");
                if (!snap.exists()) break;
                roomId = "";
            }
            if (!roomId) throw new PublicRoomCommandError("PUBLIC-ROOM-UNKNOWN", "id-collision");
            const payload = makePublicRoomData({ uid, displayName, roomName, movieTitle, mediaUrl, capacity, language, roomId, now: timestamp });
            await db.ref().update({
                [`publicRooms/${roomId}`]: payload.room,
                [`publicRoomDirectory/${roomId}`]: payload.directory,
                [`publicRoomHostIndex/${uid}`]: payload.hostIndex
            });
            return { roomId };
        },

        async joinPublicRoom(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const displayName = sanitizeText(data.displayName, 32, "displayName");
            const roomRef = db.ref(`publicRooms/${roomId}`);
            const beforeJoin = (await roomRef.once("value")).val();
            if (!beforeJoin) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            const isRejoin = Boolean(beforeJoin.members?.[uid]);
            await enforceRateLimit({
                db,
                path: `publicRoomRateLimits/join/${uid}`,
                now,
                max: PUBLIC_JOIN_RATE_LIMIT_MAX,
                windowMs: PUBLIC_JOIN_RATE_LIMIT_WINDOW_MS,
                bypass: isRejoin
            });
            let outcome = null;
            const result = await roomRef.transaction((room) => {
                if (!room) {
                    outcome = "PUBLIC-ROOM-NOT-FOUND";
                    return room;
                }
                if (room.status === "ending") {
                    outcome = "PUBLIC-ROOM-ENDED";
                    return;
                }
                if (room.bans?.[uid]) {
                    outcome = "PUBLIC-ROOM-BANNED";
                    return;
                }
                room.members ||= {};
                if (room.members[uid]) {
                    room.members[uid] = {
                        ...room.members[uid],
                        displayName,
                        online: true,
                        lastSeen: now()
                    };
                    outcome = "joined";
                    return room;
                }
                if (room.status === "locked") {
                    outcome = "PUBLIC-ROOM-LOCKED";
                    return;
                }
                if (Object.keys(room.members).length >= Number(room.capacity || 0)) {
                    outcome = "PUBLIC-ROOM-FULL";
                    return;
                }
                room.members[uid] = makeMember({ uid, displayName, role: room.hostUid === uid ? "host" : "guest", now: now() });
                outcome = "joined";
                return room;
            }, undefined, false);
            if (!result.committed || outcome !== "joined") throw new PublicRoomCommandError(outcome || "PUBLIC-ROOM-UNKNOWN");
            const room = result.snapshot.val();
            await reconcilePublicRoomMemberCountInternal(db, roomId, room);
            return { roomId };
        },

        async leavePublicRoom(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            let removed = false;
            const result = await db.ref(`publicRooms/${roomId}`).transaction((room) => {
                if (!room) return room;
                if (room.hostUid === uid) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED", "host-cannot-leave");
                if (room.members?.[uid]) {
                    delete room.members[uid];
                    removed = true;
                }
                return room;
            }, undefined, false);
            if (result.snapshot.exists()) await reconcilePublicRoomMemberCountInternal(db, roomId, result.snapshot.val());
            return { left: removed };
        },

        async kickPublicRoomMember(data, auth) {
            const hostUid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const targetUid = sanitizeText(data.uid, 128, "uid");
            const snap = await db.ref(`publicRooms/${roomId}`).once("value");
            const room = snap.val();
            if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            if (room.hostUid !== hostUid) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED");
            if (targetUid === hostUid) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED", "host-cannot-kick-self");
            const kicked = Boolean(room.members?.[targetUid]);
            const nextRoom = {
                ...room,
                bans: { ...(room.bans || {}), [targetUid]: true },
                members: { ...(room.members || {}) }
            };
            delete nextRoom.members[targetUid];
            await db.ref().update({
                [`publicRooms/${roomId}/bans/${targetUid}`]: true,
                [`publicRooms/${roomId}/members/${targetUid}`]: null,
                [`publicRoomDirectory/${roomId}`]: buildPublicDirectoryEntry(nextRoom),
                [`publicRoomMemberNotices/${roomId}/${targetUid}`]: {
                    type: "kicked",
                    createdAt: now()
                },
                [`publicRoomEphemeral/${roomId}/chatBurst/${targetUid}`]: null
            });
            return { kicked };
        },

        async setPublicRoomLock(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const locked = Boolean(data.locked);
            const snap = await db.ref(`publicRooms/${roomId}`).once("value");
            const room = snap.val();
            if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            if (room.hostUid !== uid) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED");
            room.status = locked ? "locked" : "open";
            await db.ref().update({
                [`publicRooms/${roomId}/status`]: room.status,
                [`publicRoomDirectory/${roomId}`]: buildPublicDirectoryEntry(room)
            });
            return { locked };
        },

        async updatePublicRoomMedia(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const movieTitle = sanitizeText(data.movieTitle, 80, "movieTitle");
            const mediaUrl = validateMediaUrl(data.mediaUrl, { production });
            const timestamp = now();
            const snap = await db.ref(`publicRooms/${roomId}`).once("value");
            const room = snap.val();
            if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            assertRoomHost(room, uid);
            if (room.status === "ending") throw new PublicRoomCommandError("PUBLIC-ROOM-ENDED");
            const nextPlayback = {
                paused: true,
                currentTime: 0,
                playbackRate: 1,
                revision: Number(room.playback?.revision || 0) + 1,
                action: "media",
                updatedAt: timestamp,
                updatedBy: uid
            };
            const nextRoom = {
                ...room,
                movieTitle,
                media: {
                    url: mediaUrl,
                    type: "direct",
                    updatedAt: timestamp,
                    updatedBy: uid
                },
                playback: nextPlayback
            };
            await db.ref().update({
                [`publicRooms/${roomId}/movieTitle`]: movieTitle,
                [`publicRooms/${roomId}/media`]: nextRoom.media,
                [`publicRooms/${roomId}/playback`]: nextPlayback,
                [`publicRoomDirectory/${roomId}`]: buildPublicDirectoryEntry(nextRoom)
            });
            return { updated: true, movieTitle };
        },

        async sendPublicRoomMessage(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const text = sanitizeMessageText(data.text);
            const timestamp = now();
            const roomRef = db.ref(`publicRooms/${roomId}`);
            const snap = await roomRef.once("value");
            const room = snap.val();
            if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            const member = assertRoomMember(room, uid);
            if (room.settings?.chatEnabled !== true) throw new PublicRoomCommandError("PUBLIC-CHAT-DISABLED");
            await enforceRateLimit({
                db,
                path: `publicRoomEphemeral/${roomId}/chatBurst/${uid}`,
                now,
                max: PUBLIC_CHAT_BURST_MAX,
                windowMs: PUBLIC_CHAT_BURST_WINDOW_MS
            });
            const slowModeMs = PUBLIC_SLOW_MODE_VALUES.includes(Number(room.settings?.slowModeMs)) ? Number(room.settings.slowModeMs) : 0;
            const lastMessageAt = Number(member.lastMessageAt || 0);
            if (slowModeMs > 0 && lastMessageAt > 0 && lastMessageAt + slowModeMs > timestamp) {
                throw new PublicRoomCommandError("PUBLIC-CHAT-SLOW-MODE");
            }
            const messageId = childId("m", uid, timestamp);
            const message = {
                uid,
                displayName: member.displayName || "کاربر",
                text,
                createdAt: timestamp
            };
            const pruned = pruneByCreatedAt({ ...(room.chat || {}), [messageId]: message }, PUBLIC_CHAT_MAX_MESSAGES);
            const updates = {
                [`publicRooms/${roomId}/chat/${messageId}`]: message,
                [`publicRooms/${roomId}/members/${uid}/lastMessageAt`]: timestamp
            };
            for (const oldId of Object.keys(pruned)) updates[`publicRooms/${roomId}/chat/${oldId}`] = null;
            await db.ref().update(updates);
            return { messageId, createdAt: timestamp };
        },

        async deletePublicRoomMessage(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const messageId = sanitizeText(data.messageId, 120, "messageId");
            const snap = await db.ref(`publicRooms/${roomId}`).once("value");
            const room = snap.val();
            if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            assertRoomHost(room, uid);
            await db.ref(`publicRooms/${roomId}/chat/${messageId}`).set(null);
            return { deleted: true };
        },

        async sendPublicRoomReaction(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const emoji = String(data.emoji || "").trim();
            if (!PUBLIC_ALLOWED_REACTIONS.includes(emoji)) throw new PublicRoomCommandError("PUBLIC-REACTION-INVALID");
            const timestamp = now();
            const snap = await db.ref(`publicRooms/${roomId}`).once("value");
            const room = snap.val();
            if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            const member = assertRoomMember(room, uid);
            if (room.settings?.reactionsEnabled !== true) throw new PublicRoomCommandError("PUBLIC-REACTIONS-DISABLED");
            const lastReactionAt = Number(member.lastReactionAt || 0);
            if (lastReactionAt > 0 && lastReactionAt + PUBLIC_REACTION_RATE_LIMIT_MS > timestamp) {
                throw new PublicRoomCommandError("PUBLIC-REACTION-RATE-LIMIT");
            }
            const reactionId = childId("r", uid, timestamp);
            const reaction = {
                uid,
                emoji,
                createdAt: timestamp
            };
            const pruned = pruneByCreatedAt(
                { ...(room.reactions || {}), [reactionId]: reaction },
                PUBLIC_REACTION_MAX_ITEMS,
                timestamp - PUBLIC_REACTION_RETENTION_MS
            );
            const updates = {
                [`publicRooms/${roomId}/reactions/${reactionId}`]: reaction,
                [`publicRooms/${roomId}/members/${uid}/lastReactionAt`]: timestamp
            };
            for (const oldId of Object.keys(pruned)) updates[`publicRooms/${roomId}/reactions/${oldId}`] = null;
            await db.ref().update(updates);
            return { reactionId, createdAt: timestamp };
        },

        async updatePublicRoomSocialSettings(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const snap = await db.ref(`publicRooms/${roomId}`).once("value");
            const room = snap.val();
            if (!room) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-FOUND");
            assertRoomHost(room, uid);
            const nextSettings = { ...(room.settings || {}) };
            const updates = {};
            if (typeof data.chatEnabled === "boolean") {
                nextSettings.chatEnabled = data.chatEnabled;
                updates[`publicRooms/${roomId}/settings/chatEnabled`] = data.chatEnabled;
            }
            if (typeof data.reactionsEnabled === "boolean") {
                nextSettings.reactionsEnabled = data.reactionsEnabled;
                updates[`publicRooms/${roomId}/settings/reactionsEnabled`] = data.reactionsEnabled;
            }
            if (Object.prototype.hasOwnProperty.call(data, "slowModeMs")) {
                const slowModeMs = validateSlowMode(data.slowModeMs);
                nextSettings.slowModeMs = slowModeMs;
                updates[`publicRooms/${roomId}/settings/slowModeMs`] = slowModeMs;
            }
            if (!Object.keys(updates).length) throw new PublicRoomCommandError("PUBLIC-ROOM-VALIDATION", "settings-required");
            updates[`publicRoomDirectory/${roomId}`] = buildPublicDirectoryEntry({ ...room, settings: nextSettings });
            await db.ref().update(updates);
            return { settings: nextSettings };
        },

        async endPublicRoom(data, auth) {
            const uid = assertUid(auth);
            const roomId = sanitizeText(data.roomId, 12, "roomId");
            const snap = await db.ref(`publicRooms/${roomId}`).once("value");
            const room = snap.val();
            if (!room) return { ended: true };
            if (room.hostUid !== uid) throw new PublicRoomCommandError("PUBLIC-ROOM-NOT-AUTHORIZED");
            await db.ref().update(publicRoomDeleteUpdates(roomId, uid));
            return { ended: true };
        }
    };
}

export function selectExpiredPublicRooms(rooms = {}, now = Date.now()) {
    return Object.entries(rooms || {})
        .filter(([, room]) => Number(room?.deleteAt || 0) <= now)
        .map(([roomId]) => roomId);
}

export function selectStalePublicRoomActions(rooms = {}, now = Date.now()) {
    const removeMembers = [];
    const endRooms = [];
    for (const [roomId, room] of Object.entries(rooms || {})) {
        const host = room?.members?.[room.hostUid];
        if (host && host.online === false && Number(host.lastSeen || 0) + PUBLIC_ROOM_STALE_HOST_MS <= now) {
            endRooms.push(roomId);
            continue;
        }
        for (const [uid, member] of Object.entries(room?.members || {})) {
            if (uid !== room.hostUid && member.online === false && Number(member.lastSeen || 0) + PUBLIC_ROOM_STALE_GUEST_MS <= now) {
                removeMembers.push({ roomId, uid });
            }
        }
    }
    return { removeMembers, endRooms };
}

export async function cleanupPublicRooms({ db, now = Date.now(), logger = console } = {}) {
    if (!db?.ref) throw new Error("database-required");
    const timestamp = now;
    const snap = await db.ref("publicRooms").once("value");
    const rooms = snap.val() || {};
    const directorySnap = await db.ref("publicRoomDirectory").once("value");
    const directory = directorySnap.val() || {};
    const hostIndexSnap = await db.ref("publicRoomHostIndex").once("value");
    const hostIndex = hostIndexSnap.val() || {};
    const rateLimitsSnap = await db.ref("publicRoomRateLimits").once("value");
    const rateLimits = rateLimitsSnap.val() || {};
    const expired = selectExpiredPublicRooms(rooms, now);
    const stale = selectStalePublicRoomActions(rooms, now);
    const updates = {};
    for (const roomId of [...new Set([...expired, ...stale.endRooms])]) {
        Object.assign(updates, publicRoomDeleteUpdates(roomId, rooms[roomId]?.hostUid));
    }
    for (const { roomId, uid } of stale.removeMembers) {
        if (updates[`publicRooms/${roomId}`] === null) continue;
        delete rooms[roomId].members[uid];
        updates[`publicRooms/${roomId}/members/${uid}`] = null;
        updates[`publicRoomEphemeral/${roomId}/chatBurst/${uid}`] = null;
        updates[`publicRoomDirectory/${roomId}`] = buildPublicDirectoryEntry(rooms[roomId]);
    }
    for (const [roomId, room] of Object.entries(rooms)) {
        if (updates[`publicRooms/${roomId}`] === null) continue;
        const oldReactions = pruneByCreatedAt(room?.reactions || {}, PUBLIC_REACTION_MAX_ITEMS, now - PUBLIC_REACTION_RETENTION_MS);
        for (const reactionId of Object.keys(oldReactions)) updates[`publicRooms/${roomId}/reactions/${reactionId}`] = null;
        if (!directory[roomId]) updates[`publicRoomDirectory/${roomId}`] = buildPublicDirectoryEntry(room);
        else {
            const safe = buildPublicDirectoryEntry(room);
            if (Number(directory[roomId]?.memberCount) !== safe.memberCount || directory[roomId]?.joinable !== safe.joinable) {
                updates[`publicRoomDirectory/${roomId}`] = safe;
            }
        }
    }
    for (const roomId of Object.keys(directory)) {
        if (!rooms[roomId]) updates[`publicRoomDirectory/${roomId}`] = null;
    }
    for (const [uid, index] of Object.entries(hostIndex)) {
        if (!index?.roomId || !rooms[index.roomId] || rooms[index.roomId]?.hostUid !== uid) {
            updates[`publicRoomHostIndex/${uid}`] = null;
        }
    }
    for (const [scope, records] of Object.entries(rateLimits)) {
        for (const [uid, record] of Object.entries(records || {})) {
            if (Number(record?.expiresAt || 0) <= timestamp) {
                updates[`publicRoomRateLimits/${scope}/${uid}`] = null;
            }
        }
    }
    if (Object.keys(updates).length) await db.ref().update(updates);
    const report = {
        deletedCount: expired.length + stale.endRooms.length,
        removedMemberCount: stale.removeMembers.length,
        orphanDirectoryCount: Object.keys(directory).filter((roomId) => !rooms[roomId]).length
    };
    logger.info?.("public rooms cleanup completed", safePublicRoomLog("cleanupPublicRooms", {
        success: true,
        category: "cleanup",
        memberCountBucket: report.removedMemberCount
    }));
    return report;
}
