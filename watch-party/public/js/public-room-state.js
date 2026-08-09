export const PUBLIC_ROOM_SCHEMA_VERSION = 1;
export const PUBLIC_ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PUBLIC_ROOM_ID_LENGTH = 12;
export const PUBLIC_ROOM_STATUSES = Object.freeze({
    OPEN: "open",
    LOCKED: "locked",
    ENDING: "ending"
});

export const PUBLIC_ROOM_MEMBER_ROLES = Object.freeze({
    HOST: "host",
    GUEST: "guest"
});

export const PUBLIC_ALLOWED_REACTIONS = Object.freeze(["❤️", "😂", "😱", "😢", "🍿", "👏", "🔥"]);
export const PUBLIC_SLOW_MODE_VALUES = Object.freeze([0, 3000, 5000, 10000, 30000]);

export const PUBLIC_APP_STATES = Object.freeze({
    LOADING: "loading",
    UNAVAILABLE: "unavailable",
    DIRECTORY: "directory",
    CREATE: "create",
    PREVIEW: "preview",
    JOINING: "joining",
    ROOM: "room",
    ENDED: "ended",
    KICKED: "kicked",
    ERROR: "error"
});

export function generatePublicRoomId(random = globalThis.crypto) {
    const bytes = new Uint8Array(PUBLIC_ROOM_ID_LENGTH);
    random.getRandomValues(bytes);
    return Array.from(bytes, (byte) => PUBLIC_ROOM_ID_ALPHABET[byte % PUBLIC_ROOM_ID_ALPHABET.length]).join("");
}

export function normalizePublicRoomId(value) {
    return String(value || "")
        .toUpperCase()
        .replace(/[\s-]/g, "")
        .split("")
        .filter((char) => PUBLIC_ROOM_ID_ALPHABET.includes(char))
        .join("")
        .slice(0, PUBLIC_ROOM_ID_LENGTH);
}

export function isValidPublicRoomId(value) {
    return new RegExp(`^[${PUBLIC_ROOM_ID_ALPHABET}]{10,12}$`).test(String(value || ""));
}

export function sanitizePublicText(value, maxLength) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function sanitizePublicMessage(value, maxLength = 500) {
    return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function clampPublicCapacity(value) {
    const number = Number(value);
    if (!Number.isInteger(number)) return 7;
    return Math.min(7, Math.max(2, number));
}

export function getMemberCount(room) {
    return Object.keys(room?.members || {}).length;
}

export function formatMemberOccupancy(memberCount, capacity) {
    const safeCapacity = clampPublicCapacity(capacity);
    const safeCount = clampMemberCount(memberCount, safeCapacity);
    return `${toPersianDigits(safeCount)} از ${toPersianDigits(safeCapacity)} نفر`;
}

export function formatRemainingSeats(memberCount, capacity) {
    const safeCapacity = clampPublicCapacity(capacity);
    const safeCount = clampMemberCount(memberCount, safeCapacity);
    const remaining = Math.max(0, safeCapacity - safeCount);
    if (remaining === 0) return "اتاق تکمیل است";
    return `${toPersianDigits(remaining)} جای خالی`;
}

export function getPublicMemberInitial(displayName) {
    const trimmed = String(displayName || "").trim();
    return trimmed ? trimmed[0].toLocaleUpperCase("fa-IR") : "؟";
}

export function getPublicMemberStatusLabel(member) {
    return member?.online ? "آنلاین" : "در حال اتصال مجدد";
}

export function sortPublicMembers(members, hostUid = "") {
    return [...(members || [])].sort((a, b) => {
        const aHost = a.uid === hostUid || a.role === PUBLIC_ROOM_MEMBER_ROLES.HOST;
        const bHost = b.uid === hostUid || b.role === PUBLIC_ROOM_MEMBER_ROLES.HOST;
        if (aHost !== bHost) return aHost ? -1 : 1;
        const aOnline = a.online === true;
        const bOnline = b.online === true;
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        const aJoined = Number(a.joinedAt || 0);
        const bJoined = Number(b.joinedAt || 0);
        if (aJoined !== bJoined) return aJoined - bJoined;
        return String(a.displayName || a.uid || "").localeCompare(String(b.displayName || b.uid || ""), "fa");
    });
}

export function isPublicRoomJoinable(directoryRoom) {
    return Boolean(
        directoryRoom
        && directoryRoom.joinable === true
        && directoryRoom.status === PUBLIC_ROOM_STATUSES.OPEN
        && Number(directoryRoom.memberCount || 0) < Number(directoryRoom.capacity || 0)
    );
}

export function formatRelativeAge(timestamp, now = Date.now()) {
    const diffMs = Math.max(0, now - Number(timestamp || now));
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
    const hours = Math.floor(minutes / 60);
    return `${toPersianDigits(hours)} ساعت پیش`;
}

export function formatPublicClock(timestamp) {
    try {
        return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(Number(timestamp || Date.now())));
    } catch {
        return "";
    }
}

export function formatSlowModeLabel(value) {
    const ms = Number(value || 0);
    if (ms <= 0) return "خاموش";
    return `${toPersianDigits(Math.round(ms / 1000))} ثانیه`;
}

export function toPersianDigits(value) {
    return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function clampMemberCount(value, capacity) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return 0;
    return Math.min(capacity, Math.max(0, number));
}
