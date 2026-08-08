import assert from "node:assert/strict";
import { test } from "node:test";
import { getPublicRoomCapabilities } from "../../watch-party/public/js/public-room-capabilities.js";
import { normalizePublicRoomError, PUBLIC_ROOM_ERROR_CODES } from "../../watch-party/public/js/public-room-errors.js";
import { expectedPublicPlaybackTime, makeInitialPublicPlayback, nextPublicPlaybackState } from "../../watch-party/public/js/public-room-media-sync.js";
import {
    PUBLIC_ALLOWED_REACTIONS,
    PUBLIC_SLOW_MODE_VALUES,
    normalizePublicRoomId,
    generatePublicRoomId,
    isValidPublicRoomId,
    clampPublicCapacity,
    isPublicRoomJoinable,
    sanitizePublicMessage,
    formatSlowModeLabel
} from "../../watch-party/public/js/public-room-state.js";
import { NoopPublicVoiceProvider } from "../../watch-party/public/js/voice/noop-public-voice-provider.js";
import { PUBLIC_VOICE_STATES } from "../../watch-party/public/js/voice/public-voice-types.js";

test("public room IDs are dedicated 12-character unambiguous identifiers", () => {
    const bytes = Array.from({ length: 12 }, (_, index) => index);
    const id = generatePublicRoomId({ getRandomValues: (target) => target.set(bytes) });
    assert.equal(id.length, 12);
    assert.match(id, /^[A-HJ-NP-Z2-9]{12}$/);
    assert.equal(isValidPublicRoomId(id), true);
    assert.equal(normalizePublicRoomId(" abcd-efgh ijkl "), "ABCDEFGHJKL");
    assert.equal(isValidPublicRoomId("ABCDEFGO1234"), false);
});

test("public capacity and directory joinability are bounded", () => {
    assert.equal(clampPublicCapacity(9), 7);
    assert.equal(clampPublicCapacity(1), 2);
    assert.equal(isPublicRoomJoinable({ status: "open", joinable: true, memberCount: 6, capacity: 7 }), true);
    assert.equal(isPublicRoomJoinable({ status: "open", joinable: true, memberCount: 7, capacity: 7 }), false);
    assert.equal(isPublicRoomJoinable({ status: "locked", joinable: false, memberCount: 2, capacity: 7 }), false);
});

test("public room capabilities keep host and guest permissions explicit", () => {
    const host = getPublicRoomCapabilities({ role: "host", settings: { chatEnabled: false, reactionsEnabled: false } });
    assert.equal(host.canControlPlayback, true);
    assert.equal(host.canChangeMedia, true);
    assert.equal(host.canLockRoom, true);
    assert.equal(host.canKickMembers, true);
    assert.equal(host.canEndRoom, true);
    assert.equal(host.canManageSocial, true);
    assert.equal(host.canSpeak, false);
    assert.equal(host.canMuteMember, false);

    const guest = getPublicRoomCapabilities({ role: "guest", settings: { chatEnabled: false, reactionsEnabled: false } });
    assert.equal(guest.canControlPlayback, false);
    assert.equal(guest.canChangeMedia, false);
    assert.equal(guest.canKickMembers, false);
    assert.equal(guest.canEndRoom, false);
    assert.equal(guest.canManageSocial, false);
    assert.equal(guest.canLeaveRoom, true);
    assert.equal(guest.canSpeak, false);
});

test("public social helpers expose controlled reactions, slow-mode values, and plain text messages", () => {
    assert.deepEqual(PUBLIC_SLOW_MODE_VALUES, [0, 3000, 5000, 10000, 30000]);
    assert.deepEqual(PUBLIC_ALLOWED_REACTIONS, ["❤️", "😂", "😱", "😢", "🍿", "👏", "🔥"]);
    assert.equal(formatSlowModeLabel(0), "خاموش");
    assert.equal(formatSlowModeLabel(5000), "۵ ثانیه");
    assert.equal(sanitizePublicMessage("  <img src=x onerror=alert(1)>\r\n  "), "<img src=x onerror=alert(1)>");
    assert.equal(sanitizePublicMessage("x".repeat(700)).length, 500);
});

test("public playback state remains host-authoritative and revisioned", () => {
    const initial = makeInitialPublicPlayback("host", 1000);
    const next = nextPublicPlaybackState(initial, { paused: false, currentTime: 10, playbackRate: 1.5, action: "play" }, "host", 2000);
    assert.equal(next.revision, 2);
    assert.equal(next.updatedBy, "host");
    assert.equal(expectedPublicPlaybackTime(next, 4000), 13);
});

test("public room errors normalize emulator permission variants", () => {
    assert.equal(normalizePublicRoomError({ code: "PERMISSION_DENIED" }).code, PUBLIC_ROOM_ERROR_CODES.NOT_AUTHORIZED);
    assert.equal(normalizePublicRoomError({ code: "permission-denied" }).code, PUBLIC_ROOM_ERROR_CODES.NOT_AUTHORIZED);
    assert.equal(normalizePublicRoomError({ details: { code: "PUBLIC-CHAT-SLOW-MODE" } }).code, PUBLIC_ROOM_ERROR_CODES.CHAT_SLOW_MODE);
    assert.equal(normalizePublicRoomError({ details: { code: "PUBLIC-REACTION-RATE-LIMIT" } }).code, PUBLIC_ROOM_ERROR_CODES.REACTION_RATE_LIMIT);
    assert.equal(normalizePublicRoomError({ details: { code: "PUBLIC-REACTIONS-DISABLED" } }).code, PUBLIC_ROOM_ERROR_CODES.REACTIONS_DISABLED);
    assert.equal(normalizePublicRoomError({ code: "PUBLIC-ROOM-TIMEOUT" }).code, PUBLIC_ROOM_ERROR_CODES.TIMEOUT);
    assert.equal(normalizePublicRoomError({ details: { code: "PUBLIC-ROOM-RATE-LIMIT" } }).code, PUBLIC_ROOM_ERROR_CODES.RATE_LIMIT);
    assert.equal(normalizePublicRoomError({ code: "functions/internal", message: "PERMISSION_DENIED /publicRooms/secret" }).code, PUBLIC_ROOM_ERROR_CODES.UNKNOWN);
});

test("public voice scaffold is disabled and touches no browser media or network APIs", async () => {
    const originalMediaDevices = globalThis.navigator?.mediaDevices;
    const originalPeer = globalThis.RTCPeerConnection;
    const originalFetch = globalThis.fetch;
    let mediaTouched = false;
    let peerTouched = false;
    let fetchTouched = false;
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { mediaDevices: { getUserMedia: () => { mediaTouched = true; } } }
    });
    globalThis.RTCPeerConnection = function FakePeer() { peerTouched = true; };
    globalThis.fetch = () => {
        fetchTouched = true;
        return Promise.reject(new Error("unexpected-fetch"));
    };
    try {
        const voice = new NoopPublicVoiceProvider();
        assert.equal((await voice.initialize()).state, PUBLIC_VOICE_STATES.DISABLED);
        assert.equal((await voice.join()).state, PUBLIC_VOICE_STATES.DISABLED);
        assert.equal((await voice.enableMicrophone()).state, PUBLIC_VOICE_STATES.DISABLED);
        assert.equal((await voice.destroy()).state, PUBLIC_VOICE_STATES.DISABLED);
        assert.equal(mediaTouched, false);
        assert.equal(peerTouched, false);
        assert.equal(fetchTouched, false);
    } finally {
        Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: originalMediaDevices } });
        globalThis.RTCPeerConnection = originalPeer;
        globalThis.fetch = originalFetch;
    }
});
