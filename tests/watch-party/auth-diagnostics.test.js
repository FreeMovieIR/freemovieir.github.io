import assert from "node:assert/strict";
import { test } from "node:test";
import {
    AuthInitializationError,
    AuthTimeoutError,
    AUTH_ERROR_CATEGORIES,
    classifyAuthError,
    getAuthDiagnosticCode,
    getAuthUserMessage,
    getSafeFirebaseCode,
    probeFirebaseAuthEndpoints,
    resolveAuthRetryTarget,
    toAuthInitializationError
} from "../../watch-party/js/auth-diagnostics.js";

test("anonymous auth failures are classified into safe diagnostic categories", () => {
    const cases = [
        [{ code: "auth/network-request-failed" }, AUTH_ERROR_CATEGORIES.NETWORK, "AUTH-NETWORK"],
        [{ code: "auth/operation-not-allowed" }, AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED, "AUTH-DISABLED"],
        [{ code: "auth/invalid-api-key" }, AUTH_ERROR_CATEGORIES.INVALID_CONFIG, "AUTH-CONFIG"],
        [{ code: "auth/app-not-authorized" }, AUTH_ERROR_CATEGORIES.INVALID_CONFIG, "AUTH-CONFIG"],
        [{ code: "auth/too-many-requests" }, AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS, "AUTH-RATE"],
        [new AuthTimeoutError(), AUTH_ERROR_CATEGORIES.TIMEOUT, "AUTH-TIMEOUT"],
        [{ code: "auth/not-covered", message: "unexpected" }, AUTH_ERROR_CATEGORIES.UNKNOWN, "AUTH-UNKNOWN"]
    ];

    for (const [error, category, diagnosticCode] of cases) {
        assert.equal(classifyAuthError(error), category);
        assert.equal(getAuthDiagnosticCode(error), diagnosticCode);
        assert.equal(typeof getAuthUserMessage(error), "string");
        assert.ok(getAuthUserMessage(error).length > 0);
    }
});

test("AuthInitializationError exposes only safe enumerable diagnostics", () => {
    const original = {
        code: "auth/network-request-failed",
        message: "Firebase: Error with key secret-token",
        stack: "stack should not be enumerable"
    };
    const error = toAuthInitializationError(original);
    assert.ok(error instanceof AuthInitializationError);
    assert.deepEqual(JSON.parse(JSON.stringify(error)), {
        code: "AUTH-NETWORK",
        category: AUTH_ERROR_CATEGORIES.NETWORK,
        retryable: true
    });
    assert.equal(error.cause, original);
    assert.equal(Object.keys(error).includes("cause"), false);
    assert.equal(getSafeFirebaseCode(error), "auth/network-request-failed");
});

test("invalid config and disabled anonymous auth are not retryable, transient categories are retryable", () => {
    assert.equal(toAuthInitializationError({ code: "auth/operation-not-allowed" }).retryable, false);
    assert.equal(toAuthInitializationError({ code: "auth/invalid-api-key" }).retryable, false);
    assert.equal(toAuthInitializationError({ code: "auth/app-not-authorized" }).retryable, false);
    assert.equal(toAuthInitializationError({ code: "auth/network-request-failed" }).retryable, true);
    assert.equal(toAuthInitializationError(new AuthTimeoutError()).retryable, true);
    assert.equal(toAuthInitializationError({ code: "auth/too-many-requests" }).retryable, true);
});

test("auth retry target preserves role and current form state", () => {
    assert.equal(resolveAuthRetryTarget({ role: "host", action: "role" }), "host-profile");
    assert.equal(resolveAuthRetryTarget({ role: "guest", action: "role" }), "guest-code");
    assert.equal(resolveAuthRetryTarget({ role: "host", action: "create" }), "host-media");
    assert.equal(resolveAuthRetryTarget({ role: "guest", action: "join" }), "guest-profile");
    assert.equal(resolveAuthRetryTarget({ role: null, action: null }), "welcome");
});

test("connectivity probe checks public Firebase endpoints without API keys", async () => {
    const urls = [];
    const result = await probeFirebaseAuthEndpoints({
        timeoutMs: 50,
        fetchFn: async (url, options) => {
            urls.push({ url, options });
            return { ok: true };
        }
    });
    assert.equal(result.gstatic.reachable, true);
    assert.equal(result.identityToolkit.reachable, true);
    assert.equal(urls.length, 2);
    assert.ok(urls.some((entry) => entry.url === "https://www.gstatic.com/generate_204"));
    assert.ok(urls.some((entry) => entry.url === "https://identitytoolkit.googleapis.com/$discovery/rest?version=v1"));
    assert.equal(urls.some((entry) => /key=|apiKey/i.test(entry.url)), false);
    assert.equal(urls.every((entry) => entry.options.credentials === "omit"), true);
});

test("connectivity probe reports endpoint unreachable without claiming a cause", async () => {
    const result = await probeFirebaseAuthEndpoints({
        fetchFn: async () => {
            throw new TypeError("Failed to fetch");
        }
    });
    assert.equal(result.gstatic.reachable, false);
    assert.equal(result.gstatic.reason, "unreachable");
    assert.equal(result.identityToolkit.reachable, false);
    assert.equal(result.identityToolkit.reason, "unreachable");
});
