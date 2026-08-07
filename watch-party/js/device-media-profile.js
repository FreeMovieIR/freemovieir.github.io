import { FULLSCREEN_CAPABILITY, getFullscreenCapability } from "./fullscreen-controller.js";

export function getDeviceMediaProfile({ video = null, wrapper = null, nav = navigator, win = window, doc = document } = {}) {
    const testVideo = video || (typeof doc?.createElement === "function" ? doc.createElement("video") : null);
    const nativeHls = Boolean(typeof testVideo?.canPlayType === "function" && testVideo.canPlayType("application/vnd.apple.mpegurl"));
    const mse = Boolean(win.MediaSource || win.ManagedMediaSource);
    const webCodecsVideo = Boolean(win.VideoDecoder);
    const webCodecsAudio = Boolean(win.AudioDecoder);
    const testCanvas = typeof doc?.createElement === "function" ? doc.createElement("canvas") : null;
    const canvas = Boolean(testCanvas?.getContext);
    const audioWorklet = Boolean(win.AudioWorkletNode || win.AudioWorklet);
    const userAgentDataMobile = Boolean(nav.userAgentData?.mobile);
    const ua = String(nav.userAgent || "");
    const mobile = userAgentDataMobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const safariFamily = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
    const fullscreen = getFullscreenCapability({ wrapper, video: testVideo, doc });

    return {
        nativeHls,
        mediaSource: mse,
        managedMediaSource: Boolean(win.ManagedMediaSource),
        webCodecsVideo,
        webCodecsAudio,
        canvas,
        audioWorklet,
        fullscreen,
        webkitVideoFullscreen: fullscreen === FULLSCREEN_CAPABILITY.WEBKIT_VIDEO_FULLSCREEN,
        standardFullscreen: fullscreen === FULLSCREEN_CAPABILITY.STANDARD_ELEMENT_FULLSCREEN,
        profile: mobile ? "mobile" : "desktop",
        browserFamily: safariFamily ? "safari" : "chromium-or-firefox",
        directMkvLikely: Boolean(!mobile && webCodecsVideo && webCodecsAudio && canvas),
        recommendedStrategy: chooseRecommendedStrategy({ nativeHls, mse, webCodecsVideo, webCodecsAudio, mobile, safariFamily })
    };
}

export function chooseRecommendedStrategy({ nativeHls, mse, webCodecsVideo, webCodecsAudio, mobile, safariFamily } = {}) {
    if (nativeHls) return "native-hls-or-mp4";
    if (mse) return "hls-js-or-native-video";
    if (mobile && safariFamily) return "direct-first-gateway-if-configured";
    if (webCodecsVideo && webCodecsAudio) return "browser-compatibility";
    return "direct-first-gateway-if-configured";
}

export function summarizeDeviceMediaProfile(profile = {}) {
    return {
        video: profile.nativeHls || profile.mediaSource ? "آماده" : "محدود",
        audio: profile.webCodecsAudio || profile.nativeHls || profile.mediaSource ? "آماده" : "محدود",
        subtitle: "آماده",
        microphone: globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.isSecureContext ? "قابل استفاده" : "نیازمند مرورگر امن",
        fullscreen: profile.fullscreen === FULLSCREEN_CAPABILITY.WEBKIT_VIDEO_FULLSCREEN
            ? "تمام‌صفحه native ویدیو"
            : profile.fullscreen === FULLSCREEN_CAPABILITY.STANDARD_ELEMENT_FULLSCREEN
                ? "تمام‌صفحه"
                : profile.fullscreen === FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE
                    ? "حالت سینمایی"
                    : "ناموجود",
        playback: profile.recommendedStrategy || "direct-first"
    };
}
