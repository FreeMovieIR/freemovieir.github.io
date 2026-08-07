import assert from "node:assert/strict";
import test from "node:test";
import { formatSafeErrorReport, getAuthErrorView } from "../../watch-party/js/user-errors.js";

test("all auth diagnostic codes map to user-friendly Persian primary messages", () => {
    for (const code of [
        "FIREBASE-SDK-NETWORK",
        "FIREBASE-SDK-LOAD",
        "FIREBASE-CONFIG-LOAD",
        "AUTH-NETWORK",
        "AUTH-TIMEOUT",
        "AUTH-DISABLED",
        "AUTH-CONFIG",
        "AUTH-RATE",
        "AUTH-UNKNOWN"
    ]) {
        const view = getAuthErrorView(code, { online: false, buildId: "test-build" });
        assert.equal(view.code, code);
        assert.ok(view.primary.length > 10);
        assert.doesNotMatch(view.primary, /Firebase|Authentication|API key|permission-denied|AUTH-/i);
    }
});

test("network and timeout auth views include Iran/VPN help but config errors do not", () => {
    assert.match(getAuthErrorView("AUTH-NETWORK").secondary, /VPN|ایران/);
    assert.match(getAuthErrorView("AUTH-TIMEOUT").secondary, /VPN|ایران/);
    assert.equal(getAuthErrorView("AUTH-CONFIG").secondary, "");
    assert.equal(getAuthErrorView("AUTH-DISABLED").secondary, "");
});

test("safe auth report contains only allowed diagnostic fields", () => {
    const view = getAuthErrorView("AUTH-NETWORK", {
        buildId: "build-1",
        online: true,
        userAgent: "Mozilla/5.0 Safari/605.1.15 Mobile/15E148",
        endpoints: {
            gstatic: { reachable: true, status: 200, token: "secret" },
            identityToolkit: { reachable: false, status: null, apiKey: "secret" }
        }
    });
    const report = formatSafeErrorReport(view.safeReport);
    assert.match(report, /AUTH-NETWORK/);
    assert.match(report, /mobile-safari/);
    assert.doesNotMatch(report, /secret|apiKey|token|uid|refresh/i);
});
