import test from "node:test";
import assert from "node:assert/strict";
import { chooseRecommendedStrategy, getDeviceMediaProfile, summarizeDeviceMediaProfile } from "../../watch-party/js/device-media-profile.js";
import { FULLSCREEN_CAPABILITY } from "../../watch-party/js/fullscreen-controller.js";

test("device profile detects mobile Safari and recommends direct-first gateway fallback", () => {
    const profile = profileForUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1");
    assert.equal(profile.profile, "mobile");
    assert.equal(profile.browserFamily, "safari");
    assert.equal(profile.directMkvLikely, false);
    assert.equal(profile.recommendedStrategy, "direct-first-gateway-if-configured");
});

test("iOS browser variants use the same WebKit/Gateway-risk media profile", () => {
    for (const ua of [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/120.0 Mobile/15E148 Safari/605.1.15",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 EdgiOS/120.0 Mobile/15E148 Safari/605.1.15"
    ]) {
        const profile = profileForUserAgent(ua);
        assert.equal(profile.profile, "mobile", ua);
        assert.equal(profile.browserFamily, "safari", ua);
        assert.equal(profile.directMkvLikely, false, ua);
        assert.equal(profile.recommendedStrategy, "direct-first-gateway-if-configured", ua);
    }
});

test("modern iPadOS WebKit stack is detected without misclassifying non-iOS browsers", () => {
    const ipad = profileForUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        { maxTouchPoints: 5, platform: "MacIntel" }
    );
    assert.equal(ipad.profile, "mobile");
    assert.equal(ipad.browserFamily, "safari");

    const androidChrome = profileForUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36");
    assert.equal(androidChrome.profile, "mobile");
    assert.equal(androidChrome.browserFamily, "chromium-or-firefox");

    const desktopChrome = profileForUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36");
    assert.equal(desktopChrome.profile, "desktop");
    assert.equal(desktopChrome.browserFamily, "chromium-or-firefox");
});

test("profile summary keeps user-facing capability text compact", () => {
    const summary = summarizeDeviceMediaProfile({
        nativeHls: true,
        mediaSource: false,
        webCodecsAudio: true,
        fullscreen: FULLSCREEN_CAPABILITY.WEBKIT_VIDEO_FULLSCREEN,
        recommendedStrategy: "native-hls-or-mp4"
    });
    assert.equal(summary.video, "آماده");
    assert.equal(summary.fullscreen, "تمام‌صفحه native ویدیو");
});

test("strategy selection prefers HLS and browser compatibility where available", () => {
    assert.equal(chooseRecommendedStrategy({ nativeHls: true }), "native-hls-or-mp4");
    assert.equal(chooseRecommendedStrategy({ mse: true }), "hls-js-or-native-video");
    assert.equal(chooseRecommendedStrategy({ webCodecsVideo: true, webCodecsAudio: true }), "browser-compatibility");
});

function profileForUserAgent(userAgent, navPatch = {}) {
    const video = { canPlayType: () => "", readyState: 0 };
    const doc = {
        fullscreenEnabled: false,
        body: { classList: { add() {}, remove() {} } },
        createElement: (tagName) => tagName === "canvas" ? { getContext: () => ({}) } : { canPlayType: () => "" }
    };
    return getDeviceMediaProfile({
        video,
        wrapper: {},
        doc,
        win: {},
        nav: { userAgent, ...navPatch }
    });
}
