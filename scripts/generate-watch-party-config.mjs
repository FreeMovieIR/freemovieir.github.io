import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const environment = args.mode || process.env.WATCH_PARTY_ENVIRONMENT || "test";
const outputPath = resolve(root, args.output || "watch-party/runtime-config.js");

const requiredProduction = [
    "WATCH_PARTY_FIREBASE_API_KEY",
    "WATCH_PARTY_FIREBASE_AUTH_DOMAIN",
    "WATCH_PARTY_FIREBASE_DATABASE_URL",
    "WATCH_PARTY_FIREBASE_PROJECT_ID",
    "WATCH_PARTY_FIREBASE_APP_ID"
];

const localDefaults = {
    WATCH_PARTY_FIREBASE_API_KEY: "demo-key",
    WATCH_PARTY_FIREBASE_AUTH_DOMAIN: "demo-freemovieir.firebaseapp.com",
    WATCH_PARTY_FIREBASE_DATABASE_URL: "http://127.0.0.1:9000?ns=demo-freemovieir-default-rtdb",
    WATCH_PARTY_FIREBASE_PROJECT_ID: "demo-freemovieir",
    WATCH_PARTY_FIREBASE_APP_ID: "1:1:web:demo",
    WATCH_PARTY_APP_CHECK_SITE_KEY: "",
    WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT: "",
    WATCH_PARTY_MEDIA_GATEWAY_ENABLED: "",
    WATCH_PARTY_MEDIA_GATEWAY_BASE_URL: "",
    WATCH_PARTY_MEDIA_GATEWAY_URL: "",
    WATCH_PARTY_RTC_ICE_SERVERS: JSON.stringify([
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ])
};

const defaultStunServers = Object.freeze([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
]);

function getValue(name) {
    if (process.env[name] !== undefined) return process.env[name];
    return environment === "production" ? "" : localDefaults[name] || "";
}

function assertNoPrivateCredential(name, raw) {
    const text = String(raw || "");
    if (/BEGIN PRIVATE KEY|service_account|private_key|firebase-adminsdk/i.test(text)) {
        throw new Error(`${name} looks like a private credential and must not be placed in frontend config.`);
    }
}

