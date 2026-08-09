export const PUBLIC_CONTROL_AUTHORITY = Object.freeze({
    HOST: "host",
    GUEST: "guest"
});

export function getPublicPlayerControlModel({ role = "", playback = {}, duration = 0 } = {}) {
    const isHost = role === PUBLIC_CONTROL_AUTHORITY.HOST;
    return {
        canUseSharedPlayback: isHost,
        showPlayPause: isHost,
        showSeek: isHost,
        showSkip: isHost,
        showPlaybackRate: isHost,
        showReadOnlyProgress: !isHost,
        showLocalVolume: true,
        showLocalMute: true,
        showLocalFullscreen: true,
        paused: playback.paused !== false,
        duration: normalizeDuration(duration)
    };
}

export class PublicReactionBaseline {
    constructor(limit = 240) {
        this.limit = limit;
        this.seen = new Set();
        this.initialized = false;
    }

    reset() {
        this.seen.clear();
        this.initialized = false;
    }

    collectNew(reactions = {}) {
        const entries = Object.entries(reactions || {})
            .map(([id, reaction]) => ({ id, ...reaction }))
            .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

        if (!this.initialized) {
            entries.forEach((reaction) => this.seen.add(reaction.id));
            this.initialized = true;
            this.trim();
            return [];
        }

        const fresh = [];
        for (const reaction of entries) {
            if (this.seen.has(reaction.id)) continue;
            this.seen.add(reaction.id);
            fresh.push(reaction);
        }
        this.trim();
        return fresh;
    }

    trim() {
        while (this.seen.size > this.limit) {
            this.seen.delete(this.seen.values().next().value);
        }
    }
}

export function clampPublicTime(value, duration = 0) {
    const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    const safeDuration = normalizeDuration(duration);
    if (!safeDuration) return Math.max(0, safeValue);
    return Math.min(safeDuration, Math.max(0, safeValue));
}

export function formatPublicTime(seconds = 0) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function shouldIgnorePublicShortcut(target) {
    const tag = String(target?.tagName || "").toLowerCase();
    return tag === "input"
        || tag === "textarea"
        || tag === "select"
        || target?.isContentEditable === true;
}

function normalizeDuration(duration) {
    const value = Number(duration);
    return Number.isFinite(value) && value > 0 ? value : 0;
}
