export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 8;

export const MESSAGES = {
    missingConfig: "پیکربندی Firebase برای تماشای دونفره تنظیم نشده است.",
    productionConfigMissing: "پیکربندی سرویس اتاق بارگذاری نشد. لطفاً چند لحظه دیگر دوباره تلاش کنید.",
    authFailed: "ورود ناشناس انجام نشد. تنظیمات Firebase Authentication را بررسی کنید.",
    roomNotFound: "اتاقی با این کد پیدا نشد.",
    roomExpired: "زمان این اتاق به پایان رسیده است.",
    roomEnded: "این اتاق پایان داده شده است.",
    roomFull: "این اتاق پر است و فقط دو نفر می‌توانند وارد شوند.",
    invalidRoom: "کد اتاق معتبر نیست.",
    invalidUrl: "لینک ویدیو معتبر نیست.",
    insecureUrl: "در نسخه آنلاین فقط لینک‌های HTTPS پذیرفته می‌شوند.",
    mixedContent: "این لینک HTTP است و روی سایت HTTPS پخش نمی‌شود.",
    unsupportedFormat: "مرورگر شما از این فرمت ویدیو پشتیبانی نمی‌کند.",
    network: "خطای شبکه یا CORS هنگام بارگیری ویدیو رخ داد.",
    expiredMedia: "ممکن است لینک ویدیو منقضی شده باشد.",
    decoding: "مرورگر نتوانست ویدیو را رمزگشایی کند.",
    subtitleInvalid: "فرمت زیرنویس معتبر نیست.",
    subtitleLarge: "حجم زیرنویس بیش از حد مجاز است.",
    subtitleCors: "سرور زیرنویس اجازه خواندن از مرورگر را نمی‌دهد. فایل را دانلود و دستی بارگذاری کنید.",
    micDenied: "دسترسی میکروفن رد شد.",
    micUnavailable: "میکروفن در دسترس نیست.",
    rtcFailed: "ارتباط صوتی برقرار نشد. ممکن است TURN لازم باشد.",
    reconnecting: "اتصال قطع شده؛ در حال تلاش برای اتصال دوباره...",
    partnerLeft: "طرف مقابل اتاق را ترک کرد.",
    autoplay: "برای شروع پخش هم‌زمان، روی ادامه بزنید",
    emulatorMode: "حالت توسعه محلی فعال است و برنامه به Firebase Emulator وصل می‌شود."
};

Object.assign(MESSAGES, {
    unsupportedFormat: "مرورگر نتوانست این منبع رسانه را مستقیماً پخش کند.",
    network: "دریافت فایل فیلم با خطا مواجه شد. لینک یا اتصال را بررسی کنید.",
    expiredMedia: "لینک فیلم در دسترس نیست یا اعتبار آن پایان یافته است.",
    decoding: "مرورگر نتوانست محتوای صوتی یا تصویری این فایل را رمزگشایی کند.",
    mediaTimeout: "دریافت اطلاعات فیلم بیشتر از حد معمول طول کشید.",
    mkvLimited: "این فایل MKV نیاز به حالت سازگاری دارد و ممکن است در این مرورگر پخش نشود.",
    mkvAudioUnsupported: "تصویر فیلم قابل پخش است، اما کدک صدای این نسخه پشتیبانی نمی‌شود.",
    mkvAudioDtsUnsupported: "صدای این فایل با DTS فشرده شده و نسخه مرورگری پلیر فعلاً امکان پخش آن را ندارد."
});

export function generateRoomCode() {
    const bytes = new Uint8Array(ROOM_CODE_LENGTH);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

export function normalizeRoomCode(value) {
    return String(value || "")
        .toUpperCase()
        .replace(/[\s-]/g, "")
        .split("")
        .filter((char) => ROOM_CODE_ALPHABET.includes(char))
        .join("");
}

export function isValidRoomCode(value) {
    return new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(value);
}

export function sanitizeDisplayName(value) {
    const trimmed = String(value || "").trim().replace(/\s+/g, " ");
    return trimmed.slice(0, 32) || "مهمان";
}

export function isLocalHostname(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function clamp(number, min, max) {
    return Math.min(max, Math.max(min, number));
}

export function isHttpsUrl(rawUrl) {
    return isAllowedMediaUrl(rawUrl);
}

export function isAllowedMediaUrl(rawUrl, pageHostname = globalThis.location?.hostname || "") {
    try {
        if (!/^https?:\/\//i.test(String(rawUrl || "").trim())) return false;
        const url = parseUrl(rawUrl);
        if (!url) return false;
        if (url.protocol === "https:") return true;
        return url.protocol === "http:" && isLocalHostname(pageHostname) && isLocalHostname(url.hostname);
    } catch {
        return false;
    }
}

export function isSupportedDirectMediaUrl(rawUrl, pageHostname = globalThis.location?.hostname || "", canPlayType = () => "") {
    if (!isAllowedMediaUrl(rawUrl, pageHostname)) return false;
    const extension = getExtension(rawUrl);
    if (extension === "m3u8") return true;
    if (extension === "mkv") return false;
    const types = {
        mp4: ["video/mp4", "video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\""],
        m4v: ["video/mp4"],
        webm: ["video/webm", "video/webm; codecs=\"vp8, vorbis\""],
        ogv: ["video/ogg"],
        ogg: ["video/ogg"],
        mov: ["video/quicktime"]
    };
    if (!extension || !types[extension]) return true;
    types[extension].some((type) => Boolean(canPlayType(type)));
    return true;
}

export function parseUrl(rawUrl) {
    try {
        return new URL(String(rawUrl || "").trim(), globalThis.location?.href || "http://localhost/");
    } catch {
        return null;
    }
}

export function getExtension(rawUrl) {
    const url = parseUrl(rawUrl);
    if (!url) return "";
    let path = url.pathname.toLowerCase();
    try {
        path = decodeURIComponent(path);
    } catch {}
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1] : "";
}

export function isHlsUrl(rawUrl) {
    return getExtension(rawUrl) === "m3u8";
}

export function describeMediaError(video) {
    const code = video?.error?.code;
    const MediaErrorCtor = globalThis.MediaError;
    if ((MediaErrorCtor && code === MediaErrorCtor.MEDIA_ERR_NETWORK) || code === 2) return MESSAGES.network;
    if ((MediaErrorCtor && code === MediaErrorCtor.MEDIA_ERR_DECODE) || code === 3) return MESSAGES.decoding;
    if ((MediaErrorCtor && code === MediaErrorCtor.MEDIA_ERR_SRC_NOT_SUPPORTED) || code === 4) return MESSAGES.unsupportedFormat;
    return MESSAGES.expiredMedia;
}

export function serverNow(offsetMs = 0) {
    return Date.now() + offsetMs;
}

export function formatClock(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function rateLimit(intervalMs) {
    let last = 0;
    return () => {
        const now = Date.now();
        if (now - last < intervalMs) return false;
        last = now;
        return true;
    };
}

export function validateChatMessage(text, limit = 500) {
    const clean = String(text || "").trim();
    return clean.length > 0 && clean.length <= limit;
}

export function clampChatMessage(text, limit = 500) {
    return String(text || "").trim().slice(0, limit);
}

export function isAllowedReaction(emoji) {
    return ["❤️", "😂", "😱", "😢", "🍿"].includes(emoji);
}

export function safeLog(label, details = {}) {
    const redacted = { ...details };
    for (const key of ["url", "content", "text", "sdp", "candidate"]) {
        if (key in redacted) redacted[key] = "[redacted]";
    }
    console.debug(`[watch-party] ${label}`, redacted);
}
