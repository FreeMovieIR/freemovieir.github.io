export function makeInitialPublicPlayback(uid, now = Date.now()) {
    return {
        paused: true,
        currentTime: 0,
        playbackRate: 1,
        revision: 1,
        action: "create",
        updatedAt: now,
        updatedBy: uid
    };
}

export function expectedPublicPlaybackTime(playback, now = Date.now()) {
    if (!playback) return 0;
    const currentTime = Number(playback.currentTime || 0);
    if (playback.paused) return currentTime;
    const elapsedSeconds = Math.max(0, (now - Number(playback.updatedAt || now)) / 1000);
    return currentTime + elapsedSeconds * Number(playback.playbackRate || 1);
}

export function nextPublicPlaybackState(previous, patch, uid, now = Date.now()) {
    return {
        paused: Boolean(patch.paused),
        currentTime: Math.max(0, Number(patch.currentTime || 0)),
        playbackRate: Math.min(4, Math.max(0.25, Number(patch.playbackRate || 1))),
        revision: Number(previous?.revision || 0) + 1,
        action: String(patch.action || "update").slice(0, 32),
        updatedAt: now,
        updatedBy: uid
    };
}
