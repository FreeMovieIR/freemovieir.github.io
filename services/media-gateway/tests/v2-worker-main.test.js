import test from "node:test";
import assert from "node:assert/strict";
import { runWorkerMain } from "../src/worker-main.js";

test("successful worker lifecycle cleans up and exits zero", async () => {
    const fixture = createLifecycleFixture({ workerResult: { acquired: true, ready: true } });

    const result = await runWorkerMain(fixture.options);

    assert.equal(result.exitCode, 0);
    assert.equal(result.result.ready, true);
    assert.deepEqual(fixture.cleanupCalls, [fixture.config]);
});

test("failed worker lifecycle cleans up and exits non-zero", async () => {
    const fixture = createLifecycleFixture({ workerResult: { acquired: true, failed: true, safeError: "CONVERSION_FAILED" } });

    const result = await runWorkerMain(fixture.options);

    assert.equal(result.exitCode, 1);
    assert.equal(result.result.failed, true);
    assert.deepEqual(fixture.cleanupCalls, [fixture.config]);
});

test("lease-not-acquired worker lifecycle cleans up and exits zero", async () => {
    const fixture = createLifecycleFixture({ workerResult: { acquired: false } });

    const result = await runWorkerMain(fixture.options);

    assert.equal(result.exitCode, 0);
    assert.equal(result.result.acquired, false);
    assert.deepEqual(fixture.cleanupCalls, [fixture.config]);
});

test("unexpected worker error still cleans up and exits non-zero", async () => {
    const fixture = createLifecycleFixture({
        runWorker: async () => {
            throw new Error("sensitive internal failure");
        }
    });

    const result = await runWorkerMain(fixture.options);

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.result, { failed: true, safeError: "WORKER_UNEXPECTED" });
    assert.deepEqual(fixture.cleanupCalls, [fixture.config]);
});

test("cleanup failure is safely handled and exits non-zero", async () => {
    const logs = [];
    const fixture = createLifecycleFixture({
        workerResult: { acquired: true, ready: true },
        closeDatabaseApp: async () => {
            throw new Error("private firebase cleanup details");
        },
        logger: {
            warn(event, details) {
                logs.push({ event, details });
            }
        }
    });

    const result = await runWorkerMain(fixture.options);

    assert.equal(result.exitCode, 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, "[media-gateway] worker-cleanup-failed");
    assert.deepEqual(logs[0].details, { safeError: "ADMIN_APP_CLEANUP_FAILED" });
});

function createLifecycleFixture({
    workerResult = { acquired: true, ready: true },
    runWorker = null,
    closeDatabaseApp = null,
    logger = console
} = {}) {
    const config = { dbAuthUid: "media-gateway-worker" };
    const dependencies = {
        config,
        jobStore: {},
        objectStore: {},
        executor: {},
        tokenVerifier: {}
    };
    const cleanupCalls = [];
    return {
        config,
        cleanupCalls,
        options: {
            env: { MEDIA_GATEWAY_JOB_KEY: "job-key" },
            logger,
            createDependencies: async (env, options) => {
                assert.equal(env.MEDIA_GATEWAY_JOB_KEY, "job-key");
                assert.deepEqual(options, { requireAllowedOrigins: false });
                return dependencies;
            },
            runWorker: runWorker || (async (args) => {
                assert.equal(args.jobKey, "job-key");
                assert.equal(args.config, config);
                return workerResult;
            }),
            closeDatabaseApp: closeDatabaseApp || (async (receivedConfig) => {
                cleanupCalls.push(receivedConfig);
            })
        }
    };
}
