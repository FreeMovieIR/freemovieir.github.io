import { isLocalHostname } from "./utils.js";

export const SERVICE_STATUS = Object.freeze({
    CHECKING: "checking",
    AVAILABLE: "available",
    AUTH_UNAVAILABLE: "auth-unavailable",
    DATABASE_UNAVAILABLE: "database-unavailable",
    BOTH_UNAVAILABLE: "both-unavailable",
    RECONNECTING: "reconnecting"
});

export class ServiceAvailabilityError extends Error {
    constructor(status, details = {}) {
        super("Local Firebase Emulator services are unavailable.");
        this.name = "ServiceAvailabilityError";
        this.status = status;
        this.details = details;
    }
}

export function getEmulatorEndpoints(config = {}) {
    const authUrl = config?.emulators?.auth?.url || "http://127.0.0.1:9099";
    const dbHost = config?.emulators?.database?.host || "127.0.0.1";
    const dbPort = Number(config?.emulators?.database?.port || 9000);
    const projectId = config?.firebase?.projectId || "demo-freemovieir";
    const authHealthUrl = `${authUrl.replace(/\/$/, "")}/emulator/v1/projects/${encodeURIComponent(projectId)}/config`;
    return {
        authUrl,
        authHealthUrl,
        databaseUrl: `http://${dbHost}:${dbPort}/.json?ns=${encodeURIComponent(projectId)}`,
        auth: new URL(authUrl),
        database: { host: dbHost, port: dbPort }
    };
}

export function shouldCheckLocalServices(config = {}, hostname = globalThis.location?.hostname || "") {
    if (hostname === "freemovieir.github.io") return false;
    return Boolean(config?.useEmulators || config?.firebase?.useEmulators || isLocalHostname(hostname));
}

export async function checkFirebaseServices(config = {}, options = {}) {
    const hostname = options.hostname ?? globalThis.location?.hostname ?? "";
    const timeoutMs = Number(options.timeoutMs || config?.serviceCheckTimeoutMs || 4000);
    if (!shouldCheckLocalServices(config, hostname)) {
        return makeResult(SERVICE_STATUS.AVAILABLE, true, true);
    }
    const forcedStatus = getForcedServiceStatus(hostname);
    if (forcedStatus) {
        return makeResult(
            forcedStatus,
            forcedStatus !== SERVICE_STATUS.AUTH_UNAVAILABLE && forcedStatus !== SERVICE_STATUS.BOTH_UNAVAILABLE,
            forcedStatus !== SERVICE_STATUS.DATABASE_UNAVAILABLE && forcedStatus !== SERVICE_STATUS.BOTH_UNAVAILABLE,
            getEmulatorEndpoints(config)
        );
    }

    const endpoints = getEmulatorEndpoints(config);
    const fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    if (!fetchFn) {
        return makeResult(SERVICE_STATUS.BOTH_UNAVAILABLE, false, false, endpoints);
    }
    const [auth, database] = await Promise.all([
        probeEndpoint(fetchFn, endpoints.authHealthUrl, timeoutMs),
        probeEndpoint(fetchFn, endpoints.databaseUrl, timeoutMs)
    ]);
    const status = getStatus(auth.ok, database.ok);
    return makeResult(status, auth.ok, database.ok, endpoints, { auth, database });
}

function getForcedServiceStatus(hostname) {
    if (!isLocalHostname(hostname)) return null;
    const forced = globalThis.__WATCH_PARTY_TEST__?.forceServiceStatus;
    return Object.values(SERVICE_STATUS).includes(forced) ? forced : null;
}

export async function assertFirebaseServicesAvailable(config = {}, options = {}) {
    const result = await checkFirebaseServices(config, options);
    if (result.status !== SERVICE_STATUS.AVAILABLE) throw new ServiceAvailabilityError(result.status, result);
    return result;
}

export function getStatus(authAvailable, databaseAvailable) {
    if (authAvailable && databaseAvailable) return SERVICE_STATUS.AVAILABLE;
    if (!authAvailable && !databaseAvailable) return SERVICE_STATUS.BOTH_UNAVAILABLE;
    if (!authAvailable) return SERVICE_STATUS.AUTH_UNAVAILABLE;
    return SERVICE_STATUS.DATABASE_UNAVAILABLE;
}

function makeResult(status, authAvailable, databaseAvailable, endpoints = null, probes = {}) {
    return {
        status,
        authAvailable,
        databaseAvailable,
        endpoints,
        probes,
        checkedAt: Date.now()
    };
}

async function probeEndpoint(fetchFn, url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await fetchFn(url, {
            method: "GET",
            mode: "cors",
            cache: "no-store",
            signal: controller.signal
        });
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            errorName: error?.name || "Error",
            message: error?.message || ""
        };
    } finally {
        clearTimeout(timer);
    }
}
