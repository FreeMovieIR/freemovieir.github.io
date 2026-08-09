import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { JOB_STAGES, JOB_STATUS, SAFE_ERROR } from "../src/v2/constants.js";
import { makeJobKey, hashSourceUrl, makeProfileHash, normalizeDeviceProfile } from "../src/v2/hash.js";
import { MemoryJobStore } from "../src/v2/stores/memory-job-store.js";
import { MemoryObjectStore } from "../src/v2/stores/memory-object-store.js";
import { cleanupExpiredGatewayJobs, runMediaWorker } from "../src/v2/worker.js";

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

async function createQueuedJob({ now = () => Date.now(), sourceUrl = "https://example.com/movie.mkv", expiresAt = Date.now() + 3600000 } = {}) {
    const jobStore = new MemoryJobStore({ now });
    const objectStore = new MemoryObjectStore({ now });
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
        config: { limits: { leaseTtlMs: 60_000 } }
    };
}

async function fakeRunProcess(command, args) {
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
        return { stdout: "", stderr: "" };
    }
    throw new Error(`unexpected command ${command}`);
}
