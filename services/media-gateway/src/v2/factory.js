import { loadGatewayConfig, validateProductionGatewayConfig } from "./config.js";
import { createMediaGatewayApi } from "./api-server.js";
import { StaticTokenVerifier, FirebaseAdminTokenVerifier } from "./auth-adapters.js";
import { FakeJobExecutor } from "./executors/fake-job-executor.js";
import { CloudRunJobExecutor } from "./executors/cloud-run-job-executor.js";
import { MemoryJobStore } from "./stores/memory-job-store.js";
import { MemoryObjectStore } from "./stores/memory-object-store.js";
import { RtdbJobStore } from "./stores/rtdb-job-store.js";
import { CloudStorageObjectStore } from "./stores/cloud-storage-object-store.js";

export async function createGatewayDependencies(env = process.env, options = {}) {
    const config = loadGatewayConfig(env);
    if (config.localMode) {
        return {
            config,
            jobStore: new MemoryJobStore(),
            objectStore: new MemoryObjectStore(),
            executor: new FakeJobExecutor(),
            tokenVerifier: new StaticTokenVerifier()
        };
    }
    validateProductionGatewayConfig(config, {
        requireAllowedOrigins: options.requireAllowedOrigins !== false
    });
    const database = await createAdminDatabase(config);
    const storage = await createStorageClient();
    return {
        config,
        jobStore: new RtdbJobStore({ database, path: config.databasePath }),
        objectStore: new CloudStorageObjectStore({
            storage,
            bucketName: config.bucket,
            signingExpiresMs: config.limits.playbackTtlMs
        }),
        executor: new CloudRunJobExecutor({
            projectId: config.projectId,
            region: config.region,
            jobName: config.workerJob
        }),
        tokenVerifier: new FirebaseAdminTokenVerifier({ projectId: config.projectId })
    };
}

export async function createDefaultGatewayServer(env = process.env) {
    const dependencies = await createGatewayDependencies(env, { requireAllowedOrigins: true });
    return createMediaGatewayApi(dependencies);
}

async function createAdminDatabase(config) {
    return createGatewayAdminDatabase(config);
}

export async function createGatewayAdminDatabase(config, modules = null) {
    const adminModules = modules || await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/database")
    ]);
    const [{ getApps, initializeApp }, { getDatabase }] = adminModules;
    const appName = getGatewayDatabaseAppName(config);
    const existingApp = getApps().find((app) => app.name === appName);
    const app = existingApp || initializeApp(buildGatewayDatabaseAppOptions(config), appName);
    return getDatabase(app);
}

export async function closeGatewayAdminDatabaseApp(config, modules = null) {
    const appModule = modules || await import("firebase-admin/app");
    const { deleteApp, getApps } = Array.isArray(appModule) ? appModule[0] : appModule;
    const appName = getGatewayDatabaseAppName(config);
    if (appName === "[DEFAULT]") return false;
    const app = getApps().find((candidate) => candidate.name === appName);
    if (!app) return false;
    await deleteApp(app);
    return true;
}

export function getGatewayDatabaseAppName(config) {
    if (!config?.dbAuthUid) throw new Error("MEDIA_GATEWAY_DB_AUTH_UID is required for the Gateway database app.");
    return `media-gateway-db-${config.dbAuthUid}`;
}

export function buildGatewayDatabaseAppOptions(config) {
    if (!config?.projectId) throw new Error("MEDIA_GATEWAY_PROJECT_ID is required for the Gateway database app.");
    if (!config?.databaseUrl) throw new Error("MEDIA_GATEWAY_DATABASE_URL is required for the Gateway database app.");
    if (!config?.dbAuthUid) throw new Error("MEDIA_GATEWAY_DB_AUTH_UID is required for the Gateway database app.");
    return {
        projectId: config.projectId,
        databaseURL: config.databaseUrl,
        databaseAuthVariableOverride: {
            uid: config.dbAuthUid
        }
    };
}

async function createStorageClient() {
    const { Storage } = await import("@google-cloud/storage");
    return new Storage();
}
