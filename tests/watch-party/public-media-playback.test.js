import test from "node:test";
import assert from "node:assert/strict";
import {
    PUBLIC_LOCAL_MEDIA_STATE,
    PUBLIC_PLAY_REJECTION,
    applyAuthoritativeGuestPlayback,
    captureSafePublicMediaDiagnostics,
    classifyPublicPlayRejection,
    createPublicMediaPlaybackState,
    markPublicMediaEvent,
    playAuthoritativeGuestPlayback,
    shouldShowPublicWaiting
} from "../../watch-party/public/js/public-media-playback.js";

test("room PLAYING while media prepares keeps the latest authoritative playback", async () => {
    const video = makeVideo();
    const mediaState = createPublicMediaPlaybackState();
    const first = { paused: false, currentTime: 10, playbackRate: 1, revision: 1 };
    const latest = { paused: false, currentTime: 22, playbackRate: 1.5, revision: 2 };

    const firstResult = await applyAuthoritativeGuestPlayback({ video, playback: first, mediaState, expectedTime: 10 });
    const latestResult = await applyAuthoritativeGuestPlayback({ video, playback: latest, mediaState, expectedTime: 25 });

    assert.equal(firstResult.deferred, true);
    assert.equal(latestResult.deferred, true);
    assert.equal(mediaState.latestPlayback.revision, 2);
    assert.equal(video.playCalls, 0);
});

test("host PLAYING after metadata initiates one play request before canplay", async () => {
    const gate = deferred();
    const video = makeVideo({ play: () => gate.promise });
    video.src = "https://gateway.example.test/playback/job/index.m3u8";
    const mediaState = createPublicMediaPlaybackState();
    markPublicMediaEvent(mediaState, "loadedmetadata", video);

    const pending = applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: false, currentTime: 8, playbackRate: 1, revision: 1 },
        mediaState,
        expectedTime: 8
    });

    assert.equal(video.playCalls, 1);
    assert.equal(mediaState.playAttemptInFlight, true);
    assert.equal(mediaState.playableReady, false);
    gate.resolve();
    const result = await pending;
    assert.equal(result.playing, true);
    assert.equal(mediaState.mediaState, PUBLIC_LOCAL_MEDIA_STATE.PLAYING);
});

test("multiple snapshots while play is pending do not duplicate play and retain latest playback", async () => {
    const gate = deferred();
    const video = makeVideo({ play: () => gate.promise });
    video.src = "https://gateway.example.test/playback/job/index.m3u8";
    const mediaState = createPublicMediaPlaybackState();
    markPublicMediaEvent(mediaState, "loadedmetadata", video);

    const pending = applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: false, currentTime: 10, playbackRate: 1, revision: 1 },
        mediaState,
        expectedTime: 10
    });
    const second = await applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: false, currentTime: 20, playbackRate: 1.5, revision: 2 },
        mediaState,
        expectedTime: 20
    });

    assert.equal(video.playCalls, 1);
    assert.equal(second.inFlight, true);
    assert.equal(mediaState.latestPlayback.revision, 2);
    gate.resolve();
    await pending;
    assert.equal(video.playbackRate, 1.5);
});

test("host pause while early play is pending wins over stale play resolution", async () => {
    const gate = deferred();
    const video = makeVideo({ play: () => gate.promise });
    video.src = "https://gateway.example.test/playback/job/index.m3u8";
    const mediaState = createPublicMediaPlaybackState();
    markPublicMediaEvent(mediaState, "loadedmetadata", video);

    const pending = applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: false, currentTime: 10, playbackRate: 1, revision: 1 },
        mediaState,
        expectedTime: 10
    });
    const pause = await applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: true, currentTime: 12, playbackRate: 1, revision: 2 },
        mediaState,
        expectedTime: 12
    });

    assert.equal(pause.paused, true);
    assert.equal(video.paused, true);
    gate.resolve();
    const result = await pending;
    assert.equal(result.stale, true);
    assert.equal(mediaState.mediaState, PUBLIC_LOCAL_MEDIA_STATE.PAUSED);
    assert.equal(video.paused, true);
});

test("once playable, latest authoritative expected time and rate are applied before play", async () => {
    const video = makeVideo();
    const mediaState = createPublicMediaPlaybackState();
    const latest = { paused: false, currentTime: 22, playbackRate: 1.5, revision: 2 };
    await applyAuthoritativeGuestPlayback({ video, playback: latest, mediaState, expectedTime: 22 });
    markPublicMediaEvent(mediaState, "canplay", video);

    const result = await playAuthoritativeGuestPlayback({
        video,
        playback: mediaState.latestPlayback,
        mediaState,
        expectedTime: 25
    });

    assert.equal(result.playing, true);
    assert.equal(video.currentTime, 25);
    assert.equal(video.playbackRate, 1.5);
    assert.equal(video.playCalls, 1);
    assert.equal(mediaState.mediaState, PUBLIC_LOCAL_MEDIA_STATE.PLAYING);
});

test("video.play NotAllowedError becomes autoplayBlocked and is not overwritten by waiting", async () => {
    const video = makeVideo({
        play: async () => {
            const error = new Error("blocked");
            error.name = "NotAllowedError";
            throw error;
        }
    });
    const mediaState = createPublicMediaPlaybackState();
    markPublicMediaEvent(mediaState, "canplay", video);

    const result = await applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: false, currentTime: 5, playbackRate: 1, revision: 1 },
        mediaState,
        expectedTime: 5
    });

    assert.equal(result.category, PUBLIC_PLAY_REJECTION.AUTOPLAY_BLOCKED);
    assert.equal(mediaState.mediaState, PUBLIC_LOCAL_MEDIA_STATE.AUTOPLAY_BLOCKED);
    assert.equal(shouldShowPublicWaiting(mediaState, { paused: false }, video), false);
});

