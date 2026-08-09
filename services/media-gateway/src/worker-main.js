import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeGatewayAdminDatabaseApp, createGatewayDependencies } from "./v2/factory.js";
import { runMediaWorker } from "./v2/worker.js";

export async function runWorkerMain({
    env = process.env,
    createDependencies = createGatewayDependencies,
    closeDatabaseApp = closeGatewayAdminDatabaseApp,
    runWorker = runMediaWorker,
    logger = console
} = {}) {
    let dependencies = null;
    let exitCode = 0;
    let result = null;
    try {
        const jobKey = env.MEDIA_GATEWAY_JOB_KEY || "";
        dependencies = await createDependencies(env, { requireAllowedOrigins: false });
        result = await runWorker({ jobKey, ...dependencies });
        if (result.failed) exitCode = 1;
    } catch {
        exitCode = 1;
        result = { failed: true, safeError: "WORKER_UNEXPECTED" };
    } finally {
        if (dependencies?.config) {
            try {
                await closeDatabaseApp(dependencies.config);
            } catch {
                exitCode = 1;
                logger.warn?.("[media-gateway] worker-cleanup-failed", {
                    safeError: "ADMIN_APP_CLEANUP_FAILED"
                });
            }
        }
    }
    return { exitCode, result };
}

function isDirectRun() {
    return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

if (isDirectRun()) {
    const { exitCode } = await runWorkerMain();
    process.exitCode = exitCode;
}
