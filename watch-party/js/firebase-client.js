import { MESSAGES, safeLog } from "./utils.js";
import { assertFirebaseServicesAvailable } from "./service-availability.js";
import {
    FIREBASE_INIT_ERROR_CATEGORIES,
    getSafeAuthLogDetails,
    toAuthInitializationError,
    toFirebaseInitializationError,
    withAuthTimeout
} from "./auth-diagnostics.js";

const FIREBASE_VERSION = "10.12.5";
const APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;
const DB_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`;
const APP_CHECK_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`;
const connectedEmulatorApps = new Set();

export async function loadWatchPartyConfig() {
    const localPage = isLocalPage();
    try {
        const module = await import(withBuildQuery("../runtime-config.js"));
        return module.watchPartyConfig;
    } catch (error) {
        if (!localPage) {
            return {
                error: toFirebaseInitializationError(error, FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED),
                missing: true,
                productionMissing: true
            };
        }
    }
    try {
        const module = await import("../firebase-config.js");
        return module.watchPartyConfig;
    } catch (error) {
        return {
            error: toFirebaseInitializationError(error, FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED),
            missing: true
        };
    }
}

export async function createFirebaseClient(config, serviceCheckOptions = {}) {
    if (!config?.firebase?.apiKey || !config?.firebase?.databaseURL) {
        throw toFirebaseInitializationError(new Error("firebase-config-missing"), FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED);
    }

    if (shouldUseEmulators(config)) {
        await assertFirebaseServicesAvailable(config, serviceCheckOptions);
    }

    const { appModule, authModule, dbModule } = await loadFirebaseSdkModules(serviceCheckOptions.sdkImporter);

    const app = appModule.getApps?.().length ? appModule.getApp() : appModule.initializeApp(config.firebase);
    await initializeAppCheckIfConfigured(app, config);
    const auth = authModule.getAuth(app);
    const database = dbModule.getDatabase(app);
    const emulatorMode = shouldUseEmulators(config);

    if (emulatorMode) {
        connectEmulatorsOnce({ app, auth, database, authModule, dbModule, config });
    }

    await withAuthTimeout(
        authModule.signInAnonymously(auth),
        Number(config?.authTimeoutMs || config?.createRoomTimeoutMs || 10000)
    ).catch((error) => {
        const authError = toAuthInitializationError(error);
        safeLog("anonymous auth failed", getSafeAuthLogDetails(error));
        throw authError;
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

async function loadFirebaseSdkModules(sdkImporter) {
    const importer = sdkImporter || ((url) => import(url));
    try {
        const [appModule, authModule, dbModule] = await Promise.all([
            importer(APP_URL),
            importer(AUTH_URL),
            importer(DB_URL)
        ]);
        return { appModule, authModule, dbModule };
    } catch (error) {
        const initError = toFirebaseInitializationError(error);
        safeLog("firebase sdk load failed", {
            category: initError.category,
            firebaseCode: "",
            online: typeof globalThis.navigator?.onLine === "boolean" ? globalThis.navigator.onLine : null
        });
        throw initError;
    }
}

async function initializeAppCheckIfConfigured(app, config) {
    const appCheck = config?.appCheck || {};
    if (!appCheck.enabled) return;
    try {
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
    if (config?.environment === "production") return false;
    const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    return Boolean((config?.useEmulators || config?.firebase?.useEmulators) && localHost);
}

export async function ensureFirebaseServicesAvailable(config, options = {}) {
    if (!shouldUseEmulators(config, options.hostname ?? globalThis.location?.hostname ?? "")) return null;
    return assertFirebaseServicesAvailable(config, options);
}

function connectEmulatorsOnce({ app, auth, database, authModule, dbModule, config }) {
    const appName = app.name || "[DEFAULT]";
    if (connectedEmulatorApps.has(appName)) return;
    if (!config?.emulators?.auth?.url || !config?.emulators?.database?.host || !config?.emulators?.database?.port) {
        throw new Error(MESSAGES.missingConfig);
    }
    const emulators = {
        auth: {
            url: config.emulators.auth.url
        },
        database: {
            host: config.emulators.database.host,
            port: Number(config.emulators.database.port)
        }
    };
    authModule.connectAuthEmulator(auth, emulators.auth.url, { disableWarnings: true });
    dbModule.connectDatabaseEmulator(database, emulators.database.host, emulators.database.port);
    connectedEmulatorApps.add(appName);
}

function isLocalPage(hostname = globalThis.location?.hostname || "") {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function withBuildQuery(path) {
    const buildId = String(globalThis.wpBuildId || "");
    return buildId ? `${path}?v=${encodeURIComponent(buildId)}` : path;
}
