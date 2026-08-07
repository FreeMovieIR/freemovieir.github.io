import test from "node:test";
import assert from "node:assert/strict";
import { chooseRecommendedStrategy, getDeviceMediaProfile, summarizeDeviceMediaProfile } from "../../watch-party/js/device-media-profile.js";
import { FULLSCREEN_CAPABILITY } from "../../watch-party/js/fullscreen-controller.js";

test("device profile detects mobile Safari and recommends direct-first gateway fallback", () => {
    const video = { canPlayType: () => "", readyState: 0 };
    const doc = {
        fullscreenEnabled: false,
        body: { classList: { add() {}, remove() {} } },
        createElement: () => ({ getContext: () => ({}) })
    };
    const profile = getDeviceMediaProfile({
        video,
        wrapper: {},
        doc,
        win: {},
        nav: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" }
    });
    assert.equal(profile.profile, "mobile");
    assert.equal(profile.browserFamily, "safari");
    assert.equal(profile.directMkvLikely, false);
    assert.equal(profile.recommendedStrategy, "direct-first-gateway-if-configured");
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