function redact(raw) {
    const text = String(raw || "");
    if (text.length <= 8) return "[redacted]";
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

if (environment === "production") {
    const missing = requiredProduction.filter((name) => !getValue(name));
    if (missing.length) {
        throw new Error(`Missing production Watch Party config variables: ${missing.join(", ")}`);
    }
}

const firebase = {
    apiKey: getValue("WATCH_PARTY_FIREBASE_API_KEY"),
    authDomain: getValue("WATCH_PARTY_FIREBASE_AUTH_DOMAIN"),
    databaseURL: getValue("WATCH_PARTY_FIREBASE_DATABASE_URL"),
    projectId: getValue("WATCH_PARTY_FIREBASE_PROJECT_ID"),
    appId: getValue("WATCH_PARTY_FIREBASE_APP_ID")
};

for (const [key, value] of Object.entries(firebase)) assertNoPrivateCredential(`firebase.${key}`, value);

const appCheckSiteKey = getValue("WATCH_PARTY_APP_CHECK_SITE_KEY");
const isProduction = environment === "production";
const publicRoomFlags = resolvePublicRoomFlags({ isProduction });
const turnCredentialsEndpoint = normalizeOptionalEndpoint(
    getValue("WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT"),
    "WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT",
    isProduction
);
const mediaGatewayFlags = resolveMediaGatewayFlags({ isProduction });
assertNoPrivateCredential("WATCH_PARTY_APP_CHECK_SITE_KEY", appCheckSiteKey);
assertNoPrivateCredential("WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT", turnCredentialsEndpoint);
assertNoPrivateCredential("WATCH_PARTY_MEDIA_GATEWAY_BASE_URL", mediaGatewayFlags.baseUrl);

const iceServers = parseIceServers(getValue("WATCH_PARTY_RTC_ICE_SERVERS") || "[]");
const config = {
    environment,
    firebase,
    useEmulators: !isProduction,
    appCheck: {
        enabled: Boolean(isProduction && appCheckSiteKey),
        provider: "recaptcha-enterprise",
        siteKey: appCheckSiteKey,
        autoRefresh: true
    },
    rtc: {
        iceServers: iceServers.length ? iceServers : defaultStunServers,
        turnCredentialsEndpoint,
        connectionTimeoutMs: 10000,
        maxIceRestarts: 2,
        relayFallback: true
    },
    mediaGateway: {
        enabled: mediaGatewayFlags.enabled,
        baseUrl: mediaGatewayFlags.baseUrl,
        requestTimeoutMs: 15000,
        jobTimeoutMs: 120000,
        preferRemux: true
    },
    publicRooms: {
        enabled: publicRoomFlags.enabled,
        creationEnabled: publicRoomFlags.creationEnabled,
        maintenance: publicRoomFlags.maintenance,
        forceDisableActiveRooms: false,
        maxCapacity: 7,
        minCapacity: 2,
        maxDirectoryRooms: 50,
        functionTimeoutMs: 10000,
        roomRetentionMs: 12 * 60 * 60 * 1000,
        staleGuestGraceMs: 2 * 60 * 1000,
        staleHostGraceMs: 2 * 60 * 1000
    },
    roomLifetimeMs: 6 * 60 * 60 * 1000,
    serviceCheckTimeoutMs: 4000,
    createRoomTimeoutMs: 10000,
    joinRoomTimeoutMs: 10000,
    replaceMediaTimeoutMs: 10000,
    nativeMetadataTimeoutMs: 15000,
    restoreTimeoutMs: 10000,
    maxStoredSessionAgeMs: 6 * 60 * 60 * 1000,
    subtitleSizeLimit: 300 * 1024,
    chatLengthLimit: 500,
    maxChatMessages: 75,
    mediabunny: {
        moduleUrl: "./vendor/mediabunny/mediabunny.min.mjs",
        ac3ModuleUrl: "./vendor/mediabunny-ac3/mediabunny-ac3.min.mjs"
    },
    sync: {
        heartbeatMs: 5000,
        smallDriftMs: 250,
        hardSeekDriftMs: 1000,
        softCorrectionRateDelta: 0.06,
        bufferDebounceMs: 1200
    }
};

if (!isProduction) {
    config.emulators = {
        auth: { url: "http://127.0.0.1:9099" },
        database: { host: "127.0.0.1", port: 9000 },
        functions: { host: "127.0.0.1", port: 5001, region: "us-central1" },
        ui: { url: "http://127.0.0.1:4000" }
    };
}

const js = `export const watchPartyConfig = ${JSON.stringify(config, null, 4)};\n`;
if (isProduction) validateProductionConfigText(js);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, js, "utf8");
console.log(`[watch-party:config] generated ${environment} runtime config at ${relativeDisplay(outputPath)}. Values are not printed. Project: ${redact(firebase.projectId)}`);

function parseArgs(argv) {
    const parsed = {};
    for (const arg of argv) {
        const match = /^--([^=]+)=(.*)$/.exec(arg);
        if (match) parsed[match[1]] = match[2];
    }
    return parsed;
}

function parseIceServers(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw || "[]");
    } catch {
        throw new Error("WATCH_PARTY_RTC_ICE_SERVERS must be a JSON array.");
    }
    if (!Array.isArray(parsed)) throw new Error("WATCH_PARTY_RTC_ICE_SERVERS must be a JSON array.");
    for (const [index, server] of parsed.entries()) {
        if (!server || typeof server !== "object" || Array.isArray(server)) {
            throw new Error(`WATCH_PARTY_RTC_ICE_SERVERS[${index}] must be an object.`);
        }
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        if (!urls.length || urls.some((url) => typeof url !== "string" || !/^(stun|turns?):/i.test(url))) {
            throw new Error(`WATCH_PARTY_RTC_ICE_SERVERS[${index}].urls must contain STUN/TURN URLs.`);
        }
        const hasTurn = urls.some((url) => /^turns?:/i.test(url));
        if (hasTurn && (server.username || server.credential)) {
            throw new Error("Do not put permanent TURN usernames or credentials in WATCH_PARTY_RTC_ICE_SERVERS. Use WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT.");
        }
        assertNoPrivateCredential("WATCH_PARTY_RTC_ICE_SERVERS", JSON.stringify(server));
    }
    return parsed;
}

