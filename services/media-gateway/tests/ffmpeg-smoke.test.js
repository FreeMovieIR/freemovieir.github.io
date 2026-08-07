import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { buildFfmpegArgs, chooseConversionPolicy } from "../src/ffmpeg-policy.js";

test("synthetic local clip converts to HLS with the gateway FFmpeg policy", { timeout: 45_000 }, async (t) => {
    if (!ffmpegPath) {
        t.skip("ffmpeg-static did not provide a binary for this platform.");
        return;
    }
    const dir = await mkdtemp(path.join(tmpdir(), "freemovieir-gateway-"));
    try {
        const source = path.join(dir, "source.mkv");
        const manifest = path.join(dir, "stream.m3u8");
        await run(ffmpegPath, [
            "-hide_banner",
            "-y",
            "-f", "lavfi",
            "-i", "testsrc2=size=160x90:rate=15",
            "-f", "lavfi",
            "-i", "sine=frequency=880:sample_rate=44100",
            "-t", "2",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-shortest",
            source
        ]);
        const policy = chooseConversionPolicy({ container: "matroska", videoCodec: "vp9", audioCodec: "opus" });
        await run(ffmpegPath, buildFfmpegArgs({ sourceUrl: source, outputManifest: manifest, policy }));
        const playlist = await readFile(manifest, "utf8");
        assert.match(playlist, /^#EXTM3U/m);
        assert.match(playlist, /#EXT-X-PLAYLIST-TYPE:VOD/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 4000) stderr = stderr.slice(-4000);
        });
        child.once("error", reject);
        child.once("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with ${code}: ${stderr}`));
        });
    });
}
