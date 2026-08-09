import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { assertPublicHttpUrl } from "../security.js";
import { buildFfmpegArgs, buildFfprobeArgs, chooseConversionPolicy } from "../ffmpeg-policy.js";
import { JOB_STAGES, JOB_STATUS, SAFE_ERROR } from "./constants.js";
import { safeLog } from "./errors.js";

export async function runMediaWorker({
    jobKey,
    jobStore,
    objectStore,
    config,
    workspaceRoot = process.env.TMPDIR || process.env.TEMP || "/tmp",
    runProcess = defaultRunProcess,
    now = () => Date.now()
}) {
    if (!jobKey) throw new Error("MEDIA_GATEWAY_JOB_KEY is required.");
    const leaseOwner = `worker-${randomUUID()}`;
    const lease = await jobStore.acquireLease(jobKey, leaseOwner, config.limits.leaseTtlMs);
    if (!lease.acquired) {
        safeLog("worker-lease-busy", { jobId: jobKey, safeError: SAFE_ERROR.LEASE_BUSY });
        return { acquired: false };
    }
    const workspace = resolve(workspaceRoot, `media-gateway-${jobKey.slice(0, 16)}-${Date.now()}`);
    try {
        let job = await jobStore.get(jobKey);
        if (!job) throw new Error("Job not found.");
        if ([JOB_STATUS.PLAYABLE, JOB_STATUS.READY].includes(job.status) && job.playback?.available) {
            return { acquired: true, alreadyReady: true };
        }
        await mkdir(workspace, { recursive: true });
        await jobStore.update(jobKey, { status: JOB_STATUS.PROBING, stage: JOB_STAGES.PROBING });
        const sourceUrl = await assertPublicHttpUrl(job.source?.encryptedOrPrivateUrl);
        const probe = await probeSource(sourceUrl.href, runProcess);
        const policy = chooseConversionPolicy(probe, { supportsHevc: Boolean(job.deviceProfile?.supportsHevc) });
        await jobStore.update(jobKey, {
            probe,
            conversion: { policy, progress: { stage: JOB_STAGES.PREPARING } },
            status: JOB_STATUS.PROCESSING,
            stage: stageForPolicy(policy)
        });
        const outputManifest = join(workspace, "index.m3u8");
        await writeFile(join(workspace, "policy.json"), JSON.stringify({ policy, probe }, null, 2), "utf8");
        await runFfmpegAndUploadHls({
            sourceUrl: sourceUrl.href,
            outputManifest,
            policy,
            workspace,
            outputPrefix: job.outputPrefix,
            jobKey,
            jobStore,
            objectStore,
            runProcess
        });
        await uploadHlsOutput({ objectStore, workspace, outputPrefix: job.outputPrefix });
        const manifestObject = `${job.outputPrefix}index.m3u8`;
        await jobStore.update(jobKey, {
            status: JOB_STATUS.PLAYABLE,
            stage: JOB_STAGES.PLAYABLE,
            playback: { available: true, manifestObject },
            conversion: { progress: { stage: JOB_STAGES.PLAYABLE } }
        });
        await jobStore.update(jobKey, {
            status: JOB_STATUS.READY,
            stage: JOB_STAGES.READY,
            source: { encryptedOrPrivateUrl: null },
            updatedAt: now()
        });
        safeLog("worker-ready", { jobId: jobKey, status: JOB_STATUS.READY, stage: JOB_STAGES.READY, policy: policy.mode });
        return { acquired: true, ready: true };
    } catch (error) {
        await jobStore.update(jobKey, {
            status: JOB_STATUS.FAILED,
            stage: JOB_STAGES.FAILED,
            error: { safeCode: classifyWorkerError(error) },
            source: { encryptedOrPrivateUrl: null }
        }).catch(() => {});
        safeLog("worker-failed", { jobId: jobKey, safeError: classifyWorkerError(error), stage: JOB_STAGES.FAILED });
        return { acquired: true, failed: true, safeError: classifyWorkerError(error) };
    } finally {
        await jobStore.releaseLease(jobKey, leaseOwner).catch(() => {});
        await rm(workspace, { recursive: true, force: true }).catch(() => {});
    }
}

export async function cleanupExpiredGatewayJobs({ jobStore, objectStore, now = () => Date.now() }) {
    const expired = await jobStore.findExpired(now());
    for (const job of expired) {
        await objectStore.deletePrefix(job.outputPrefix || `jobs/${job.jobKey}/`).catch(() => {});
        await jobStore.delete(job.jobKey);
    }
    return { cleaned: expired.length };
}

