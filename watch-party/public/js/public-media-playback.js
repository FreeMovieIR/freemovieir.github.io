export const PUBLIC_LOCAL_MEDIA_STATE = Object.freeze({
    IDLE: "idle",
    MEDIA_PREPARING: "mediaPreparing",
    METADATA_READY: "metadataReady",
    PLAYABLE_READY: "playableReady",
    PLAY_REQUESTED: "playRequested",
    PLAYING: "playing",
    BUFFERING: "buffering",
    AUTOPLAY_BLOCKED: "autoplayBlocked",
    PLAYBACK_FAILED: "playbackFailed",
    PAUSED: "paused"
});

export const PUBLIC_PLAY_REJECTION = Object.freeze({
    AUTOPLAY_BLOCKED: "autoplayBlocked",
    COMPATIBILITY: "compatibility",
    ABORTED: "aborted",
    UNKNOWN: "unknown"
});

export function createPublicMediaPlaybackState() {
    return {
        mediaState: PUBLIC_LOCAL_MEDIA_STATE.IDLE,
        metadataReady: false,
        playableReady: false,
        playRequested: false,
        autoplayBlocked: false,
        playbackFailed: false,
        latestPlayback: null,
        lastMediaEvent: "",
        playRejectionName: "",
        gatewayJobStatus: ""
    };
}

export function resetPublicMediaPlaybackState(target = createPublicMediaPlaybackState()) {
    Object.assign(target, createPublicMediaPlaybackState());
    return target;
}

export function markPublicMediaEvent(target, eventName, video = null) {
    if (!target) return target;
    target.lastMediaEvent = eventName;
    if (eventName === "loadedmetadata") {
        target.metadataReady = true;
        if (!target.playableReady && !target.autoplayBlocked && !target.playbackFailed) {
            target.mediaState = PUBLIC_LOCAL_MEDIA_STATE.METADATA_READY;
        }
    }
    if (eventName === "loadeddata" || eventName === "canplay") {
        target.metadataReady = true;
        target.playableReady = true;
        target.autoplayBlocked = false;
        target.playbackFailed = false;
        target.mediaState = PUBLIC_LOCAL_MEDIA_STATE.PLAYABLE_READY;
    }
    if (eventName === "playing") {
        target.metadataReady = true;
        target.playableReady = true;
        target.playRequested = false;
        target.autoplayBlocked = false;
        target.playbackFailed = false;
        target.mediaState = PUBLIC_LOCAL_MEDIA_STATE.PLAYING;
    }
    if (eventName === "pause" && video?.paused) {
        target.playRequested = false;
        if (!target.autoplayBlocked && !target.playbackFailed) target.mediaState = PUBLIC_LOCAL_MEDIA_STATE.PAUSED;
    }
    return target;
}

export async function applyAuthoritativeGuestPlayback({ video, playback, mediaState, expectedTime }) {
    if (!video || !mediaState || !playback) return { applied: false, reason: "missing" };
    mediaState.latestPlayback = { ...playback };
    if (playback.paused) {
        video.pause?.();
        mediaState.playRequested = false;
        if (!mediaState.playbackFailed) mediaState.mediaState = PUBLIC_LOCAL_MEDIA_STATE.PAUSED;
        return { applied: true, paused: true };
    }
    mediaState.playRequested = true;
    if (!mediaState.playableReady) {
        if (!mediaState.autoplayBlocked && !mediaState.playbackFailed) {
            mediaState.mediaState = mediaState.metadataReady
                ? PUBLIC_LOCAL_MEDIA_STATE.METADATA_READY
                : PUBLIC_LOCAL_MEDIA_STATE.MEDIA_PREPARING;
        }
        return { applied: false, deferred: true };
    }
    return playAuthoritativeGuestPlayback({ video, playback, mediaState, expectedTime });
}

