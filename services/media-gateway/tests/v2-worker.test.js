import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { JOB_STAGES, JOB_STATUS, SAFE_ERROR } from "../src/v2/constants.js";
import { makeJobKey, hashSourceUrl, makeProfileHash, normalizeDeviceProfile } from "../src/v2/hash.js";
import { MemoryJobStore } from "../src/v2/stores/memory-job-store.js";
import { MemoryObjectStore } from "../src/v2/stores/memory-object-store.js";
import { cleanupExpiredGatewayJobs, isTemporaryHlsFile, runMediaWorker, uploadHlsOutput } from "../src/v2/worker.js";

test("V2 worker is lease-idempotent and a second simultaneous attempt exits safely", async () => {
    const fixture = await createQueuedJob();
    const firstLease = await fixture.jobStore.acquireLease(fixture.jobKey, "other-worker", 60_000);
    assert.equal(firstLease.acquired, true);
    const result = await runMediaWorker({
        jobKey: fixture.jobKey,
        jobStore: fixture.jobStore,
        objectStore: fixture.objectStore,
        config: fixture.config,
        runProcess: fakeRunProcess,
        workspaceRoot: fixture.workspace
    });
    assert.equal(result.acquired, false);
});

test("V2 worker probes, applies policy, uploads HLS, marks ready, and clears source URL", async () => {
    const fixture = await createQueuedJob();
    const result = await runMediaWorker({
        jobKey: fixture.jobKey,
        jobStore: fixture.jobStore,
        objectStore: fixture.objectStore,
        config: fixture.config,
        runProcess: fakeRunProcess,
        workspaceRoot: fixture.workspace
    });
    assert.equal(result.ready, true);
    const job = await fixture.jobStore.get(fixture.jobKey);
    assert.equal(job.status, JOB_STATUS.READY);
    assert.equal(job.stage, JOB_STAGES.READY);
    assert.equal(job.source.encryptedOrPrivateUrl, null);
    assert.equal(job.conversion.policy.videoCodec, "copy");
    assert.equal(job.conversion.policy.audioCodec, "copy");
    assert.equal(await fixture.objectStore.exists(`jobs/${fixture.jobKey}/index.m3u8`), true);
    assert.equal(await fixture.objectStore.exists(`jobs/${fixture.jobKey}/init.mp4`), true);
});

test("V2 worker uses configured ffprobe and FFmpeg timeouts", async () => {
    const fixture = await createQueuedJob({
        config: {
            limits: {
                leaseTtlMs: 60_000,
                ffprobeTimeoutMs: 1234,
                ffmpegTimeoutMs: 5678
            }
        }
    });
    const calls = [];
    const runProcess = async (command, args, timeoutMs, onProgress, options = {}) => {
        calls.push({
            command,
            timeoutMs,
            cwd: options.cwd || "",
            outputManifest: command === "ffmpeg" ? args.at(-1) : ""
        });
        return fakeRunProcess(command, args, timeoutMs, onProgress);
    };
    const result = await runMediaWorker({
        jobKey: fixture.jobKey,
        jobStore: fixture.jobStore,
        objectStore: fixture.objectStore,
        config: fixture.config,
        runProcess,
        workspaceRoot: fixture.workspace
    });
    assert.equal(result.ready, true);
    assert.deepEqual(calls.map((call) => [call.command, call.timeoutMs]), [
        ["ffprobe", 1234],
        ["ffmpeg", 5678]
    ]);
    const ffmpegCall = calls.find((call) => call.command === "ffmpeg");
    assert.equal(ffmpegCall?.cwd, dirname(ffmpegCall?.outputManifest || ""));
    assert.match(ffmpegCall?.cwd || "", /media-gateway-/);
});

test("V2 worker failure diagnostics identify ffprobe parse boundary without leaking raw output", async () => {
    const fixture = await createQueuedJob();
    const logs = await captureInfo(async () => {
        const result = await runMediaWorker({
            jobKey: fixture.jobKey,
            jobStore: fixture.jobStore,
            objectStore: fixture.objectStore,
            config: fixture.config,
            runProcess: async (command) => {
                if (command === "ffprobe") return { stdout: "{ PRIVATE_FFPROBE_OUTPUT" };
                throw new Error(`unexpected command ${command}`);
            },
            workspaceRoot: fixture.workspace
        });
        assert.equal(result.failed, true);
        assert.equal(result.stage, "ffprobe-parse");
    });
    const failed = findLog(logs, "worker-failed");
    assert.equal(failed?.stage, "ffprobe-parse");
    assert.equal(JSON.stringify(logs).includes("PRIVATE_FFPROBE_OUTPUT"), false);
});

