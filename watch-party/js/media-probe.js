import { isAllowedMediaUrl } from "./utils.js";

export const MEDIA_ADAPTERS = Object.freeze({
    NATIVE: "native",
    HLS: "hls",
    MKV: "mkv-compatibility",
    UNSUPPORTED: "unsupported"
});

export const MEDIA_ERROR_KIND = Object.freeze({
    ABORTED: "aborted",
    NETWORK: "network",
    DECODE: "decode",
    SOURCE_NOT_SUPPORTED: "source-not-supported",
    TIMEOUT: "timeout",
    EXPIRED_OR_DENIED: "expired-or-denied",
    UNKNOWN: "unknown"
});

export const MIME_HINTS = Object.freeze({
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    ogv: "video/ogg",
    ogg: "video/ogg",
    mov: "video/quicktime",
    m3u8: "application/vnd.apple.mpegurl",
    mpd: "application/dash+xml",
    mkv: "video/x-matroska"
});

export function parseMediaUrl(rawUrl, baseHref = globalThis.location?.href || "http://localhost/") {
    try {
        const url = new URL(String(rawUrl || "").trim(), baseHref);
        const pathname = safeDecodePath(url.pathname);
        const name = pathname.split("/").filter(Boolean).pop() || "";
        const match = name.match(/\.([a-z0-9]+)$/i);
        const extension = match ? match[1].toLowerCase() : "";
        return {
            ok: true,
            url,
            href: url.href,
            pathname,
            fileName: name,
            extension,
            mimeHint: MIME_HINTS[extension] || "",
            redacted: redactMediaUrl(url)
        };
    } catch {
        return { ok: false, extension: "", mimeHint: "", redacted: "" };
    }
}

export function selectMediaAdapter(rawUrl, options = {}) {
    const parsed = parseMediaUrl(rawUrl, options.baseHref);
    if (!parsed.ok || !isAllowedMediaUrl(parsed.href, options.pageHostname)) {
        return { adapter: MEDIA_ADAPTERS.UNSUPPORTED, parsed, reason: "url-not-allowed" };
    }
    if (parsed.extension === "m3u8") return { adapter: MEDIA_ADAPTERS.HLS, parsed, reason: "hls-extension" };
    if (parsed.extension === "mkv") return { adapter: MEDIA_ADAPTERS.MKV, parsed, reason: "mkv-extension" };
    return { adapter: MEDIA_ADAPTERS.NATIVE, parsed, reason: parsed.extension ? "native-extension" : "native-unknown" };
}

export function canNativeAttempt(rawUrl, options = {}) {
    const selection = selectMediaAdapter(rawUrl, options);
    return selection.adapter === MEDIA_ADAPTERS.NATIVE || selection.adapter === MEDIA_ADAPTERS.HLS;
}

export function classifyMediaElementError(video, timeout = false) {
    if (timeout) return MEDIA_ERROR_KIND.TIMEOUT;
    const code = video?.error?.code;
    const MediaErrorCtor = globalThis.MediaError;
    if (MediaErrorCtor) {
        if (code === MediaErrorCtor.MEDIA_ERR_ABORTED) return MEDIA_ERROR_KIND.ABORTED;
        if (code === MediaErrorCtor.MEDIA_ERR_NETWORK) return MEDIA_ERROR_KIND.NETWORK;
        if (code === MediaErrorCtor.MEDIA_ERR_DECODE) return MEDIA_ERROR_KIND.DECODE;
        if (code === MediaErrorCtor.MEDIA_ERR_SRC_NOT_SUPPORTED) return MEDIA_ERROR_KIND.SOURCE_NOT_SUPPORTED;
    }
    if (code === 1) return MEDIA_ERROR_KIND.ABORTED;
    if (code === 2) return MEDIA_ERROR_KIND.NETWORK;
    if (code === 3) return MEDIA_ERROR_KIND.DECODE;
    if (code === 4) return MEDIA_ERROR_KIND.SOURCE_NOT_SUPPORTED;
    return MEDIA_ERROR_KIND.UNKNOWN;
}

export function diagnoseMediaElement(video, parsed = {}) {
    return {
        redactedUrl: parsed.redacted || "",
        extension: parsed.extension || "",
        mimeHint: parsed.mimeHint || "",
        crossOrigin: video?.crossOrigin || "",
        readyState: video?.readyState ?? null,
        networkState: video?.networkState ?? null,
        errorCode: video?.error?.code ?? null,
        duration: Number.isFinite(video?.duration) ? video.duration : null,
        videoWidth: video?.videoWidth || 0,
        videoHeight: video?.videoHeight || 0
    };
}

export function redactMediaUrl(url) {
    const parsed = url instanceof URL ? new URL(url.href) : new URL(String(url));
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
}

export function isMatroskaSignature(bytes) {
    if (!bytes || bytes.length < 4) return false;
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export function classifyMkvCapability({ container = "", videoCodec = "", audioCodec = "", webCodecs = Boolean(globalThis.VideoDecoder) } = {}) {
    if (container && !/matroska|webm|mkv/i.test(container)) {
        return { playable: false, reason: "container-mismatch" };
    }
    const video = String(videoCodec).toLowerCase();
    const audio = String(audioCodec).toLowerCase();
    if (/dts|truehd/i.test(audio)) return { playable: false, reason: "audio-dts-unsupported" };
    if (/hevc|h265|h\.265/i.test(video)) return { playable: false, reason: "video-hevc-runtime-dependent" };
    const supportedVideo = /h264|avc|vp9|av1|vp8/.test(video);
    const supportedAudio = /aac|opus|vorbis|mp3|ac-3|e-ac-3|ac3|ec3/.test(audio);
    return {
        playable: Boolean(webCodecs && supportedVideo && supportedAudio),
        reason: webCodecs ? (supportedVideo && supportedAudio ? "best-effort-supported" : "codec-unsupported") : "webcodecs-unavailable"
    };
}

function safeDecodePath(pathname) {
    try {
        return decodeURIComponent(pathname);
    } catch {
        return pathname;
    }
}
