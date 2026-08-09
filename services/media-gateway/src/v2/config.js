import { DEFAULT_LIMITS } from "./constants.js";

export const GATEWAY_DB_AUTH_UIDS = Object.freeze([
    "media-gateway-api",
    "media-gateway-worker"
]);

export function loadGatewayConfig(env = process.env) {
    const localMode = parseBoolean(env.MEDIA_GATEWAY_LOCAL_MODE, false) || env.MEDIA_GATEWAY_REQUIRE_AUTH === "false";
    return {
        localMode,
        projectId: env.MEDIA_GATEWAY_PROJECT_ID || env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || "",
        databaseUrl: env.MEDIA_GATEWAY_DATABASE_URL || "",
        databasePath: env.MEDIA_GATEWAY_DATABASE_PATH || "mediaGatewayJobs",
        dbAuthUid: String(env.MEDIA_GATEWAY_DB_AUTH_UID || "").trim(),
        allowedOrigins: parseAllowedOrigins(env.MEDIA_GATEWAY_ALLOWED_ORIGINS),
        bucket: env.MEDIA_GATEWAY_BUCKET || "",
        region: env.MEDIA_GATEWAY_REGION || "us-central1",
        workerJob: env.MEDIA_GATEWAY_WORKER_JOB || "freemovieir-media-worker",
        requireAuth: env.MEDIA_GATEWAY_REQUIRE_AUTH !== "false",
        limits: {
            jobTtlMs: parsePositiveInt(env.MEDIA_GATEWAY_JOB_TTL_MS, DEFAULT_LIMITS.jobTtlMs),
            playbackTtlMs: parsePositiveInt(env.MEDIA_GATEWAY_PLAYBACK_TTL_MS, DEFAULT_LIMITS.playbackTtlMs),
            leaseTtlMs: parsePositiveInt(env.MEDIA_GATEWAY_LEASE_TTL_MS, DEFAULT_LIMITS.leaseTtlMs),
            ffmpegTimeoutMs: parseBoundedPositiveInt(
                "MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS",
                env.MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS,
                DEFAULT_LIMITS.ffmpegTimeoutMs,
                DEFAULT_LIMITS.maxFfmpegTimeoutMs
            ),
            ffprobeTimeoutMs: parseBoundedPositiveInt(
                "MEDIA_GATEWAY_FFPROBE_TIMEOUT_MS",
                env.MEDIA_GATEWAY_FFPROBE_TIMEOUT_MS,
                DEFAULT_LIMITS.ffprobeTimeoutMs,
                DEFAULT_LIMITS.maxFfprobeTimeoutMs
            ),
            maxActivePerUid: parsePositiveInt(env.MEDIA_GATEWAY_MAX_ACTIVE_PER_UID, DEFAULT_LIMITS.maxActivePerUid),
            maxCreatePerHour: parsePositiveInt(env.MEDIA_GATEWAY_MAX_CREATE_PER_HOUR, DEFAULT_LIMITS.maxCreatePerHour),
            maxGlobalActive: parsePositiveInt(env.MEDIA_GATEWAY_MAX_GLOBAL_ACTIVE, DEFAULT_LIMITS.maxGlobalActive),
            requestBodyLimit: parsePositiveInt(env.MEDIA_GATEWAY_REQUEST_BODY_LIMIT, DEFAULT_LIMITS.requestBodyLimit)
        }
    };
}

export function validateProductionGatewayConfig(config, options = {}) {
    const requireAllowedOrigins = options.requireAllowedOrigins !== false;
    if (config.localMode) throw new Error("MEDIA_GATEWAY_LOCAL_MODE must not be enabled in production.");
    for (const [key, value] of Object.entries({
        MEDIA_GATEWAY_PROJECT_ID: config.projectId,
        MEDIA_GATEWAY_DATABASE_URL: config.databaseUrl,
        MEDIA_GATEWAY_DB_AUTH_UID: config.dbAuthUid,
        MEDIA_GATEWAY_BUCKET: config.bucket,
        MEDIA_GATEWAY_REGION: config.region,
        MEDIA_GATEWAY_WORKER_JOB: config.workerJob
    })) {
        if (!value) throw new Error(`${key} is required for production Media Gateway.`);
    }
    if (!GATEWAY_DB_AUTH_UIDS.includes(config.dbAuthUid)) {
        throw new Error(`MEDIA_GATEWAY_DB_AUTH_UID must be one of: ${GATEWAY_DB_AUTH_UIDS.join(", ")}.`);
    }
    if (config.databasePath !== "mediaGatewayJobs") {
        throw new Error("MEDIA_GATEWAY_DATABASE_PATH must be mediaGatewayJobs for production Media Gateway.");
    }
    if (requireAllowedOrigins && !config.allowedOrigins?.length) {
        throw new Error("MEDIA_GATEWAY_ALLOWED_ORIGINS is required for production Media Gateway API.");
    }
    return true;
}

export function parseAllowedOrigins(raw) {
    const value = String(raw ?? "").trim();
    if (!value) return [];
    return value.split(",").map((item) => normalizeAllowedOrigin(item)).filter(Boolean);
}

function normalizeAllowedOrigin(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (value === "*") throw new Error("MEDIA_GATEWAY_ALLOWED_ORIGINS must not contain wildcard origins.");
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`Invalid MEDIA_GATEWAY_ALLOWED_ORIGINS origin: ${value}`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("MEDIA_GATEWAY_ALLOWED_ORIGINS entries must use http or https.");
    }
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
        throw new Error("MEDIA_GATEWAY_ALLOWED_ORIGINS entries must be exact origins without path, query, fragment, or credentials.");
    }
    if (parsed.hostname.includes("*")) {
        throw new Error("MEDIA_GATEWAY_ALLOWED_ORIGINS must not contain wildcard hostnames.");
    }
    return parsed.origin;
}

function parsePositiveInt(raw, fallback) {
    const value = Number(raw || fallback);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}

function parseBoundedPositiveInt(name, raw, fallback, max) {
    const text = String(raw ?? "").trim();
    if (!text) return fallback;
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0 || value > max) {
        throw new Error(`${name} must be a positive integer up to ${max}.`);
    }
    if (!Number.isInteger(value)) {
        throw new Error(`${name} must be a positive integer up to ${max}.`);
    }
    return value;
}

function parseBoolean(raw, fallback) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (!value) return fallback;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    throw new Error(`Invalid boolean value: ${raw}`);
}
