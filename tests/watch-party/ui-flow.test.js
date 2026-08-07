import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APP_STATES, getVisibleScreenForState } from "../../watch-party/js/ui-state.js";

const html = readFileSync("watch-party/index.html", "utf8");

function section(id) {
    const start = html.indexOf(`<section id="${id}"`);
    assert.notEqual(start, -1, `missing ${id}`);
    const next = html.indexOf("\n        <section id=\"screen-", start + 1);
    const end = next === -1 ? html.indexOf("</main>", start) : next;
    return html.slice(start, end);
}

test("state model maps loading substates to the intended visible screen", () => {
    assert.equal(getVisibleScreenForState(APP_STATES.WELCOME), APP_STATES.WELCOME);
    assert.equal(getVisibleScreenForState(APP_STATES.CREATING_ROOM), APP_STATES.HOST_MEDIA);
    assert.equal(getVisibleScreenForState(APP_STATES.JOINING_ROOM), APP_STATES.GUEST_PROFILE);
    assert.equal(getVisibleScreenForState(APP_STATES.RESTORING_ROOM), APP_STATES.RESTORING_ROOM);
    assert.equal(getVisibleScreenForState(APP_STATES.RESTORE_FAILED), APP_STATES.RESTORE_FAILED);
});

test("initial welcome screen contains only role selection, not room tools", () => {
    const welcome = section("screen-welcome");
    assert.match(welcome, /ساخت اتاق جدید/);
    assert.match(welcome, /ورود به اتاق/);
    assert.doesNotMatch(welcome, /<video/);
    assert.doesNotMatch(welcome, /chat/i);
    assert.doesNotMatch(welcome, /invite-code/);
    assert.doesNotMatch(welcome, /mic-button/);
    assert.doesNotMatch(welcome, /movie-controls/);
});

test("host and guest setup screens are role-specific", () => {
    const hostProfile = section("screen-host-profile");
    const hostMedia = section("screen-host-media");
    const guestCode = section("screen-guest-code");
    const guestProfile = section("screen-guest-profile");
    assert.doesNotMatch(hostProfile + hostMedia, /guest-room-code/);
    assert.match(hostMedia, /host-video-url/);
    assert.doesNotMatch(guestCode + guestProfile, /host-video-url|host-subtitle-file/);
    assert.match(guestCode, /guest-room-code/);
});

test("lobby and active room are separate screens", () => {
    const lobby = section("screen-lobby");
    const active = section("screen-active-room");
    assert.doesNotMatch(lobby, /<video/);
    assert.match(lobby, /آماده‌ام/);
    assert.match(active, /<video/);
    assert.match(active, /data-tab="chat"/);
    assert.match(active, /id="movie-controls"/);
    assert.match(active, /id="player-mic-button"/);
    assert.match(active, /id="control-audio-track"/);
    assert.match(active, /id="control-voice-volume"/);
});

test("restore screens expose retry and cancel without room controls", () => {
    const restoring = section("screen-restoring-room");
    const failed = section("screen-restore-failed");
    assert.match(restoring, /در حال بازیابی اتاق/);
    assert.match(restoring, /restore-cancel/);
    assert.match(restoring, /restore-retry/);
    assert.match(failed, /restore-retry-failed/);
    assert.match(failed, /restore-cancel-failed/);
    assert.doesNotMatch(restoring + failed, /party-video|chat-input|mic-button|invite-code|movie-controls/);
});