async function probeSource(sourceUrl, runProcess) {
    const result = await runProcess("ffprobe", buildFfprobeArgs(sourceUrl), 30000);
    const parsed = JSON.parse(result.stdout || "{}");
    const video = parsed.streams?.find((stream) => stream.codec_type === "video") || {};
    const audio = parsed.streams?.find((stream) => stream.codec_type === "audio") || {};
    return {
        container: parsed.format?.format_name || "",
        videoCodec: video.codec_name || "",
        audioCodec: audio.codec_name || "",
        duration: Number(parsed.format?.duration || 0),
        width: Number(video.width || 0),
        height: Number(video.height || 0)
    };
}

async function runFfmpegAndUploadHls(options) {
    if (options.runProcess !== defaultRunProcess) {
        await options.runProcess("ffmpeg", buildFfmpegArgs({
            sourceUrl: options.sourceUrl,
            outputManifest: options.outputManifest,
            policy: options.policy
        }), 30 * 60 * 1000);
        return;
    }
    const uploaded = new Map();
    let markedPlayable = false;
    const uploadChanged = async () => {
        const changed = await uploadHlsOutput({ ...options, uploaded }).catch(() => false);
        if (!markedPlayable && changed && await hasPlayableHls(options.workspace)) {
            markedPlayable = true;
            await options.jobStore.update(options.jobKey, {
                status: JOB_STATUS.PLAYABLE,
                stage: JOB_STAGES.PLAYABLE,
                playback: { available: true, manifestObject: `${options.outputPrefix}index.m3u8` },
                conversion: { progress: { stage: JOB_STAGES.PLAYABLE } }
            }).catch(() => {});
        }
    };
    await runSpawnedProcess("ffmpeg", buildFfmpegArgs({
        sourceUrl: options.sourceUrl,
        outputManifest: options.outputManifest,
        policy: options.policy
    }), 30 * 60 * 1000, uploadChanged);
}

async function uploadHlsOutput({ objectStore, workspace, outputPrefix, uploaded = null }) {
    const files = await readdir(workspace);
    let changed = false;
    for (const fileName of files) {
        if (!/\.(m3u8|m4s|mp4|ts)$/i.test(fileName)) continue;
        const filePath = join(workspace, fileName);
        const info = await stat(filePath);
        const previous = uploaded?.get(fileName);
        if (previous && previous.mtimeMs === info.mtimeMs && previous.size === info.size) continue;
        const objectName = `${outputPrefix}${fileName}`;
        const body = await readFile(filePath);
        if (/\.m3u8$/i.test(fileName)) await objectStore.putManifest(objectName, body.toString("utf8"));
        else await objectStore.putSegment(objectName, body, { contentType: contentTypeFor(fileName) });
        uploaded?.set(fileName, { mtimeMs: info.mtimeMs, size: info.size });
        changed = true;
    }
    return changed;
}

async function hasPlayableHls(workspace) {
    const files = await readdir(workspace).catch(() => []);
    return files.some((file) => /\.m3u8$/i.test(file)) && files.some((file) => /\.(m4s|ts)$/i.test(file));
}

function stageForPolicy(policy) {
    if (policy.mode === "remux") return JOB_STAGES.REMUXING;
    if (policy.mode === "transcode-audio") return JOB_STAGES.TRANSCODING_AUDIO;
    if (policy.mode === "transcode-video") return JOB_STAGES.TRANSCODING_VIDEO;
    return JOB_STAGES.TRANSCODING;
}

function classifyWorkerError(error) {
    const message = String(error?.message || "");
    if (/blocked|private|loopback|link-local|metadata|resolve/i.test(message)) return SAFE_ERROR.SOURCE_BLOCKED;
    if (/403|404|unavailable|expired|timed out|timeout/i.test(message)) return SAFE_ERROR.SOURCE_UNAVAILABLE;
    return SAFE_ERROR.CONVERSION_FAILED;
}

function contentTypeFor(fileName) {
    if (/\.m4s$/i.test(fileName)) return "video/iso.segment";
    if (/\.mp4$/i.test(fileName)) return "video/mp4";
    return "video/mp2t";
}

function defaultRunProcess(command, args, timeoutMs) {
    return runSpawnedProcess(command, args, timeoutMs);
}

function runSpawnedProcess(command, args, timeoutMs, onProgress = null) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { shell: false, windowsHide: true });
        let stdout = "";
        let stderr = "";
        const progressTimer = onProgress ? setInterval(() => {
            onProgress().catch(() => {});
        }, 4000) : null;
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`${command} timed out.`));
        }, timeoutMs);
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.once("error", reject);
        child.once("exit", (code) => {
            clearTimeout(timer);
            if (progressTimer) clearInterval(progressTimer);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`${command} failed with code ${code}.`));
        });
    });
}
