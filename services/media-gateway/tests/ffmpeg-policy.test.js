import test from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs, buildFfprobeArgs, chooseConversionPolicy, isIosSafeH264Probe } from "../src/ffmpeg-policy.js";

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

test("H.264 with incompatible audio copies video and transcodes audio only", () => {
    const policy = chooseConversionPolicy({ container: "matroska", videoCodec: "h264", audioCodec: "ac3" });
    assert.equal(policy.mode, "transcode-audio");
    assert.equal(policy.videoCodec, "copy");
    assert.equal(policy.audioCodec, "aac");
    const args = buildFfmpegArgs({
        sourceUrl: "https://example.com/movie.mkv",
        outputManifest: "out/index.m3u8",
        policy
    });
    assert.deepEqual(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2), ["-c:v", "copy"]);
    assert.deepEqual(args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 2), ["-c:a", "aac"]);
});

test("iOS safe H.264 High yuv420p with AAC remuxes without video transcode", () => {
    const policy = chooseConversionPolicy(safeH264Probe({ audioCodec: "aac" }), iosTarget());
    assert.equal(policy.mode, "remux");
    assert.equal(policy.videoCodec, "copy");
    assert.equal(policy.audioCodec, "copy");
});

test("iOS safe H.264 Main yuv420p with non-AAC transcodes audio only", () => {
    const policy = chooseConversionPolicy(safeH264Probe({ videoProfile: "Main", audioCodec: "ac3" }), iosTarget());
    assert.equal(policy.mode, "transcode-audio");
    assert.equal(policy.videoCodec, "copy");
    assert.equal(policy.audioCodec, "aac");
});

test("iOS H.264 High 10 yuv420p10le with AAC transcodes video", () => {
    const probe = safeH264Probe({
        videoProfile: "High 10",
        pixelFormat: "yuv420p10le",
        bitDepth: 10,
        bitsPerRawSample: 10,
        audioCodec: "aac"
    });
    assert.equal(isIosSafeH264Probe(probe), false);
    const policy = chooseConversionPolicy(probe, iosTarget());
    assert.equal(policy.mode, "transcode-video");
    assert.equal(policy.videoCodec, "libx264");
    assert.equal(policy.audioCodec, "copy");
});

test("iOS H.264 High 10 with incompatible audio transcodes video and audio", () => {
    const policy = chooseConversionPolicy(safeH264Probe({
        videoProfile: "High 10",
        pixelFormat: "yuv420p10le",
        bitDepth: 10,
        audioCodec: "dts"
    }), iosTarget());
    assert.equal(policy.mode, "transcode");
    assert.equal(policy.videoCodec, "libx264");
    assert.equal(policy.audioCodec, "aac");
});

test("iOS H.264 with unknown profile or pixel format conservatively transcodes video", () => {
    const missingProfile = chooseConversionPolicy(safeH264Probe({ videoProfile: "", audioCodec: "aac" }), iosTarget());
    assert.equal(missingProfile.mode, "transcode-video");
    const missingPixelFormat = chooseConversionPolicy(safeH264Probe({ pixelFormat: "", audioCodec: "aac" }), iosTarget());
    assert.equal(missingPixelFormat.mode, "transcode-video");
});

test("iOS yuv422p and yuv444p H.264 transcode video", () => {
    for (const pixelFormat of ["yuv422p", "yuv444p"]) {
        const policy = chooseConversionPolicy(safeH264Probe({ pixelFormat, audioCodec: "aac" }), iosTarget());
        assert.equal(policy.mode, "transcode-video", pixelFormat);
        assert.equal(policy.videoCodec, "libx264", pixelFormat);
    }
});

test("desktop H.264/AAC behavior remains current", () => {
    const policy = chooseConversionPolicy(safeH264Probe({
        videoProfile: "High 10",
        pixelFormat: "yuv420p10le",
        audioCodec: "aac"
    }), { profile: "desktop", browserFamily: "safari" });
    assert.equal(policy.mode, "remux");
    assert.equal(policy.videoCodec, "copy");
    assert.equal(policy.audioCodec, "copy");
});

test("video-only H.264 MKV keeps optional audio mapping valid", () => {
    const policy = chooseConversionPolicy({ container: "matroska,webm", videoCodec: "h264", audioCodec: "" });
    assert.equal(policy.mode, "transcode-audio");
    assert.equal(policy.videoCodec, "copy");
    assert.equal(policy.audioCodec, "aac");
    const args = buildFfmpegArgs({
        sourceUrl: "https://example.com/video-only.mkv",
        outputManifest: "out/index.m3u8",
        policy
    });
    assert.deepEqual(args.slice(args.indexOf("-map"), args.indexOf("-map") + 4), ["-map", "0:v:0", "-map", "0:a:0?"]);
    assert.equal(args.includes("0:a:0"), false);
});

test("compatible audio with incompatible video can copy audio", () => {
    const policy = chooseConversionPolicy({ container: "matroska", videoCodec: "vp9", audioCodec: "aac" });
    assert.equal(policy.mode, "transcode-video");
    assert.equal(policy.videoCodec, "libx264");
    assert.equal(policy.audioCodec, "copy");
});

test("FFmpeg command uses argument arrays and HLS output", () => {
    const outputManifest = "C:/tmp/media-gateway-job/index.m3u8";
    const args = buildFfmpegArgs({
        sourceUrl: "https://example.com/movie.mkv",
        outputManifest,
        policy: chooseConversionPolicy({ container: "matroska", videoCodec: "vp9", audioCodec: "opus" })
    });
    assert.ok(Array.isArray(args));
    assert.ok(args.includes("-f"));
    assert.ok(args.includes("hls"));
    const initName = args[args.indexOf("-hls_fmp4_init_filename") + 1];
    assert.equal(initName, "init.mp4");
    assert.equal(/^(?:[A-Za-z]:)?[\\/]/.test(initName), false);
    assert.equal(initName.includes("media-gateway-job"), false);
    assert.equal(args.at(-1), outputManifest);
});

test("ffprobe omits ffmpeg-only stdin flag while ffmpeg keeps it", () => {
    const ffprobeArgs = buildFfprobeArgs("https://example.com/movie.mkv");
    const ffmpegArgs = buildFfmpegArgs({
        sourceUrl: "https://example.com/movie.mkv",
        outputManifest: "out/index.m3u8",
        policy: chooseConversionPolicy({ container: "matroska", videoCodec: "h264", audioCodec: "aac" })
    });
    assert.equal(ffprobeArgs.includes("-nostdin"), false);
    assert.equal(ffmpegArgs.includes("-nostdin"), true);
});

function iosTarget() {
    return {
        profile: "mobile",
        browserFamily: "safari",
        nativeHls: true,
        supportsHevc: false
    };
}

function safeH264Probe(patch = {}) {
    return {
        container: "matroska,webm",
        videoCodec: "h264",
        videoProfile: "High",
        pixelFormat: "yuv420p",
        bitDepth: 8,
        bitsPerRawSample: 8,
        audioCodec: "aac",
        ...patch
    };
}
