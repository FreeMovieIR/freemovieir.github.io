import assert from "node:assert/strict";
import { test } from "node:test";
import {
    clampChatMessage,
    generateRoomCode,
    isAllowedMediaUrl,
    isAllowedReaction,
    isSupportedDirectMediaUrl,
    isValidRoomCode,
    normalizeRoomCode,
    sanitizeDisplayName,
    validateChatMessage
} from "../../watch-party/js/utils.js";

test("room codes are secure-format eight-character uppercase codes", () => {
    assert.match(generateRoomCode.toString(), /crypto\.getRandomValues/);
    const code = generateRoomCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[A-Z2-9]+$/);
    assert.doesNotMatch(code, /[0O1I]/);
});

test("room code normalization and validation are strict", () => {
    assert.equal(normalizeRoomCode("ab cd-ef!gh"), "ABCDEFGH");
    assert.equal(normalizeRoomCode("O01Iabcd"), "ABCD");
    assert.equal(isValidRoomCode("ABCDEFGH"), true);
    assert.equal(isValidRoomCode("ABCDEFGO"), false);
    assert.equal(isValidRoomCode("ABCDEF1H"), false);
    assert.equal(isValidRoomCode("ABC"), false);
});

test("media URL validation accepts HTTPS and local HTTP only", () => {
    const canPlay = (type) => type.startsWith("video/mp4") || type.startsWith("video/webm") ? "probably" : "";
    assert.equal(isSupportedDirectMediaUrl("https://example.com/a.mp4", "freemovieir.github.io", canPlay), true);
    assert.equal(isSupportedDirectMediaUrl("https://example.com/a.webm", "freemovieir.github.io", canPlay), true);
    assert.equal(isSupportedDirectMediaUrl("https://example.com/a.m3u8", "freemovieir.github.io", canPlay), true);
    assert.equal(isAllowedMediaUrl("http://127.0.0.1:8080/test-assets/sample.mp4", "127.0.0.1"), true);
    assert.equal(isAllowedMediaUrl("http://localhost:8080/test-assets/sample.mp4", "localhost"), true);
    assert.equal(isAllowedMediaUrl("http://example.com/a.mp4", "freemovieir.github.io"), false);
    assert.equal(isAllowedMediaUrl("not a url", "localhost"), false);
    assert.equal(isSupportedDirectMediaUrl("https://example.com/a.mkv", "freemovieir.github.io", () => "probably"), false);
});

test("chat and display-name safety helpers constrain untrusted input", () => {
    const payload = '<img src=x onerror=alert("xss")>';
    assert.equal(sanitizeDisplayName(`${payload}${"x".repeat(80)}`).length, 32);
    assert.equal(validateChatMessage(payload, 500), true);
    assert.equal(validateChatMessage("x".repeat(501), 500), false);
    assert.equal(clampChatMessage(`  ${payload}  `, 500), payload);
    assert.equal(isAllowedReaction("❤️"), true);
    assert.equal(isAllowedReaction("<script>alert(1)</script>"), false);
});
