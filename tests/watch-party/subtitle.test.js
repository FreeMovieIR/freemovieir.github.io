import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSubtitleToVtt, SubtitleController } from "../../watch-party/js/subtitle-controller.js";
import { MESSAGES } from "../../watch-party/js/utils.js";

test("valid SRT converts to normalized WebVTT", () => {
    const vtt = normalizeSubtitleToVtt("\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\nسلام\r\n", "sample.srt");
    assert.match(vtt, /^WEBVTT\n\n/);
    assert.equal(vtt.includes("00:00:01.000 --> 00:00:02.500"), true);
    assert.equal(vtt.includes("\r"), false);
    assert.equal(vtt.includes("\uFEFF"), false);
});

test("existing valid VTT remains valid", () => {
    const input = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nسلام";
    assert.equal(normalizeSubtitleToVtt(input, "sample.vtt"), input);
});

test("invalid subtitle data is rejected", () => {
    assert.throws(() => normalizeSubtitleToVtt("hello", "bad.txt"), /فرمت زیرنویس معتبر نیست/);
});

test("HTML-looking subtitle text stays text inside VTT", () => {
    const payload = '<script>alert("xss")</script>';
    const vtt = normalizeSubtitleToVtt(`1\n00:00:01,000 --> 00:00:02,000\n${payload}`, "sample.srt");
    assert.equal(vtt.includes(payload), true);
});

test("oversized subtitle file is rejected before parsing", async () => {
    const controller = Object.create(SubtitleController.prototype);
    controller.config = { subtitleSizeLimit: 5 };
    const file = { size: 6, text: async () => "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nx", name: "too-big.vtt" };
    await assert.rejects(() => controller.fromFile(file), new RegExp(MESSAGES.subtitleLarge));
});