test("V2 worker failure diagnostics include safe process metadata for FFmpeg failures only", async () => {
    const fixture = await createQueuedJob();
    const logs = await captureInfo(async () => {
        const result = await runMediaWorker({
            jobKey: fixture.jobKey,
            jobStore: fixture.jobStore,
            objectStore: fixture.objectStore,
            config: fixture.config,
            runProcess: async (command) => {
                if (command === "ffprobe") return fakeRunProcess(command);
                const error = new Error("ffmpeg failed with sensitive stderr SECRET_STDERR");
                error.processName = "ffmpeg";
                error.exitCode = 1;
                error.timedOut = false;
                error.processCategory = "exit";
                error.stderr = "SECRET_STDERR";
                throw error;
            },
            workspaceRoot: fixture.workspace
        });
        assert.equal(result.failed, true);
        assert.equal(result.stage, "ffmpeg");
    });
    const failed = findLog(logs, "worker-failed");
    assert.equal(failed?.stage, "ffmpeg");
    assert.equal(failed?.processName, "ffmpeg");
    assert.equal(failed?.exitCode, 1);
    assert.equal(failed?.timedOut, false);
    assert.equal(failed?.processCategory, "exit");
    assert.equal(JSON.stringify(logs).includes("SECRET_STDERR"), false);
});

test("V2 worker failure diagnostics identify storage upload boundary", async () => {
    const fixture = await createQueuedJob({ objectStore: new FailingSegmentStore() });
    const logs = await captureInfo(async () => {
        const result = await runMediaWorker({
            jobKey: fixture.jobKey,
            jobStore: fixture.jobStore,
            objectStore: fixture.objectStore,
            config: fixture.config,
            runProcess: fakeRunProcess,
            workspaceRoot: fixture.workspace
        });
        assert.equal(result.failed, true);
        assert.equal(result.stage, "storage-upload");
    });
    const failed = findLog(logs, "worker-failed");
    assert.equal(failed?.stage, "storage-upload");
});

test("V2 uploader ignores temporary HLS files and deletes finalized media only after upload", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "media-gateway-upload-"));
    const objectStore = new MemoryObjectStore();
    const uploaded = new Map();
    await writeFile(join(workspace, "index.m3u8"), "#EXTM3U\n#EXTINF:4.0,\nseg-0001.m4s\n");
    await writeFile(join(workspace, "init.mp4"), "init");
    await writeFile(join(workspace, "seg-0001.m4s"), "segment");
    await writeFile(join(workspace, "seg-0002.m4s.tmp"), "partial");
    await writeFile(join(workspace, "seg-0003.tmp.m4s"), "partial");

    const result = await uploadHlsOutput({ objectStore, workspace, outputPrefix: "jobs/job-a/", uploaded });

    assert.equal(result.manifestUploaded, true);
    assert.equal(result.initUploaded, true);
    assert.equal(result.mediaUploaded, 1);
    assert.equal(result.mediaDeleted, 1);
    assert.equal(result.ignoredTemporary, 2);
    assert.equal(await objectStore.exists("jobs/job-a/index.m3u8"), true);
    assert.equal(await objectStore.exists("jobs/job-a/init.mp4"), true);
    assert.equal(await objectStore.exists("jobs/job-a/seg-0001.m4s"), true);
    assert.equal(await objectStore.exists("jobs/job-a/seg-0002.m4s.tmp"), false);
    await assert.rejects(access(join(workspace, "seg-0001.m4s")));
    await access(join(workspace, "index.m3u8"));
    await access(join(workspace, "init.mp4"));
    assert.equal(isTemporaryHlsFile("seg-0002.m4s.tmp"), true);
    assert.equal(isTemporaryHlsFile("seg-0003.tmp.m4s"), true);
});

