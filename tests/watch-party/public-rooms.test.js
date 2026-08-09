import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getPublicRoomCapabilities } from "../../watch-party/public/js/public-room-capabilities.js";
import { normalizePublicRoomError, PUBLIC_ROOM_ERROR_CODES } from "../../watch-party/public/js/public-room-errors.js";
import { expectedPublicPlaybackTime, makeInitialPublicPlayback, nextPublicPlaybackState } from "../../watch-party/public/js/public-room-media-sync.js";
import {
    PublicReactionBaseline,
    clampPublicTime,
    getPublicPlayerControlModel,
    shouldIgnorePublicShortcut
} from "../../watch-party/public/js/public-player-controls.js";
import {
    PUBLIC_ALLOWED_REACTIONS,
    PUBLIC_SLOW_MODE_VALUES,
    normalizePublicRoomId,
    generatePublicRoomId,
    isValidPublicRoomId,
    clampPublicCapacity,
    formatMemberOccupancy,
    formatRemainingSeats,
    getPublicMemberInitial,
    getPublicMemberStatusLabel,
    isPublicRoomJoinable,
    sanitizePublicMessage,
    formatSlowModeLabel,
    sortPublicMembers
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

test("public member occupancy copy uses authoritative capacity and RTL-safe Persian text", () => {
    assert.equal(formatMemberOccupancy(1, 2), "۱ از ۲ نفر");
    assert.equal(formatMemberOccupancy(2, 3), "۲ از ۳ نفر");
    assert.equal(formatMemberOccupancy(7, 7), "۷ از ۷ نفر");
    assert.equal(formatMemberOccupancy(9, 3), "۳ از ۳ نفر");
    assert.equal(formatRemainingSeats(1, 3), "۲ جای خالی");
    assert.equal(formatRemainingSeats(2, 3), "۱ جای خالی");
    assert.equal(formatRemainingSeats(3, 3), "اتاق تکمیل است");
});

test("public active room member panel does not hardcode the seven-person maximum", () => {
    const html = readFileSync(new URL("../../watch-party/public/index.html", import.meta.url), "utf8");
    const panelStart = html.indexOf('id="social-members-panel"');
    const panelEnd = html.indexOf('id="social-room-panel"', panelStart);
    const membersPanel = html.slice(panelStart, panelEnd);
    assert.equal(membersPanel.includes("تا هفت نفر"), false);
    assert.equal(membersPanel.includes("member-panel-occupancy"), true);
    assert.equal(membersPanel.includes("member-panel-remaining"), true);
});

test("public member helpers sort host first and distinguish reconnecting state", () => {
    const sorted = sortPublicMembers([
        { uid: "guest-reconnect", role: "guest", displayName: "Guest B", online: false, joinedAt: 2 },
        { uid: "guest-online", role: "guest", displayName: "Guest A", online: true, joinedAt: 3 },
        { uid: "host", role: "host", displayName: "آرش", online: true, joinedAt: 5 }
    ], "host");
    assert.deepEqual(sorted.map((member) => member.uid), ["host", "guest-online", "guest-reconnect"]);
    assert.equal(getPublicMemberInitial(" آرش "), "آ");
    assert.equal(getPublicMemberStatusLabel({ online: true }), "آنلاین");
    assert.equal(getPublicMemberStatusLabel({ online: false }), "در حال اتصال مجدد");
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

test("public custom controls separate shared host authority from local guest controls", () => {
    const host = getPublicPlayerControlModel({ role: "host", playback: { paused: true }, duration: 120 });
    assert.equal(host.canUseSharedPlayback, true);
    assert.equal(host.showPlayPause, true);
    assert.equal(host.showSeek, true);
    assert.equal(host.showSkip, true);
    assert.equal(host.showPlaybackRate, true);
    assert.equal(host.showLocalFullscreen, true);
    assert.equal(host.showLocalVolume, true);

    const guest = getPublicPlayerControlModel({ role: "guest", playback: { paused: false }, duration: 120 });
    assert.equal(guest.canUseSharedPlayback, false);
    assert.equal(guest.showPlayPause, false);
    assert.equal(guest.showSeek, false);
    assert.equal(guest.showSkip, false);
    assert.equal(guest.showPlaybackRate, false);
    assert.equal(guest.showReadOnlyProgress, true);
    assert.equal(guest.showLocalFullscreen, true);
    assert.equal(guest.showLocalMute, true);
    assert.equal(clampPublicTime(130, 120), 120);
    assert.equal(clampPublicTime(-5, 120), 0);
    assert.equal(shouldIgnorePublicShortcut({ tagName: "INPUT" }), true);
});

test("public reaction baseline prevents retained reaction replay and animates only future ids", () => {
    const tracker = new PublicReactionBaseline();
    const retained = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
        `old-${index}`,
        { emoji: "🍿", createdAt: index + 1, uid: "guest" }
    ]));
    assert.deepEqual(tracker.collectNew(retained), []);
    assert.deepEqual(tracker.collectNew(retained), []);
    const oneNew = tracker.collectNew({ ...retained, fresh: { emoji: "😂", createdAt: 20, uid: "host" } });
    assert.equal(oneNew.length, 1);
    assert.equal(oneNew[0].id, "fresh");
    assert.deepEqual(tracker.collectNew({ ...retained, fresh: { emoji: "😂", createdAt: 20, uid: "host" } }), []);
    const five = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [
        `new-${index}`,
        { emoji: "❤️", createdAt: 30 + index, uid: "guest" }
    ]));
    assert.equal(tracker.collectNew({ ...retained, fresh: { emoji: "😂", createdAt: 20, uid: "host" }, ...five }).length, 5);
    tracker.reset();
    assert.deepEqual(tracker.collectNew({ ...retained, ...five }), []);
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
