import { loadGatewayConfig, validateProductionGatewayConfig } from "./config.js";
import { createMediaGatewayApi } from "./api-server.js";
import { StaticTokenVerifier, FirebaseAdminTokenVerifier } from "./auth-adapters.js";
import { FakeJobExecutor } from "./executors/fake-job-executor.js";
import { CloudRunJobExecutor } from "./executors/cloud-run-job-executor.js";
import { MemoryJobStore } from "./stores/memory-job-store.js";
import { MemoryObjectStore } from "./stores/memory-object-store.js";
import { RtdbJobStore } from "./stores/rtdb-job-store.js";
import { CloudStorageObjectStore } from "./stores/cloud-storage-object-store.js";

export async function createGatewayDependencies(env = process.env) {
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
    validateProductionGatewayConfig(config);
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
    const dependencies = await createGatewayDependencies(env);
    return createMediaGatewayApi(dependencies);
}

async function createAdminDatabase(config) {
    const [{ getApps, initializeApp }, { getDatabase }] = await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/database")
    ]);
    if (!getApps().length) {
        initializeApp({
            projectId: config.projectId,
            databaseURL: config.databaseUrl
        });
    }
    return getDatabase();
}

async function createStorageClient() {
    const { Storage } = await import("@google-cloud/storage");
    return new Storage();
}