test("V2 uploader keeps finalized segment locally when upload fails", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "media-gateway-upload-fail-"));
    const objectStore = new FailingSegmentStore();
    await writeFile(join(workspace, "seg-0001.m4s"), "segment");

    await assert.rejects(uploadHlsOutput({ objectStore, workspace, outputPrefix: "jobs/job-a/" }), /upload failed/);
    await access(join(workspace, "seg-0001.m4s"));
});

test("V2 worker marks progressive PLAYABLE before READY while deleted local segments remain available remotely", async () => {
    const fixture = await createQueuedJob({ jobStore: new TrackingJobStore() });
    const result = await runMediaWorker({
        jobKey: fixture.jobKey,
        jobStore: fixture.jobStore,
        objectStore: fixture.objectStore,
        config: fixture.config,
        runProcess: progressiveRunProcess,
        workspaceRoot: fixture.workspace
    });
    const statusUpdates = fixture.jobStore.updates
        .map((patch) => patch.status)
        .filter(Boolean);
    assert.equal(result.ready, true);
    assert.equal(statusUpdates.includes(JOB_STATUS.PLAYABLE), true);
    assert.equal(statusUpdates.at(-1), JOB_STATUS.READY);
    assert.equal(statusUpdates.indexOf(JOB_STATUS.PLAYABLE) < statusUpdates.indexOf(JOB_STATUS.READY), true);
    assert.equal(await fixture.objectStore.exists(`jobs/${fixture.jobKey}/seg-0001.m4s`), true);
    assert.equal(await fixture.objectStore.exists(`jobs/${fixture.jobKey}/seg-0002.m4s`), true);
    assert.equal(await fixture.objectStore.exists(`jobs/${fixture.jobKey}/index.m3u8`), true);
});

test("V2 incremental cleanup keeps workspace bounded in a synthetic long HLS simulation", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "media-gateway-long-hls-"));
    const objectStore = new MemoryObjectStore();
    const uploaded = new Map();
    await writeFile(join(workspace, "index.m3u8"), "#EXTM3U\n");
    await writeFile(join(workspace, "init.mp4"), "init");
    await writeFile(join(workspace, "policy.json"), "{}");
    for (let index = 0; index < 60; index += 1) {
        await writeFile(join(workspace, `seg-${String(index).padStart(4, "0")}.m4s`), `segment-${index}`);
        await uploadHlsOutput({ objectStore, workspace, outputPrefix: "jobs/job-long/", uploaded });
        const localFiles = await readdir(workspace);
        const localMediaSegments = localFiles.filter((file) => /\.(m4s|ts)$/i.test(file));
        assert.equal(localMediaSegments.length, 0);
        assert.equal(localFiles.includes("index.m3u8"), true);
        assert.equal(localFiles.includes("init.mp4"), true);
    }
    assert.equal(uploaded.size, 62);
    assert.equal(await objectStore.exists("jobs/job-long/seg-0059.m4s"), true);
});

test("V2 cleanup removes expired metadata and temporary output", async () => {
    let now = 1000;
    const fixture = await createQueuedJob({ now: () => now, expiresAt: 900 });
    await fixture.objectStore.putManifest(`jobs/${fixture.jobKey}/index.m3u8`, "#EXTM3U");
    const cleaned = await cleanupExpiredGatewayJobs({
        jobStore: fixture.jobStore,
        objectStore: fixture.objectStore,
        now: () => now
    });
    assert.equal(cleaned.cleaned, 1);
    assert.equal(await fixture.jobStore.get(fixture.jobKey), null);
    assert.equal(await fixture.objectStore.exists(`jobs/${fixture.jobKey}/index.m3u8`), false);
});

test("V2 worker classifies blocked source safely and clears sensitive source URL", async () => {
    const fixture = await createQueuedJob({ sourceUrl: "https://metadata.google.internal/movie.mkv" });
    const result = await runMediaWorker({
        jobKey: fixture.jobKey,
        jobStore: fixture.jobStore,
        objectStore: fixture.objectStore,
        config: fixture.config,
        runProcess: fakeRunProcess,
        workspaceRoot: fixture.workspace
    });
    const job = await fixture.jobStore.get(fixture.jobKey);
    assert.equal(result.failed, true);
    assert.equal(job.status, JOB_STATUS.FAILED);
    assert.equal(job.error.safeCode, SAFE_ERROR.SOURCE_BLOCKED);
    assert.equal(job.source.encryptedOrPrivateUrl, null);
});