test("early play NotAllowedError keeps local unlock behavior", async () => {
    const video = makeVideo({
        play: async () => {
            const error = new Error("blocked");
            error.name = "NotAllowedError";
            throw error;
        }
    });
    video.src = "https://gateway.example.test/playback/job/index.m3u8";
    const mediaState = createPublicMediaPlaybackState();
    markPublicMediaEvent(mediaState, "loadedmetadata", video);

    const result = await applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: false, currentTime: 5, playbackRate: 1, revision: 1 },
        mediaState,
        expectedTime: 5
    });

    assert.equal(result.category, PUBLIC_PLAY_REJECTION.AUTOPLAY_BLOCKED);
    assert.equal(mediaState.mediaState, PUBLIC_LOCAL_MEDIA_STATE.AUTOPLAY_BLOCKED);
    assert.equal(mediaState.playAttemptInFlight, false);
});

test("classifies play rejections without raw error exposure", () => {
    assert.equal(classifyPublicPlayRejection({ name: "NotAllowedError" }), PUBLIC_PLAY_REJECTION.AUTOPLAY_BLOCKED);
    assert.equal(classifyPublicPlayRejection({ name: "NotSupportedError" }), PUBLIC_PLAY_REJECTION.COMPATIBILITY);
    assert.equal(classifyPublicPlayRejection({ name: "AbortError" }), PUBLIC_PLAY_REJECTION.ABORTED);
    assert.equal(classifyPublicPlayRejection(new Error("unknown")), PUBLIC_PLAY_REJECTION.UNKNOWN);
});

test("local gesture unlock retries video.play without shared playback writes", async () => {
    let writes = 0;
    const video = makeVideo();
    const mediaState = createPublicMediaPlaybackState();
    markPublicMediaEvent(mediaState, "canplay", video);
    const playback = { paused: false, currentTime: 40, playbackRate: 1, revision: 3 };

    const result = await playAuthoritativeGuestPlayback({
        video,
        playback,
        mediaState,
        expectedTime: 43
    });

    assert.equal(result.playing, true);
    assert.equal(video.playCalls, 1);
    assert.equal(video.currentTime, 43);
    assert.equal(writes, 0);
});

test("successful playing clears loading and buffering state", () => {
    const video = makeVideo();
    const mediaState = createPublicMediaPlaybackState();
    mediaState.mediaState = PUBLIC_LOCAL_MEDIA_STATE.BUFFERING;

    markPublicMediaEvent(mediaState, "playing", video);

    assert.equal(mediaState.mediaState, PUBLIC_LOCAL_MEDIA_STATE.PLAYING);
    assert.equal(mediaState.playRequested, false);
    assert.equal(mediaState.autoplayBlocked, false);
});

test("waiting is shown only for genuine requested playback buffering", () => {
    const video = makeVideo();
    const mediaState = createPublicMediaPlaybackState();
    mediaState.playRequested = true;
    assert.equal(shouldShowPublicWaiting(mediaState, { paused: false }, video), true);

    mediaState.playRequested = false;
    mediaState.playableReady = false;
    assert.equal(shouldShowPublicWaiting(mediaState, { paused: false }, video), false);

    mediaState.playableReady = true;
    mediaState.autoplayBlocked = true;
    assert.equal(shouldShowPublicWaiting(mediaState, { paused: false }, video), false);
});

test("host pause still pauses guest locally", async () => {
    const video = makeVideo();
    video.paused = false;
    const mediaState = createPublicMediaPlaybackState();
    markPublicMediaEvent(mediaState, "canplay", video);

    const result = await applyAuthoritativeGuestPlayback({
        video,
        playback: { paused: true, currentTime: 12, playbackRate: 1, revision: 4 },
        mediaState,
        expectedTime: 12
    });

    assert.equal(result.paused, true);
    assert.equal(video.paused, true);
    assert.equal(video.playCalls, 0);
});

test("safe diagnostics contain only local playback fields", () => {
    const video = makeVideo();
    video.currentTime = 7;
    video.duration = 120;
    video.error = { code: 3 };
    const mediaState = createPublicMediaPlaybackState();
    mediaState.playRejectionName = "NotSupportedError";

    const diagnostics = captureSafePublicMediaDiagnostics(video, mediaState, {
        adapter: "gateway-hls",
        gatewayJobStatus: "ready"
    });

    assert.deepEqual(Object.keys(diagnostics).sort(), [
        "adapter",
        "audioCodec",
        "audioContextState",
        "audioDecodable",
        "audioNodesQueued",
        "canvasActive",
        "container",
        "currentTime",
        "duration",
        "engine",
        "gatewayJobStatus",
        "generation",
        "lastMediaEvent",
        "mediaState",
        "networkState",
        "paused",
        "playRejectionName",
        "readyState",
        "relayStatus",
        "transport",
        "videoCodec",
        "videoDecodable",
        "videoErrorCode",
        "videoFramesQueued"
    ].sort());
    assert.equal(JSON.stringify(diagnostics).includes("https://"), false);
});

function makeVideo({ play = null } = {}) {
    return {
        readyState: 2,
        networkState: 1,
        currentTime: 0,
        src: "",
        currentSrc: "",
        duration: 100,
        playbackRate: 1,
        paused: true,
        ended: false,
        playCalls: 0,
        pauseCalls: 0,
        async play() {
            this.playCalls += 1;
            if (play) return play();
            this.paused = false;
            return undefined;
        },
        pause() {
            this.pauseCalls += 1;
            this.paused = true;
        }
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}
