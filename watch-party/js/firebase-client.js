import { MESSAGES } from "./utils.js";
import { assertFirebaseServicesAvailable } from "./service-availability.js";

const FIREBASE_VERSION = "10.12.5";
const APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;
const DB_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`;
const APP_CHECK_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`;
const PRODUCTION_HOSTS = new Set(["freemovieir.github.io"]);
const connectedEmulatorApps = new Set();

export async function loadWatchPartyConfig() {
    try {
        const module = await import("../runtime-config.js");
        return module.watchPartyConfig;
    } catch {}
    try {
        const module = await import("../firebase-config.js");
        return module.watchPartyConfig;
    } catch (error) {
        return { error, missing: true };
    }
}

export async function createFirebaseClient(config) {
    if (!config?.firebase?.apiKey || !config?.firebase?.databaseURL) {
        throw new Error(MESSAGES.missingConfig);
    }

    if (shouldUseEmulators(config)) {
        await assertFirebaseServicesAvailable(config);
    }

    const [{ initializeApp }, authModule, dbModule] = await Promise.all([
        import(APP_URL),
        import(AUTH_URL),
        import(DB_URL)
    ]);

    const app = initializeApp(config.firebase);
    await initializeAppCheckIfConfigured(app, config);
    const auth = authModule.getAuth(app);
    const database = dbModule.getDatabase(app);
    const emulatorMode = shouldUseEmulators(config);

    if (emulatorMode) {
        connectEmulatorsOnce({ app, auth, database, authModule, dbModule, config });
    }

    await withTimeout(
        authModule.signInAnonymously(auth),
        Number(config?.authTimeoutMs || config?.createRoomTimeoutMs || 10000),
        MESSAGES.authFailed
    ).catch(() => {
        throw new Error(MESSAGES.authFailed);
    });

    return {
        app,
        auth,
        user: auth.currentUser,
        database,
        emulatorMode,
        db: dbModule,
        serverTimestamp: dbModule.serverTimestamp,
        increment: dbModule.increment
    };
}

async function initializeAppCheckIfConfigured(app, config) {
    const appCheck = config?.appCheck || {};
    if (!appCheck.enabled) return;
    try {
        if (appCheck.debugToken && shouldUseEmulators(config)) {
            globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheck.debugToken === true ? true : String(appCheck.debugToken);
        }
        const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(APP_CHECK_URL);
        initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(appCheck.siteKey || ""),
            isTokenAutoRefreshEnabled: appCheck.autoRefresh !== false
        });
    } catch (error) {
        console.warn("[watch-party] App Check initialization failed", { message: error.message });
    }
}

export function shouldUseEmulators(config, hostname = globalThis.location?.hostname || "") {
    if (PRODUCTION_HOSTS.has(hostname)) return false;
    return Boolean(config?.useEmulators || config?.firebase?.useEmulators || hostname === "localhost" || hostname === "127.0.0.1");
}

export async function ensureFirebaseServicesAvailable(config, options = {}) {
    if (!shouldUseEmulators(config, options.hostname ?? globalThis.location?.hostname ?? "")) return null;
    return assertFirebaseServicesAvailable(config, options);
}

function connectEmulatorsOnce({ app, auth, database, authModule, dbModule, config }) {
    const appName = app.name || "[DEFAULT]";
    if (connectedEmulatorApps.has(appName)) return;
    const emulators = {
        auth: {
            url: config?.emulators?.auth?.url || "http://127.0.0.1:9099"
        },
        database: {
            host: config?.emulators?.database?.host || "127.0.0.1",
            port: Number(config?.emulators?.database?.port || 9000)
        }
    };
    authModule.connectAuthEmulator(auth, emulators.auth.url, { disableWarnings: true });
    dbModule.connectDatabaseEmulator(database, emulators.database.host, emulators.database.port);
    connectedEmulatorApps.add(appName);
}

function withTimeout(promise, timeoutMs, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
