export const PUBLIC_ROOM_ERROR_CODES = Object.freeze({
    NOT_FOUND: "PUBLIC-ROOM-NOT-FOUND",
    FULL: "PUBLIC-ROOM-FULL",
    LOCKED: "PUBLIC-ROOM-LOCKED",
    BANNED: "PUBLIC-ROOM-BANNED",
    ENDED: "PUBLIC-ROOM-ENDED",
    NETWORK: "PUBLIC-ROOM-NETWORK",
    TIMEOUT: "PUBLIC-ROOM-TIMEOUT",
    NOT_AUTHORIZED: "PUBLIC-ROOM-NOT-AUTHORIZED",
    RATE_LIMIT: "PUBLIC-ROOM-RATE-LIMIT",
    VALIDATION: "PUBLIC-ROOM-VALIDATION",
    CHAT_DISABLED: "PUBLIC-CHAT-DISABLED",
    CHAT_SLOW_MODE: "PUBLIC-CHAT-SLOW-MODE",
    CHAT_NOT_MEMBER: "PUBLIC-CHAT-NOT-MEMBER",
    CHAT_RATE_LIMIT: "PUBLIC-CHAT-RATE-LIMIT",
    CHAT_TOO_LONG: "PUBLIC-CHAT-TOO-LONG",
    CHAT_NETWORK: "PUBLIC-CHAT-NETWORK",
    CHAT_UNKNOWN: "PUBLIC-CHAT-UNKNOWN",
    REACTIONS_DISABLED: "PUBLIC-REACTIONS-DISABLED",
    REACTION_RATE_LIMIT: "PUBLIC-REACTION-RATE-LIMIT",
    REACTION_NOT_MEMBER: "PUBLIC-REACTION-NOT-MEMBER",
    REACTION_INVALID: "PUBLIC-REACTION-INVALID",
    REACTION_NETWORK: "PUBLIC-REACTION-NETWORK",
    REACTION_UNKNOWN: "PUBLIC-REACTION-UNKNOWN",
    UNKNOWN: "PUBLIC-ROOM-UNKNOWN"
});

const MESSAGES = {
    [PUBLIC_ROOM_ERROR_CODES.NOT_FOUND]: "این اتاق پیدا نشد.",
    [PUBLIC_ROOM_ERROR_CODES.FULL]: "ظرفیت اتاق تکمیل است.",
    [PUBLIC_ROOM_ERROR_CODES.LOCKED]: "اتاق قفل است.",
    [PUBLIC_ROOM_ERROR_CODES.BANNED]: "امکان ورود دوباره به این اتاق را ندارید.",
    [PUBLIC_ROOM_ERROR_CODES.ENDED]: "میزبان اتاق را پایان داد.",
    [PUBLIC_ROOM_ERROR_CODES.NETWORK]: "ارتباط با سرویس برقرار نشد.",
    [PUBLIC_ROOM_ERROR_CODES.TIMEOUT]: "درخواست بیشتر از حد معمول طول کشید.",
    [PUBLIC_ROOM_ERROR_CODES.NOT_AUTHORIZED]: "اجازه انجام این کار را ندارید.",
    [PUBLIC_ROOM_ERROR_CODES.RATE_LIMIT]: "تعداد تلاش‌ها زیاد بوده است. کمی بعد دوباره امتحان کنید.",
    [PUBLIC_ROOM_ERROR_CODES.VALIDATION]: "اطلاعات وارد شده معتبر نیست.",
    [PUBLIC_ROOM_ERROR_CODES.CHAT_DISABLED]: "میزبان گفتگو را موقتاً غیرفعال کرده است.",
    [PUBLIC_ROOM_ERROR_CODES.CHAT_SLOW_MODE]: "کمی صبر کن؛ حالت آهسته این اتاق فعال است.",
    [PUBLIC_ROOM_ERROR_CODES.CHAT_NOT_MEMBER]: "برای گفتگو باید عضو اتاق باشید.",
    [PUBLIC_ROOM_ERROR_CODES.CHAT_RATE_LIMIT]: "کمی صبر کن؛ حالت آهسته این اتاق فعال است.",
    [PUBLIC_ROOM_ERROR_CODES.CHAT_TOO_LONG]: "پیام بیش از حد طولانی است.",
    [PUBLIC_ROOM_ERROR_CODES.CHAT_NETWORK]: "ارسال پیام انجام نشد. اتصال را بررسی کنید.",
    [PUBLIC_ROOM_ERROR_CODES.CHAT_UNKNOWN]: "ارسال پیام انجام نشد. دوباره تلاش کنید.",
    [PUBLIC_ROOM_ERROR_CODES.REACTIONS_DISABLED]: "میزبان واکنش‌ها را غیرفعال کرده است.",
    [PUBLIC_ROOM_ERROR_CODES.REACTION_RATE_LIMIT]: "کمی آرام‌تر واکنش بفرست.",
    [PUBLIC_ROOM_ERROR_CODES.REACTION_NOT_MEMBER]: "برای فرستادن واکنش باید عضو اتاق باشید.",
    [PUBLIC_ROOM_ERROR_CODES.REACTION_INVALID]: "این واکنش پشتیبانی نمی‌شود.",
    [PUBLIC_ROOM_ERROR_CODES.REACTION_NETWORK]: "ارسال واکنش انجام نشد. اتصال را بررسی کنید.",
    [PUBLIC_ROOM_ERROR_CODES.REACTION_UNKNOWN]: "ارسال واکنش انجام نشد. دوباره تلاش کنید.",
    [PUBLIC_ROOM_ERROR_CODES.UNKNOWN]: "درخواست انجام نشد. دوباره تلاش کنید."
};

export class PublicRoomError extends Error {
    constructor(code = PUBLIC_ROOM_ERROR_CODES.UNKNOWN, details = {}) {
        super(MESSAGES[code] || MESSAGES[PUBLIC_ROOM_ERROR_CODES.UNKNOWN]);
        this.name = "PublicRoomError";
        this.code = code;
        this.details = details;
    }
}

export function getPublicRoomErrorMessage(error) {
    return MESSAGES[error?.code] || MESSAGES[PUBLIC_ROOM_ERROR_CODES.UNKNOWN];
}

export function normalizePublicRoomError(error) {
    const code = error?.details?.code || error?.code || "";
    if (Object.values(PUBLIC_ROOM_ERROR_CODES).includes(code)) return new PublicRoomError(code);
    if (/PUBLIC-CHAT-SLOW-MODE/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.CHAT_SLOW_MODE);
    if (/PUBLIC-CHAT-DISABLED/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.CHAT_DISABLED);
    if (/PUBLIC-CHAT-TOO-LONG/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.CHAT_TOO_LONG);
    if (/PUBLIC-REACTION-RATE-LIMIT/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.REACTION_RATE_LIMIT);
    if (/PUBLIC-REACTIONS-DISABLED/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.REACTIONS_DISABLED);
    if (/PUBLIC-REACTION-INVALID/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.REACTION_INVALID);
    if (/permission[-_]denied|unauthenticated/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.NOT_AUTHORIZED);
    if (/deadline|timeout/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.TIMEOUT);
    if (/network|unavailable/i.test(code)) return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.NETWORK);
    return new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.UNKNOWN);
}
