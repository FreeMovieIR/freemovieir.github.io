export const GATEWAY_SCHEMA_VERSION = 2;
export const GATEWAY_POLICY_VERSION = "mkv-hls-v2";

export const JOB_STATUS = Object.freeze({
    IDLE: "idle",
    QUEUED: "queued",
    PROBING: "probing",
    PROCESSING: "processing",
    PLAYABLE: "playable",
    READY: "ready",
    FAILED: "failed",
    EXPIRED: "expired",
    CANCELLED: "cancelled"
});

export const JOB_STAGES = Object.freeze({
    IDLE: "idle",
    QUEUED: "queued",
    PROBING: "probing",
    PREPARING: "preparing",
    REMUXING: "remuxing",
    TRANSCODING_AUDIO: "transcoding-audio",
    TRANSCODING_VIDEO: "transcoding-video",
    TRANSCODING: "transcoding",
    UPLOADING: "uploading",
    PLAYABLE: "playable",
    READY: "ready",
    FAILED: "failed",
    EXPIRED: "expired"
});

export const REUSABLE_STATUSES = Object.freeze([
    JOB_STATUS.QUEUED,
    JOB_STATUS.PROBING,
    JOB_STATUS.PROCESSING,
    JOB_STATUS.PLAYABLE,
    JOB_STATUS.READY
]);

export const SAFE_ERROR = Object.freeze({
    AUTH_REQUIRED: "AUTH_REQUIRED",
    AUTH_INVALID: "AUTH_INVALID",
    BAD_REQUEST: "BAD_REQUEST",
    SOURCE_BLOCKED: "SOURCE_BLOCKED",
    SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
    RATE_LIMITED: "RATE_LIMITED",
    JOB_NOT_FOUND: "JOB_NOT_FOUND",
    JOB_NOT_PLAYABLE: "JOB_NOT_PLAYABLE",
    JOB_EXPIRED: "JOB_EXPIRED",
    LEASE_BUSY: "LEASE_BUSY",
    EXECUTOR_UNAVAILABLE: "EXECUTOR_UNAVAILABLE",
    CONVERSION_FAILED: "CONVERSION_FAILED",
    STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
    INTERNAL: "INTERNAL"
});

export const DEFAULT_LIMITS = Object.freeze({
    jobTtlMs: 2 * 60 * 60 * 1000,
    playbackTtlMs: 45 * 60 * 1000,
    leaseTtlMs: 10 * 60 * 1000,
    ffmpegTimeoutMs: 4 * 60 * 60 * 1000,
    ffprobeTimeoutMs: 60 * 1000,
    maxFfmpegTimeoutMs: 6 * 60 * 60 * 1000,
    maxFfprobeTimeoutMs: 5 * 60 * 1000,
    maxActivePerUid: 2,
    maxCreatePerHour: 6,
    maxGlobalActive: 4,
    requestBodyLimit: 16 * 1024
});
