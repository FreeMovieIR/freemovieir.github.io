import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { installLocalTestBridge } from "../../watch-party/dev/local-test-bridge.js";

const originalWindow = globalThis.window;
const originalCrypto = globalThis.crypto;

afterEach(() => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
});

test("development bridge exposes local E2E hook, controls, voice options, and diagnostics", async () => {
    const video = { dataset: {} };
    const audioCall = {
        peer: {},
        peerCreateCount: 1,
        generationId: "gen",
        started: true,
        getDiagnostics: async () => ({ candidatePath: "TURN" })
    };
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            __WATCH_PARTY_TEST__: {
                voice: { forceRelay: true },
                restoreTimeoutMs: 900,
                delayRestoreMs: 5000
            }
        }
    });
    Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: { randomUUID: () => "token" }
    });

    const bridge = installLocalTestBridge({
        ui: { state: "lobby", els: { video } },
        getSelectedRole: () => "host",
        getFirebase: () => ({ user: { uid: "uid" } }),
        getRoomService: () => ({ roomCode: "ABCDEFGH", role: "owner", unsubscribeRoom: () => {}, unsubscribeConnected: () => {} }),
        getCurrentRoom: () => ({ status: "open", ownerUid: "uid", guestUid: "guest", participants: { uid: {}, guest: {} } }),
        getMediaController: () => ({ diagnostics: { readyState: 4 } }),
        getAudioCall: () => audioCall,
        getOperationController: () => ({ isActive: (name) => name === "create" }),
        getRestoreCoordinator: () => ({ attemptCount: 2, active: true })
    });

    assert.equal(window.__watchPartyTest.state, "lobby");
    assert.equal(window.__watchPartyTest.selectedRole, "host");
    assert.equal(window.__watchPartyTest.roomCode, "ABCDEFGH");
    assert.equal(window.__watchPartyTest.videoElementToken, "token");
    assert.deepEqual(window.__watchPartyTest.mediaDiagnostics, { readyState: 4 });
    assert.equal(window.__watchPartyTest.voicePeerCount, 1);
    assert.equal(window.__watchPartyTest.operationActive.create, true);
    assert.equal(window.__watchPartyTest.restoreAttemptCount, 2);
    assert.equal((await window.__watchPartyTest.voiceDiagnostics()).candidatePath, "TURN");
    assert.equal(bridge.controls.restoreTimeoutMs, 900);
    assert.equal(bridge.getRestoreTimeoutOverride(), 900);
    assert.deepEqual(bridge.getVoiceOptions(), { forceRelay: true });
});

test("development bridge owns restore failure and delay controls", async () => {
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            __WATCH_PARTY_TEST__: {
                forceRestoreFailure: "network",
                delayRestoreMs: 1
            }
        }
    });
    const bridge = installLocalTestBridge({});

    await assert.rejects(
        () => bridge.beforeRestoreRead((reason) => new Error(reason)),
        /network/
    );

    window.__WATCH_PARTY_TEST__.forceRestoreFailure = "";
    const startedAt = Date.now();
    await bridge.beforeRestoreRead((reason) => new Error(reason));
    assert.ok(Date.now() >= startedAt);
});