async function createQueuedJob({
    now = () => Date.now(),
    sourceUrl = "https://example.com/movie.mkv",
    expiresAt = Date.now() + 3600000,
    jobStore = new MemoryJobStore({ now }),
    objectStore = new MemoryObjectStore({ now }),
    config = {
        limits: {
            leaseTtlMs: 60_000,
            ffprobeTimeoutMs: 60_000,
            ffmpegTimeoutMs: 14_400_000
        }
    }
} = {}) {
    const profile = normalizeDeviceProfile({ browserFamily: "safari", supportsHevc: false });
    const jobKey = makeJobKey(sourceUrl, profile);
    await jobStore.createIfAbsent(jobKey, {
        sourceUrl,
        sourceHash: hashSourceUrl(sourceUrl),
        profileHash: makeProfileHash(profile),
        deviceProfile: profile,
        requestedBy: "uid-a",
        outputPrefix: `jobs/${jobKey}/`,
        expiresAt
    });
    return {
        jobKey,
        jobStore,
        objectStore,
        workspace: mkdtempSync(join(tmpdir(), "media-gateway-test-")),
        config
    };
}

async function fakeRunProcess(command, args, timeoutMs, onProgress) {
    if (command === "ffprobe") {
        return {
            stdout: JSON.stringify({
                format: { format_name: "matroska", duration: "4.0" },
                streams: [
                    { codec_type: "video", codec_name: "h264", width: 64, height: 64 },
                    { codec_type: "audio", codec_name: "aac" }
                ]
            })
        };
    }
    if (command === "ffmpeg") {
        const outputManifest = args.at(-1);
        const outputDir = outputManifest.replace(/[\\/][^\\/]+$/, "");
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, "init.mp4"), "init");
        await writeFile(join(outputDir, "seg-0001.m4s"), "segment");
        await writeFile(outputManifest, "#EXTM3U\n#EXTINF:4.0,\nseg-0001.m4s\n#EXT-X-ENDLIST\n");
        if (onProgress) await onProgress();
        return { stdout: "", stderr: "" };
    }
    throw new Error(`unexpected command ${command}`);
}

async function progressiveRunProcess(command, args, timeoutMs, onProgress) {
    if (command === "ffprobe") return fakeRunProcess(command, args, timeoutMs, onProgress);
    if (command === "ffmpeg") {
        const outputManifest = args.at(-1);
        const outputDir = outputManifest.replace(/[\\/][^\\/]+$/, "");
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, "init.mp4"), "init");
        await writeFile(join(outputDir, "seg-0001.m4s"), "segment-1");
        await writeFile(outputManifest, "#EXTM3U\n#EXTINF:4.0,\nseg-0001.m4s\n");
        await onProgress();
        await assert.rejects(access(join(outputDir, "seg-0001.m4s")));
        await writeFile(join(outputDir, "seg-0002.m4s"), "segment-2");
        await writeFile(outputManifest, "#EXTM3U\n#EXTINF:4.0,\nseg-0001.m4s\n#EXTINF:4.0,\nseg-0002.m4s\n#EXT-X-ENDLIST\n");
        return { stdout: "", stderr: "" };
    }
    throw new Error(`unexpected command ${command}`);
}

class FailingSegmentStore extends MemoryObjectStore {
    async putSegment() {
        throw new Error("upload failed");
    }
}

class TrackingJobStore extends MemoryJobStore {
    constructor(options = {}) {
        super(options);
        this.updates = [];
    }

    async update(jobKey, patch = {}) {
        this.updates.push(patch);
        return super.update(jobKey, patch);
    }
}

async function captureInfo(fn) {
    const entries = [];
    const originalInfo = console.info;
    console.info = (event, details = {}) => {
        entries.push({ event, ...details });
    };
    try {
        await fn();
        return entries;
    } finally {
        console.info = originalInfo;
    }
}

function findLog(logs, event) {
    return logs.find((entry) => String(entry.event || "").includes(event));
}
