import assert from "node:assert/strict";
import { test } from "node:test";
import {
    AUTH_ERROR_CATEGORIES,
    AuthInitializationError,
    AuthTimeoutError,
    FIREBASE_INIT_ERROR_CATEGORIES,
    FirebaseInitializationError,
    classifyAuthError,
    classifyFirebaseSdkLoadError,
    getAuthUserMessage,
    getSafeAuthLogDetails,
    probeFirebasePublicEndpoints,
    toAuthInitializationError,
    toFirebaseInitializationError,
    withAuthTimeout
} from "../../watch-party/js/auth-diagnostics.js";
import { createFirebaseClient } from "../../watch-party/js/firebase-client.js";

const baseConfig = {
    environment: "production",
    firebase: {
        apiKey: "test-key",
        authDomain: "example.firebaseapp.com",
        databaseURL: "https://example-default-rtdb.firebaseio.com",
        projectId: "example",
        appId: "1:1:web:test"
    },
    authTimeoutMs: 25
};

test("auth diagnostics classify Firebase anonymous sign-in failures safely", () => {
    const cases = [
        [{ code: "auth/network-request-failed" }, AUTH_ERROR_CATEGORIES.NETWORK, "AUTH-NETWORK"],
        [{ code: "auth/operation-not-allowed" }, AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED, "AUTH-DISABLED"],
        [{ code: "auth/invalid-api-key" }, AUTH_ERROR_CATEGORIES.INVALID_CONFIG, "AUTH-CONFIG"],
        [{ code: "auth/app-not-authorized" }, AUTH_ERROR_CATEGORIES.INVALID_CONFIG, "AUTH-CONFIG"],
        [{ code: "auth/too-many-requests" }, AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS, "AUTH-RATE"],
        [new AuthTimeoutError(), AUTH_ERROR_CATEGORIES.TIMEOUT, "AUTH-TIMEOUT"],
        [{ code: "auth/internal-error", serverResponse: "secret" }, AUTH_ERROR_CATEGORIES.UNKNOWN, "AUTH-UNKNOWN"]
    ];

    for (const [input, category, code] of cases) {
        assert.equal(classifyAuthError(input), category);
        const error = toAuthInitializationError(input);
        assert.ok(error instanceof AuthInitializationError);
        assert.equal(error.category, category);
        assert.equal(error.code, code);
        assert.deepEqual(Object.keys(error).sort(), ["category", "code", "name", "retryable"].sort());
    }
});

test("auth diagnostics expose Persian messages without raw Firebase internals", () => {
    const network = toAuthInitializationError({ code: "auth/network-request-failed", message: "raw network detail", apiKey: "secret" });
    assert.equal(getAuthUserMessage(network), "اتصال به سرویس ورود برقرار نشد.");
    assert.equal(network.message, "اتصال به سرویس ورود برقرار نشد.");
    assert.doesNotMatch(network.message, /raw|secret|apiKey/i);

    const logDetails = getSafeAuthLogDetails(network, false);
    assert.deepEqual(logDetails, {
        category: AUTH_ERROR_CATEGORIES.NETWORK,
        firebaseCode: "auth/network-request-failed",
        online: false
    });
});

test("auth timeout rejects as a classified retryable timeout", async () => {
    await assert.rejects(
        withAuthTimeout(new Promise(() => {}), 1),
        (error) => {
            const classified = toAuthInitializationError(error);
            assert.equal(classified.category, AUTH_ERROR_CATEGORIES.TIMEOUT);
            assert.equal(classified.code, "AUTH-TIMEOUT");
            assert.equal(classified.retryable, true);
            return true;
        }
    );
});

test("Firebase SDK diagnostics distinguish network, load, and config failures", () => {
    assert.equal(classifyFirebaseSdkLoadError(new TypeError("Failed to fetch dynamically imported module")), FIREBASE_INIT_ERROR_CATEGORIES.SDK_NETWORK);
    assert.equal(classifyFirebaseSdkLoadError(new SyntaxError("Unexpected token export")), FIREBASE_INIT_ERROR_CATEGORIES.SDK_LOAD_FAILED);

    const configError = toFirebaseInitializationError(new Error("runtime config 404"), FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED);
    assert.ok(configError instanceof FirebaseInitializationError);
    assert.equal(configError.category, FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED);
    assert.equal(configError.code, "FIREBASE-CONFIG-LOAD");
    assert.equal(configError.retryable, false);
    assert.deepEqual(Object.keys(configError).sort(), ["category", "code", "name", "retryable"].sort());
});

test("createFirebaseClient preserves SDK import failures before anonymous auth", async () => {
    await assert.rejects(
        createFirebaseClient(baseConfig, {
            sdkImporter: async () => {
                throw new TypeError("Failed to fetch dynamically imported module");
            }
        }),
        (error) => {
            assert.ok(error instanceof FirebaseInitializationError);
            assert.equal(error.category, FIREBASE_INIT_ERROR_CATEGORIES.SDK_NETWORK);
            assert.equal(error.code, "FIREBASE-SDK-NETWORK");
            return true;
        }
    );
});

test("createFirebaseClient preserves anonymous auth failures and logs safe diagnostics only", async () => {
    const logs = [];
    const originalDebug = console.debug;
    console.debug = (...args) => logs.push(args);
    try {
        await assert.rejects(
            createFirebaseClient(baseConfig, {
                sdkImporter: makeSdkImporter({
                    signInAnonymously: async () => {
                        throw { code: "auth/operation-not-allowed", message: "raw disabled detail", refreshToken: "secret" };
                    }
                })
            }),
            (error) => {
                assert.ok(error instanceof AuthInitializationError);
                assert.equal(error.category, AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED);
                assert.equal(error.code, "AUTH-DISABLED");
                assert.equal(error.retryable, false);
                assert.equal(error.message, "ورود مهمان موقتاً در دسترس نیست. لطفاً کمی بعد دوباره امتحان کنید.");
                return true;
            }
        );
    } finally {
        console.debug = originalDebug;
    }
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0][1], {
        category: AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED,
        firebaseCode: "auth/operation-not-allowed",
        online: null
    });
});

test("Firebase public endpoint probe reports reachability without account creation or API keys", async () => {
    const requested = [];
    const result = await probeFirebasePublicEndpoints({
        timeoutMs: 10,
        fetchFn: async (url) => {
            requested.push(String(url));
            return { ok: !String(url).includes("identitytoolkit"), status: String(url).includes("identitytoolkit") ? 503 : 200 };
        }
    });
    assert.equal(result.gstatic.reachable, true);
    assert.equal(result.identityToolkit.reachable, false);
    assert.ok(requested.every((url) => !url.includes("key=")));
    assert.ok(requested.some((url) => url.includes("www.gstatic.com")));
    assert.ok(requested.some((url) => url.includes("identitytoolkit.googleapis.com")));
});

function makeSdkImporter({ signInAnonymously }) {
    const app = { name: "[DEFAULT]" };
    return async (url) => {
        if (url.includes("firebase-app.js")) {
            return {
                getApps: () => [],
                getApp: () => app,
                initializeApp: () => app
            };
        }
        if (url.includes("firebase-auth.js")) {
            return {
                getAuth: () => ({ currentUser: null }),
                signInAnonymously,
                connectAuthEmulator: () => {}
            };
        }
        if (url.includes("firebase-database.js")) {
            return {
                getDatabase: () => ({}),
                connectDatabaseEmulator: () => {},
                serverTimestamp: () => ({}),
                increment: () => ({})
            };
        }
        throw new Error(`unexpected sdk url: ${url}`);
    };
}
