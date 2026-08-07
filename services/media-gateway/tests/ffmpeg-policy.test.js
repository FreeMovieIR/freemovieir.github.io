import test from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs, chooseConversionPolicy } from "../src/ffmpeg-policy.js";

test("H.264/AAC MKV prefers remux", () => {
    const policy = chooseConversionPolicy({ container: "matroska", videoCodec: "h264", audioCodec: "aac" });
    assert.equal(policy.mode, "remux");
    assert.equal(policy.videoCodec, "copy");
    assert.equal(policy.audioCodec, "copy");
});

test("incompatible video or audio transcodes to H.264/AAC", () => {
    const policy = chooseConversionPolicy({ container: "matroska", videoCodec: "vp9", audioCodec: "dts" });
    assert.equal(policy.mode, "transcode");
    assert.equal(policy.videoCodec, "libx264");
    assert.equal(policy.audioCodec, "aac");
    assert.equal(policy.audioChannels, 2);
});

test("FFmpeg command uses argument arrays and HLS output", () => {
    const args = buildFfmpegArgs({
        sourceUrl: "https://example.com/movie.mkv",
        outputManifest: "out/index.m3u8",
        policy: chooseConversionPolicy({ container: "matroska", videoCodec: "vp9", audioCodec: "opus" })
    });
    assert.ok(Array.isArray(args));
    assert.ok(args.includes("-f"));
    assert.ok(args.includes("hls"));
    assert.deepEqual(args.slice(args.indexOf("-hls_fmp4_init_filename"), args.indexOf("-hls_fmp4_init_filename") + 2), ["-hls_fmp4_init_filename", "out/init.mp4"]);
    assert.ok(args.includes("out/index.m3u8"));
});