export async function playAuthoritativeGuestPlayback({ video, playback, mediaState, expectedTime }) {
    if (!video || !mediaState || !playback) return { applied: false, reason: "missing" };
    mediaState.latestPlayback = { ...playback };
    mediaState.playRequested = true;
    reconcileVideoToPlayback(video, playback, expectedTime);
    try {
        await video.play();
        mediaState.playRequested = false;
        mediaState.autoplayBlocked = false;
        mediaState.playbackFailed = false;
        mediaState.playRejectionName = "";
        mediaState.mediaState = PUBLIC_LOCAL_MEDIA_STATE.PLAYING;
        return { applied: true, playing: true };
    } catch (error) {
        const category = classifyPublicPlayRejection(error);
        mediaState.playRejectionName = safeErrorName(error);
        if (category === PUBLIC_PLAY_REJECTION.AUTOPLAY_BLOCKED) {
            mediaState.autoplayBlocked = true;
            mediaState.playbackFailed = false;
            mediaState.mediaState = PUBLIC_LOCAL_MEDIA_STATE.AUTOPLAY_BLOCKED;
            return { applied: false, rejected: true, category };
        }
        if (category === PUBLIC_PLAY_REJECTION.ABORTED) {
            return { applied: false, rejected: true, category };
        }
        mediaState.autoplayBlocked = false;
        mediaState.playbackFailed = true;
        mediaState.mediaState = PUBLIC_LOCAL_MEDIA_STATE.PLAYBACK_FAILED;
        return { applied: false, rejected: true, category };
    }
}

export function shouldShowPublicWaiting(mediaState, playback, video = null) {
    if (!mediaState || !playback || playback.paused !== false) return false;
    if (mediaState.autoplayBlocked || mediaState.playbackFailed) return false;
    if (!(mediaState.playableReady || mediaState.playRequested)) return false;
    if (video?.ended) return false;
    return true;
}

export function classifyPublicPlayRejection(error) {
    const name = safeErrorName(error);
    if (name === "NotAllowedError") return PUBLIC_PLAY_REJECTION.AUTOPLAY_BLOCKED;
    if (name === "NotSupportedError" || name === "EncodingError") return PUBLIC_PLAY_REJECTION.COMPATIBILITY;
    if (name === "AbortError") return PUBLIC_PLAY_REJECTION.ABORTED;
    return PUBLIC_PLAY_REJECTION.UNKNOWN;
}

export function getPublicPlayRejectionMessage(category) {
    if (category === PUBLIC_PLAY_REJECTION.AUTOPLAY_BLOCKED) return "برای شروع پخش لمس کنید";
    if (category === PUBLIC_PLAY_REJECTION.COMPATIBILITY) return "مرورگر نتوانست نسخه ویدیو را پخش کند.";
    if (category === PUBLIC_PLAY_REJECTION.ABORTED) return "";
    return "پخش ویدیو انجام نشد. دوباره تلاش کنید.";
}

export function captureSafePublicMediaDiagnostics(video, mediaState, extra = {}) {
    return {
        adapter: String(extra.adapter || ""),
        mediaState: String(mediaState?.mediaState || ""),
        readyState: Number(video?.readyState || 0),
        networkState: Number(video?.networkState || 0),
        paused: Boolean(video?.paused),
        currentTime: finiteNumber(video?.currentTime),
        duration: finiteNumber(video?.duration),
        videoErrorCode: Number(video?.error?.code || 0),
        lastMediaEvent: String(mediaState?.lastMediaEvent || ""),
        playRejectionName: String(mediaState?.playRejectionName || ""),
        gatewayJobStatus: String(mediaState?.gatewayJobStatus || extra.gatewayJobStatus || "")
    };
}

function reconcileVideoToPlayback(video, playback, expectedTime) {
    const target = Number.isFinite(expectedTime) ? expectedTime : Number(playback.currentTime || 0);
    if (Number.isFinite(target) && Math.abs(Number(video.currentTime || 0) - target) > 1) {
        video.currentTime = target;
    }
    video.playbackRate = Number(playback.playbackRate || 1);
}

function safeErrorName(error) {
    return typeof error?.name === "string" ? error.name : "";
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}
