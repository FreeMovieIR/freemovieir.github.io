import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import ffmpegStaticPath from "ffmpeg-static";
import { buildFfmpegArgs } from "../src/ffmpeg-policy.js";
import { MemoryObjectStore } from "../src/v2/stores/memory-object-store.js";
import { uploadHlsOutput } from "../src/v2/worker.js";

const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStaticPath || "ffmpeg";

test("real FFmpeg fMP4 HLS output can be uploaded incrementally and bounded locally", { timeout: 120_000 }, async (t) => {
    await assertFfmpegAvailable();
    const workspace = mkdtempSync(join(tmpdir(), "media-gateway-real-ffmpeg-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));
    const sourcePath = join(workspace, "source.mkv");
    const hlsDir = join(workspace, "hls");
    const outputManifest = join(hlsDir, "index.m3u8");
    await mkdir(hlsDir, { recursive: true });

    await run(ffmpegPath, [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc2=size=1280x720:rate=24:duration=24",
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=24",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        sourcePath
    ], 90_000);

    const objectStore = new MemoryObjectStore();
    const uploaded = new Map();
    let observedFinalizedDuringRun = false;
    let maxLocalMediaSegments = 0;
    const child = spawn(ffmpegPath, buildFfmpegArgs({
        sourceUrl: sourcePath,
        outputManifest,
        policy: {
            mode: "transcode-video",
            videoCodec: "libx264",
            audioCodec: "copy",
            output: "hls-fmp4"
        }
    }), { shell: false, windowsHide: true, cwd: hlsDir });

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const poller = setInterval(() => {
        uploadHlsOutput({ objectStore, workspace: hlsDir, outputPrefix: "jobs/real/", uploaded })
            .then(async (result) => {
                observedFinalizedDuringRun ||= result.mediaUploaded > 0;
                const files = await readdir(hlsDir).catch(() => []);
                maxLocalMediaSegments = Math.max(maxLocalMediaSegments, files.filter((file) => /\.(m4s|ts)$/i.test(file)).length);
            })
            .catch(() => {});
    }, 100);

    const exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
    });
    clearInterval(poller);
    await uploadHlsOutput({ objectStore, workspace: hlsDir, outputPrefix: "jobs/real/", uploaded });

    assert.equal(exitCode, 0, stderr.slice(-1000));
    assert.equal(observedFinalizedDuringRun, true);
    assert.equal(maxLocalMediaSegments <= 1, true);
    await access(outputManifest);
    await access(join(hlsDir, "init.mp4"));

    const finalLocalFiles = await readdir(hlsDir);
    assert.equal(finalLocalFiles.some((file) => /\.tmp$/i.test(file) || /\.tmp\./i.test(file)), false);
    assert.equal(finalLocalFiles.some((file) => /\.(m4s|ts)$/i.test(file)), false);
    const manifest = await objectStore.readText("jobs/real/index.m3u8");
    assert.match(manifest, /^#EXTM3U/m);
    assert.match(manifest, /#EXT-X-ENDLIST/);
    const referencedSegments = manifest
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && /\.(m4s|ts)$/i.test(line));
    assert.equal(referencedSegments.length > 0, true);
    for (const segment of referencedSegments) {
        assert.equal(await objectStore.exists(`jobs/real/${segment}`), true);
    }
});

async function assertFfmpegAvailable() {
    const result = await run(ffmpegPath, ["-version"], 10_000);
    assert.match(result.stdout, /ffmpeg version/i);
}

function run(command, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { shell: false, windowsHide: true });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`${command} timed out.`));
        }, timeoutMs);
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.once("error", reject);
        child.once("exit", (code) => {
            clearTimeout(timer);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`${command} failed with code ${code}: ${stderr.slice(-1000)}`));
        });
    });
}
