import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SERVICE_STATUS,
    checkFirebaseServices,
    getStatus,
    shouldCheckLocalServices
} from "../../watch-party/js/service-availability.js";

const config = {
    useEmulators: true,
    firebase: { projectId: "demo-freemovieir" },
    emulators: {
        auth: { url: "http://127.0.0.1:9099" },
        database: { host: "127.0.0.1", port: 9000 }
    },
    serviceCheckTimeoutMs: 20
};

test("local service status distinguishes auth, database, and combined outages", () => {
    assert.equal(getStatus(true, true), SERVICE_STATUS.AVAILABLE);
    assert.equal(getStatus(false, true), SERVICE_STATUS.AUTH_UNAVAILABLE);
    assert.equal(getStatus(true, false), SERVICE_STATUS.DATABASE_UNAVAILABLE);
    assert.equal(getStatus(false, false), SERVICE_STATUS.BOTH_UNAVAILABLE);
});

test("service checks run for localhost frontend ports but not production host", () => {
    assert.equal(shouldCheckLocalServices(config, "127.0.0.1"), true);
    assert.equal(shouldCheckLocalServices(config, "localhost"), true);
    assert.equal(shouldCheckLocalServices({ useEmulators: false }, "freemovieir.github.io"), false);
});

test("auth emulator unavailable is reported before room operations", async () => {
    const result = await checkFirebaseServices(config, {
        hostname: "127.0.0.1",
        fetchFn: async (url) => {
            if (String(url).includes("9099")) throw new Error("ECONNREFUSED");
            return {};
        }
    });
    assert.equal(result.status, SERVICE_STATUS.AUTH_UNAVAILABLE);
    assert.equal(result.authAvailable, false);
    assert.equal(result.databaseAvailable, true);
});

test("database emulator unavailable is reported before room operations", async () => {
    const result = await checkFirebaseServices(config, {
        hostname: "127.0.0.1",
        fetchFn: async (url) => {
            if (String(url).includes("9000")) throw new Error("ECONNREFUSED");
            return {};
        }
    });
    assert.equal(result.status, SERVICE_STATUS.DATABASE_UNAVAILABLE);
});

test("forced service status is injected through options instead of browser globals", async () => {
    const result = await checkFirebaseServices(config, {
        hostname: "127.0.0.1",
        forcedStatus: SERVICE_STATUS.BOTH_UNAVAILABLE,
        fetchFn: async () => {
            throw new Error("fetch should not run when forced");
        }
    });
    assert.equal(result.status, SERVICE_STATUS.BOTH_UNAVAILABLE);
    assert.equal(result.authAvailable, false);
    assert.equal(result.databaseAvailable, false);
});
