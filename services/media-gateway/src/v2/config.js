import { DEFAULT_LIMITS } from "./constants.js";

export function loadGatewayConfig(env = process.env) {
    const localMode = parseBoolean(env.MEDIA_GATEWAY_LOCAL_MODE, false) || env.MEDIA_GATEWAY_REQUIRE_AUTH === "false";
    return {
        localMode,
        projectId: env.MEDIA_GATEWAY_PROJECT_ID || env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || "",
        databaseUrl: env.MEDIA_GATEWAY_DATABASE_URL || "",
        databasePath: env.MEDIA_GATEWAY_DATABASE_PATH || "mediaGatewayJobs",
        bucket: env.MEDIA_GATEWAY_BUCKET || "",
        region: env.MEDIA_GATEWAY_REGION || "us-central1",
        workerJob: env.MEDIA_GATEWAY_WORKER_JOB || "freemovieir-media-worker",
        requireAuth: env.MEDIA_GATEWAY_REQUIRE_AUTH !== "false",
        limits: {
            jobTtlMs: parsePositiveInt(env.MEDIA_GATEWAY_JOB_TTL_MS, DEFAULT_LIMITS.jobTtlMs),
            playbackTtlMs: parsePositiveInt(env.MEDIA_GATEWAY_PLAYBACK_TTL_MS, DEFAULT_LIMITS.playbackTtlMs),
            leaseTtlMs: parsePositiveInt(env.MEDIA_GATEWAY_LEASE_TTL_MS, DEFAULT_LIMITS.leaseTtlMs),
            maxActivePerUid: parsePositiveInt(env.MEDIA_GATEWAY_MAX_ACTIVE_PER_UID, DEFAULT_LIMITS.maxActivePerUid),
            maxCreatePerHour: parsePositiveInt(env.MEDIA_GATEWAY_MAX_CREATE_PER_HOUR, DEFAULT_LIMITS.maxCreatePerHour),
            maxGlobalActive: parsePositiveInt(env.MEDIA_GATEWAY_MAX_GLOBAL_ACTIVE, DEFAULT_LIMITS.maxGlobalActive),
            requestBodyLimit: parsePositiveInt(env.MEDIA_GATEWAY_REQUEST_BODY_LIMIT, DEFAULT_LIMITS.requestBodyLimit)
        }
    };
}

export function validateProductionGatewayConfig(config) {
    if (config.localMode) throw new Error("MEDIA_GATEWAY_LOCAL_MODE must not be enabled in production.");
    for (const [key, value] of Object.entries({
        MEDIA_GATEWAY_PROJECT_ID: config.projectId,
        MEDIA_GATEWAY_DATABASE_URL: config.databaseUrl,
        MEDIA_GATEWAY_BUCKET: config.bucket,
        MEDIA_GATEWAY_REGION: config.region,
        MEDIA_GATEWAY_WORKER_JOB: config.workerJob
    })) {
        if (!value) throw new Error(`${key} is required for production Media Gateway.`);
    }
    return true;
}

function parsePositiveInt(raw, fallback) {
    const value = Number(raw || fallback);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}

function parseBoolean(raw, fallback) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (!value) return fallback;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    throw new Error(`Invalid boolean value: ${raw}`);
}