function resolvePublicRoomFlags({ isProduction }) {
    if (!isProduction) {
        return {
            enabled: true,
            creationEnabled: true,
            maintenance: false
        };
    }
    const enabled = parseProductionBoolean("WATCH_PARTY_PUBLIC_ROOMS_ENABLED", process.env.WATCH_PARTY_PUBLIC_ROOMS_ENABLED);
    const requestedCreationEnabled = parseProductionBoolean(
        "WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED",
        process.env.WATCH_PARTY_PUBLIC_ROOMS_CREATION_ENABLED
    );
    const maintenance = parseProductionBoolean(
        "WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE",
        process.env.WATCH_PARTY_PUBLIC_ROOMS_MAINTENANCE
    );
    return {
        enabled,
        creationEnabled: enabled && requestedCreationEnabled,
        maintenance
    };
}

function parseProductionBoolean(name, raw) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (value === "" || value === "false" || value === "0") return false;
    if (value === "true" || value === "1") return true;
    throw new Error(`${name} must be one of: true, 1, false, 0, or empty.`);
}

function resolveMediaGatewayFlags({ isProduction }) {
    const legacyUrl = getValue("WATCH_PARTY_MEDIA_GATEWAY_URL");
    const requestedBaseUrl = getValue("WATCH_PARTY_MEDIA_GATEWAY_BASE_URL") || legacyUrl;
    const baseUrl = normalizeOptionalHttpsUrl(requestedBaseUrl, "WATCH_PARTY_MEDIA_GATEWAY_BASE_URL");
    if (!isProduction) {
        return {
            enabled: Boolean(baseUrl),
            baseUrl
        };
    }
    const enabled = parseProductionBoolean("WATCH_PARTY_MEDIA_GATEWAY_ENABLED", process.env.WATCH_PARTY_MEDIA_GATEWAY_ENABLED);
    if (enabled && !baseUrl) throw new Error("WATCH_PARTY_MEDIA_GATEWAY_BASE_URL is required when WATCH_PARTY_MEDIA_GATEWAY_ENABLED=true.");
    return {
        enabled,
        baseUrl: enabled ? baseUrl : ""
    };
}

function normalizeOptionalHttpsUrl(raw, name) {
    const value = String(raw || "").trim();
    if (!value) return "";
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid HTTPS URL when provided.`);
    }
    if (parsed.protocol !== "https:") throw new Error(`${name} must use HTTPS in frontend config.`);
    parsed.username = "";
    parsed.password = "";
    return parsed.href.replace(/\/+$/, "/");
}

function normalizeOptionalEndpoint(raw, name, production) {
    const value = String(raw || "").trim();
    if (!value) return "";
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid URL when provided.`);
    }
    if (parsed.protocol !== "https:" && (production || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))) {
        throw new Error(`${name} must use HTTPS in production. Local HTTP endpoints are allowed only on loopback hosts.`);
    }
    parsed.username = "";
    parsed.password = "";
    return parsed.href.replace(/\/+$/, "/");
}

function validateProductionConfigText(text) {
if (
    /127\.0\.0\.1|localhost|demo-freemovieir|FIREBASE_APPCHECK_DEBUG_TOKEN|BEGIN PRIVATE KEY|service_account|private_key|__WATCH_PARTY_[A-Z0-9_]+__|\$\{WATCH_PARTY_[A-Z0-9_]+\}|YOUR_FIREBASE_|YOUR_PROJECT/i.test(text)
) {
    throw new Error(
        "Generated production config contains local, test, template, or private-credential text."
    );
}    if (!/environment"\s*:\s*"production"/.test(text) || !/useEmulators"\s*:\s*false/.test(text)) {
        throw new Error("Generated production config does not have production environment and disabled emulators.");
    }
}

function relativeDisplay(path) {
    return path.startsWith(root) ? path.slice(root.length + 1) : path;
}
