import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedPlaybackTime, getDriftCorrection, SyncController } from "../../watch-party/js/sync-controller.js";

test("expected playback time accounts for elapsed server time and rate", () => {
    const playback = { paused: false, currentTime: 10, playbackRate: 1.5, updatedAt: 1000 };
    assert.equal(expectedPlaybackTime(playback, 0, 3000), 13);
    assert.equal(expectedPlaybackTime({ ...playback, paused: true }, 0, 3000), 10);
});

test("drift correction thresholds return none, rate, or seek", () => {
    const config = { smallDriftMs: 250, hardSeekDriftMs: 1000, softCorrectionRateDelta: 0.06 };
    assert.equal(getDriftCorrection({ expected: 10.1, currentTime: 10, duration: 100, paused: false, targetRate: 1, config }).type, "none");
    const medium = getDriftCorrection({ expected: 10.5, currentTime: 10, duration: 100, paused: false, targetRate: 1, config });
    assert.equal(medium.type, "rate");
    assert.equal(medium.playbackRate, 1.06);
    const large = getDriftCorrection({ expected: 12, currentTime: 10, duration: 100, paused: false, targetRate: 1, config });
    assert.equal(large.type, "seek");
    assert.equal(large.currentTime, 12);
});

test("remote state from self or old revision is ignored", async () => {
    let playCalled = 0;
    const video = { paused: true, currentTime: 0, duration: 100, playbackRate: 1, play: async () => { playCalled += 1; } };
    const controller = new SyncController(video, { uid: "owner" }, { sync: {} });
    controller.lastRevision = 2;
    await controller.apply({ updatedBy: "owner", revision: 3 }, 0);
    await controller.apply({ updatedBy: "guest", revision: 1 }, 0);
    assert.equal(playCalled, 0);
    assert.equal(controller.isApplyingRemoteState, false);
});
