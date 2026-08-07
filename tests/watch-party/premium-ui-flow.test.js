import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("watch-party/index.html", "utf8");
const css = readFileSync("watch-party/style.css", "utf8");

test("lobby exposes premium invite and compatibility preflight elements", () => {
    for (const id of ["invite-qr", "lobby-device-state", "lobby-fullscreen-state", "lobby-playback-mode", "mic-level-bar"]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
});

test("active player supports Cinema Mode fallback styling", () => {
    assert.match(css, /\.video-shell\.cinema-mode-active/);
    assert.match(css, /env\(safe-area-inset-top\)/);
    assert.match(css, /\.cinema-exit-button/);
});

test("remote audio element is inline/autoplay capable for mobile Safari", () => {
    assert.match(html, /<audio id="remote-audio" autoplay playsinline><\/audio>/);
});
