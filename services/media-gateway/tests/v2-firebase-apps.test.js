import test from "node:test";
import assert from "node:assert/strict";
import {
    buildGatewayDatabaseAppOptions,
    closeGatewayAdminDatabaseApp,
    createGatewayAdminDatabase,
    getGatewayDatabaseAppName
} from "../src/v2/factory.js";
import { getAdminAuth } from "../src/v2/auth-adapters.js";

test("Gateway database uses a named app with databaseAuthVariableOverride", async () => {
    const fixture = createAdminFixture();
    const config = gatewayConfig("media-gateway-api");
    const database = await createGatewayAdminDatabase(config, [fixture.appModule, fixture.databaseModule]);

    assert.equal(database.app.name, "media-gateway-db-media-gateway-api");
    assert.deepEqual(database.app.options.databaseAuthVariableOverride, { uid: "media-gateway-api" });
    assert.equal(database.app.options.databaseURL, config.databaseUrl);
    assert.equal(database.app.options.projectId, config.projectId);
    assert.equal(fixture.apps.length, 1);
    assert.equal(fixture.apps[0].name, "media-gateway-db-media-gateway-api");
});

test("Gateway database app name and override reflect API and Worker identities", () => {
    const api = gatewayConfig("media-gateway-api");
    const worker = gatewayConfig("media-gateway-worker");

    assert.equal(getGatewayDatabaseAppName(api), "media-gateway-db-media-gateway-api");
    assert.equal(getGatewayDatabaseAppName(worker), "media-gateway-db-media-gateway-worker");
    assert.deepEqual(buildGatewayDatabaseAppOptions(api).databaseAuthVariableOverride, { uid: "media-gateway-api" });
    assert.deepEqual(buildGatewayDatabaseAppOptions(worker).databaseAuthVariableOverride, { uid: "media-gateway-worker" });
});

test("Auth initialization uses DEFAULT app even when named DB app exists first", async () => {
    const fixture = createAdminFixture();
    await createGatewayAdminDatabase(gatewayConfig("media-gateway-worker"), [fixture.appModule, fixture.databaseModule]);

    const auth = await getAdminAuth([fixture.appModule, fixture.authModule]);

    assert.equal(auth.app.name, "[DEFAULT]");
    assert.deepEqual(auth.app.options, {});
    assert.deepEqual(fixture.apps.map((app) => app.name), [
        "media-gateway-db-media-gateway-worker",
        "[DEFAULT]"
    ]);
});

test("Creating DEFAULT Auth app before DB app does not downscope Auth or remove default app", async () => {
    const fixture = createAdminFixture();
    const auth = await getAdminAuth([fixture.appModule, fixture.authModule]);
    const database = await createGatewayAdminDatabase(gatewayConfig("media-gateway-api"), [fixture.appModule, fixture.databaseModule]);

    assert.equal(auth.app.name, "[DEFAULT]");
    assert.deepEqual(auth.app.options, {});
    assert.equal(database.app.name, "media-gateway-db-media-gateway-api");
    assert.deepEqual(database.app.options.databaseAuthVariableOverride, { uid: "media-gateway-api" });
    assert.deepEqual(fixture.apps.map((app) => app.name), [
        "[DEFAULT]",
        "media-gateway-db-media-gateway-api"
    ]);
});

test("Firebase Admin app initialization is idempotent", async () => {
    const fixture = createAdminFixture();
    const firstDb = await createGatewayAdminDatabase(gatewayConfig("media-gateway-api"), [fixture.appModule, fixture.databaseModule]);
    const secondDb = await createGatewayAdminDatabase(gatewayConfig("media-gateway-api"), [fixture.appModule, fixture.databaseModule]);
    const firstAuth = await getAdminAuth([fixture.appModule, fixture.authModule]);
    const secondAuth = await getAdminAuth([fixture.appModule, fixture.authModule]);

    assert.equal(firstDb.app, secondDb.app);
    assert.equal(firstAuth.app, secondAuth.app);
    assert.equal(fixture.initializeCalls.length, 2);
    assert.deepEqual(fixture.initializeCalls.map((call) => call.name), [
        "media-gateway-db-media-gateway-api",
        "[DEFAULT]"
    ]);
});

test("Gateway named DB apps can be deleted without touching DEFAULT or other identities", async () => {
    const fixture = createAdminFixture();
    const auth = await getAdminAuth([fixture.appModule, fixture.authModule]);
    const apiDb = await createGatewayAdminDatabase(gatewayConfig("media-gateway-api"), [fixture.appModule, fixture.databaseModule]);
    const workerDb = await createGatewayAdminDatabase(gatewayConfig("media-gateway-worker"), [fixture.appModule, fixture.databaseModule]);

    assert.equal(await closeGatewayAdminDatabaseApp(gatewayConfig("media-gateway-api"), fixture.appModule), true);

    assert.equal(auth.app.name, "[DEFAULT]");
    assert.equal(apiDb.app.deleted, true);
    assert.equal(workerDb.app.deleted, false);
    assert.deepEqual(fixture.appModule.getApps().map((app) => app.name), [
        "[DEFAULT]",
        "media-gateway-db-media-gateway-worker"
    ]);
    assert.deepEqual(fixture.deleteCalls.map((app) => app.name), ["media-gateway-db-media-gateway-api"]);
});

test("Gateway worker DB app cleanup is idempotent and missing app cleanup succeeds", async () => {
    const fixture = createAdminFixture();
    const workerConfig = gatewayConfig("media-gateway-worker");
    await createGatewayAdminDatabase(workerConfig, [fixture.appModule, fixture.databaseModule]);

    assert.equal(await closeGatewayAdminDatabaseApp(workerConfig, fixture.appModule), true);
    assert.equal(await closeGatewayAdminDatabaseApp(workerConfig, fixture.appModule), false);
    assert.equal(await closeGatewayAdminDatabaseApp(gatewayConfig("media-gateway-api"), fixture.appModule), false);
    assert.deepEqual(fixture.deleteCalls.map((app) => app.name), ["media-gateway-db-media-gateway-worker"]);
});

function gatewayConfig(dbAuthUid) {
    return {
        projectId: "demo-freemovieir",
        databaseUrl: "https://demo-freemovieir-default-rtdb.firebaseio.com",
        dbAuthUid
    };
}

function createAdminFixture() {
    const apps = [];
    const initializeCalls = [];
    const deleteCalls = [];
    const appModule = {
        getApps() {
            return apps.filter((app) => !app.deleted);
        },
        getApp(name = "[DEFAULT]") {
            const app = apps.find((candidate) => !candidate.deleted && candidate.name === name);
            if (!app) {
                const error = new Error(`Firebase app ${name} does not exist.`);
                error.code = "app/no-app";
                throw error;
            }
            return app;
        },
        initializeApp(options = {}, name = "[DEFAULT]") {
            const app = { name, options, deleted: false };
            apps.push(app);
            initializeCalls.push({ name, options });
            return app;
        },
        async deleteApp(app) {
            app.deleted = true;
            deleteCalls.push(app);
        }
    };
    return {
        apps,
        deleteCalls,
        initializeCalls,
        appModule,
        databaseModule: {
            getDatabase(app) {
                return { app };
            }
        },
        authModule: {
            getAuth(app) {
                return { app };
            }
        }
    };
}
