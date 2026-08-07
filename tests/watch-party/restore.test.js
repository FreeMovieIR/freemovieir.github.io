import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_STATES, getVisibleScreenForState } from "../../watch-party/js/ui-state.js";
import {
    LEGACY_ROOM_SESSION_KEY,
    RESTORE_MARKER_KEY,
    ROOM_SESSION_KEY,
    ROOM_SESSION_VERSION,
    clearStoredRoomSession,
    hasAnyStoredRoomSession,
    makeRoomSession,
    readStoredRoomSession,
    saveRoomSession,
    validateRoomSession
} from "../../watch-party/js/session-storage.js";
import {
    RESTORE_FAILURES,
    RestoreCoordinator,
    RestoreError,
    canRetryRestoreFailure,
    classifyRestoreFailure,
    getRestoreFailureMessage
} from "../../watch-party/js/restore-controller.js";

function memoryStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: (key) => map.has(key) ? map.get(key) : null,
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
        has: (key) => map.has(key),
        value: (key) => map.get(key)
    };
}

test("stored room session validation accepts only current schema, room, role, uid, and age", () => {
    const now = 10_000;
    const session = makeRoomSession({ roomCode: "ABCD EFGH", role: "guest", uid: "uid-1", savedAt: now });
    assert.equal(validateRoomSession(session, { uid: "uid-1", now, maxAgeMs: 1000 }).ok, true);
    assert.equal(validateRoomSession({ ...session, version: 999 }, { now }).reason, "version");
    assert.equal(validateRoomSession({ ...session, roomCode: "OOOOOOOO" }, { now }).reason, "room-code");
    assert.equal(validateRoomSession({ ...session, uid: "uid-2" }, { uid: "uid-1", now }).reason, "uid-mismatch");
    assert.equal(validateRoomSession({ ...session, savedAt: 1 }, { now, maxAgeMs: 1000 }).reason, "expired");
    assert.equal(validateRoomSession("bad", { now }).reason, "malformed");
});

test("room session storage saves, reads, expires, and clears only Watch Party room keys", () => {
    const local = memoryStorage({
        theme: "dark",
        watchPartyDisplayName: "Remembered",
        [LEGACY_ROOM_SESSION_KEY]: JSON.stringify({ roomCode: "ABCDEFGH" })
    });
    const session = saveRoomSession({
        roomCode: "ABCDEFGH",
        role: "host",
        uid: "owner",
        savedAt: 1000
    }, { storage: local });
    assert.equal(session.version, ROOM_SESSION_VERSION);
    assert.equal(hasAnyStoredRoomSession({ storage: local }), true);
    assert.equal(readStoredRoomSession({ storage: local, uid: "owner", now: 1500 }).ok, true);
    assert.equal(local.has(LEGACY_ROOM_SESSION_KEY), false);

    const expired = readStoredRoomSession({ storage: local, uid: "owner", now: 10_000, maxAgeMs: 1000 });
    assert.equal(expired.reason, "expired");

    const sessionStore = memoryStorage({ [RESTORE_MARKER_KEY]: "1", unrelatedSession: "keep" });
    clearStoredRoomSession({ local, session: sessionStore });
    assert.equal(local.has(ROOM_SESSION_KEY), false);
    assert.equal(local.value("theme"), "dark");
    assert.equal(local.value("watchPartyDisplayName"), "Remembered");
    assert.equal(sessionStore.has(RESTORE_MARKER_KEY), false);
    assert.equal(sessionStore.value("unrelatedSession"), "keep");
});

test("restore coordinator times out once, supports manual retry, and cancel invalidates late results", () => {
    const timers = [];
    const cleared = new Set();
    const timedOut = [];
    const coordinator = new RestoreCoordinator({
        timeoutMs: 1000,
        setTimeoutFn: (fn) => {
            timers.push(fn);
            return timers.length - 1;
        },
        clearTimeoutFn: (id) => cleared.add(id),
        onTimeout: (generation) => timedOut.push(generation)
    });

    const first = coordinator.begin();
    assert.equal(coordinator.attemptCount, 1);
    assert.equal(coordinator.active, true);
    timers[0]();
    assert.deepEqual(timedOut, [first]);
    assert.equal(coordinator.attemptCount, 1, "timeout does not auto-retry");

    const second = coordinator.begin();
    assert.equal(coordinator.attemptCount, 2);
    assert.equal(coordinator.isCurrent(first), false);
    assert.equal(coordinator.isCurrent(second), true);
    coordinator.cancel();
    assert.equal(coordinator.isCurrent(second), false);
    assert.equal(coordinator.active, false);
    assert.equal(cleared.has(1), true);
});

test("restore failure classification separates retryable and terminal outcomes", () => {
    assert.equal(classifyRestoreFailure(new RestoreError(RESTORE_FAILURES.PERMISSION_DENIED)), RESTORE_FAILURES.PERMISSION_DENIED);
    assert.equal(canRetryRestoreFailure(RESTORE_FAILURES.NETWORK), true);
    assert.equal(canRetryRestoreFailure(RESTORE_FAILURES.TIMEOUT), true);
    assert.equal(canRetryRestoreFailure(RESTORE_FAILURES.ENDED), false);
    assert.equal(canRetryRestoreFailure(RESTORE_FAILURES.EXPIRED), false);
    assert.match(getRestoreFailureMessage(RESTORE_FAILURES.ACCESS_LOST), /دسترسی/);
});

test("restore states render dedicated screens", () => {
    assert.equal(getVisibleScreenForState(APP_STATES.RESTORING_ROOM), APP_STATES.RESTORING_ROOM);
    assert.equal(getVisibleScreenForState(APP_STATES.RESTORE_FAILED), APP_STATES.RESTORE_FAILED);
});
