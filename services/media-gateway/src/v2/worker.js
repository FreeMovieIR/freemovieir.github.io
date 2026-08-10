import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { assertPublicHttpUrl } from "../security.js";
import { buildFfmpegArgs, buildFfprobeArgs, chooseConversionPolicy } from "../ffmpeg-policy.js";
import { DEFAULT_LIMITS, JOB_STAGES, JOB_STATUS, SAFE_ERROR } from "./constants.js";
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
    let lease = null;
    let stage = "lease";
    const workspace = resolve(workspaceRoot, `media-gateway-${jobKey.slice(0, 16)}-${Date.now()}`);
    try {
        safeLog("worker-stage", { jobId: jobKey, stage });
        lease = await jobStore.acquireLease(jobKey, leaseOwner, config.limits.leaseTtlMs);
        if (!lease.acquired) {
            safeLog("worker-lease-busy", { jobId: jobKey, safeError: SAFE_ERROR.LEASE_BUSY, stage });
            return { acquired: false };
        }
        stage = "load-job";
        safeLog("worker-stage", { jobId: jobKey, stage });
        let job = await jobStore.get(jobKey);
        if (!job) throw new Error("Job not found.");
        if ([JOB_STATUS.PLAYABLE, JOB_STATUS.READY].includes(job.status) && job.playback?.available) {
            return { acquired: true, alreadyReady: true };
        }
        await mkdir(workspace, { recursive: true });
        stage = "mark-probing";
        safeLog("worker-stage", { jobId: jobKey, stage });
        await jobStore.update(jobKey, { status: JOB_STATUS.PROBING, stage: JOB_STAGES.PROBING });
        stage = "source-validation";
        safeLog("worker-stage", { jobId: jobKey, stage });
        const sourceUrl = await assertPublicHttpUrl(job.source?.encryptedOrPrivateUrl);
        const probe = await probeSource(sourceUrl.href, runProcess, config.limits.ffprobeTimeoutMs || DEFAULT_LIMITS.ffprobeTimeoutMs, (nextStage) => {
            stage = nextStage;
            safeLog("worker-stage", { jobId: jobKey, stage });
        });
        const policy = chooseConversionPolicy(probe, {
            ...(job.deviceProfile || {}),
            supportsHevc: Boolean(job.deviceProfile?.supportsHevc)
        });
        stage = "persist-probe";
        safeLog("worker-stage", { jobId: jobKey, stage });
        await jobStore.update(jobKey, {
            probe,
            conversion: { policy, progress: { stage: JOB_STAGES.PREPARING } },
            status: JOB_STATUS.PROCESSING,
            stage: stageForPolicy(policy)
        });
        const outputManifest = join(workspace, "index.m3u8");
        await writeFile(join(workspace, "policy.json"), JSON.stringify({ policy, probe }, null, 2), "utf8");
        stage = "ffmpeg";
        safeLog("worker-stage", { jobId: jobKey, stage, policy: policy.mode });
        const uploaded = await runFfmpegAndUploadHls({
            sourceUrl: sourceUrl.href,
            outputManifest,
            policy,
            workspace,
            outputPrefix: job.outputPrefix,
            jobKey,
            jobStore,
            objectStore,
            runProcess,
            config
        });
        stage = "storage-upload";
        safeLog("worker-stage", { jobId: jobKey, stage });
        await uploadHlsOutput({ objectStore, workspace, outputPrefix: job.outputPrefix, uploaded });
        if (!await hasPlayableHls(workspace, uploaded)) {
            throw new Error("HLS output is missing required playable fMP4 files.");
        }
        const manifestObject = `${job.outputPrefix}index.m3u8`;
        stage = "mark-playable";
        safeLog("worker-stage", { jobId: jobKey, stage });
        await jobStore.update(jobKey, {
            status: JOB_STATUS.PLAYABLE,
            stage: JOB_STAGES.PLAYABLE,
            playback: { available: true, manifestObject },
            conversion: { progress: { stage: JOB_STAGES.PLAYABLE } }
        });
        stage = "mark-ready";
        safeLog("worker-stage", { jobId: jobKey, stage });
        await jobStore.update(jobKey, {
            status: JOB_STATUS.READY,
            stage: JOB_STAGES.READY,
            source: { encryptedOrPrivateUrl: null },
            updatedAt: now()
        });
        safeLog("worker-ready", { jobId: jobKey, status: JOB_STATUS.READY, stage: JOB_STAGES.READY, policy: policy.mode });
        return { acquired: true, ready: true };
    } catch (error) {
        if (lease?.acquired) await jobStore.update(jobKey, {
            status: JOB_STATUS.FAILED,
            stage: JOB_STAGES.FAILED,
            error: { safeCode: classifyWorkerError(error) },
            source: { encryptedOrPrivateUrl: null }
        }).catch(() => {});
        safeLog("worker-failed", {
            jobId: jobKey,
            safeError: classifyWorkerError(error),
            stage,
            ...safeProcessMetadata(error)
        });
        return { acquired: Boolean(lease?.acquired), failed: true, safeError: classifyWorkerError(error), stage };
    } finally {
        if (lease?.acquired) await jobStore.releaseLease(jobKey, leaseOwner).catch(() => {});
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

async function probeSource(sourceUrl, runProcess, timeoutMs, setStage = null) {
    setStage?.("ffprobe");
    const result = await runProcess("ffprobe", buildFfprobeArgs(sourceUrl), timeoutMs);
    setStage?.("ffprobe-parse");
    return parseFfprobeOutput(result.stdout || "{}");
}

export function parseFfprobeOutput(stdout) {
    const parsed = JSON.parse(stdout || "{}");
    const video = parsed.streams?.find((stream) => stream.codec_type === "video") || {};
    const audio = parsed.streams?.find((stream) => stream.codec_type === "audio") || {};
    const bitsPerRawSample = safeInteger(video.bits_per_raw_sample);
    const bitDepth = bitsPerRawSample || bitDepthFromPixelFormat(video.pix_fmt);
    return {
        container: safeString(parsed.format?.format_name),
        videoCodec: safeString(video.codec_name),
        videoProfile: safeString(video.profile),
        videoLevel: safeInteger(video.level),
        pixelFormat: safeString(video.pix_fmt),
        bitsPerRawSample,
        bitDepth,
        codecTag: safeString(video.codec_tag_string),
        audioCodec: safeString(audio.codec_name),
        audioProfile: safeString(audio.profile),
        audioChannels: safeInteger(audio.channels),
        audioChannelLayout: safeString(audio.channel_layout),
        audioSampleRate: safeInteger(audio.sample_rate),
        duration: Number(parsed.format?.duration || 0),
        width: Number(video.width || 0),
        height: Number(video.height || 0)
    };
}

async function runFfmpegAndUploadHls(options) {
    const timeoutMs = options.config?.limits?.ffmpegTimeoutMs || DEFAULT_LIMITS.ffmpegTimeoutMs;
    const uploaded = new Map();
    let markedPlayable = false;
    const uploadChanged = async () => {
        const result = await uploadHlsOutput({ ...options, uploaded }).catch(() => ({ changed: false }));
        if (!markedPlayable && result.changed && await hasPlayableHls(options.workspace, uploaded)) {
            markedPlayable = true;
            await options.jobStore.update(options.jobKey, {
                status: JOB_STATUS.PLAYABLE,
                stage: JOB_STAGES.PLAYABLE,
                playback: { available: true, manifestObject: `${options.outputPrefix}index.m3u8` },
                conversion: { progress: { stage: JOB_STAGES.PLAYABLE } }
            }).catch(() => {});
        }
    };
    await options.runProcess("ffmpeg", buildFfmpegArgs({
        sourceUrl: options.sourceUrl,
        outputManifest: options.outputManifest,
        policy: options.policy
    }), timeoutMs, uploadChanged, { cwd: options.workspace });
    return uploaded;
}

export async function uploadHlsOutput({ objectStore, workspace, outputPrefix, uploaded = null, deleteUploadedMedia = true }) {
    const files = await readdir(workspace);
    const result = {
        changed: false,
        manifestUploaded: false,
        mediaUploaded: 0,
        mediaDeleted: 0,
        initUploaded: false,
        ignoredTemporary: 0
    };
    for (const fileName of files) {
        if (isTemporaryHlsFile(fileName)) {
            result.ignoredTemporary += 1;
            continue;
        }
        if (!isFinalizedHlsOutputFile(fileName)) continue;
        const filePath = join(workspace, fileName);
        const info = await stat(filePath);
        const previous = uploaded?.get(fileName);
        if (previous && previous.mtimeMs === info.mtimeMs && previous.size === info.size) continue;
        const objectName = `${outputPrefix}${fileName}`;
        const body = await readFile(filePath);
        if (/\.m3u8$/i.test(fileName)) {
            await objectStore.putManifest(objectName, body.toString("utf8"));
            result.manifestUploaded = true;
        } else {
            await objectStore.putSegment(objectName, body, { contentType: contentTypeFor(fileName) });
            if (isMediaSegment(fileName)) result.mediaUploaded += 1;
            else result.initUploaded = true;
        }
        if (deleteUploadedMedia && isMediaSegment(fileName)) {
            await rm(filePath, { force: true });
            result.mediaDeleted += 1;
        }
        uploaded?.set(fileName, {
            mtimeMs: info.mtimeMs,
            size: info.size,
            deleted: deleteUploadedMedia && isMediaSegment(fileName)
        });
        result.changed = true;
    }
    return result;
}

export async function hasPlayableHls(workspace, uploaded = null) {
    const files = await readdir(workspace).catch(() => []);
    const allFiles = new Set([...files, ...uploadedFileNames(uploaded)]);
    const hasManifest = Array.from(allFiles).some((file) => /\.m3u8$/i.test(file));
    const hasInit = allFiles.has("init.mp4");
    const hasM4s = Array.from(allFiles).some((file) => /\.m4s$/i.test(file));
    const hasTs = Array.from(allFiles).some((file) => /\.ts$/i.test(file));
    return hasManifest && ((hasM4s && hasInit) || hasTs);
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

function safeProcessMetadata(error) {
    const metadata = {};
    if (typeof error?.processName === "string") metadata.processName = error.processName;
    if (Number.isInteger(error?.exitCode)) metadata.exitCode = error.exitCode;
    if (typeof error?.timedOut === "boolean") metadata.timedOut = error.timedOut;
    if (typeof error?.processCategory === "string") metadata.processCategory = error.processCategory;
    return metadata;
}

function contentTypeFor(fileName) {
    if (/\.m4s$/i.test(fileName)) return "video/iso.segment";
    if (/\.mp4$/i.test(fileName)) return "video/mp4";
    return "video/mp2t";
}

function safeString(value, maxLength = 80) {
    return String(value || "").trim().slice(0, maxLength);
}

function safeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
}

function bitDepthFromPixelFormat(pixelFormat) {
    const value = String(pixelFormat || "").toLowerCase();
    const match = /(?:^|[^\d])(\d{2})(?:le|be)?$/.exec(value) || /p(\d{2})(?:le|be)?$/.exec(value);
    if (match) return Number(match[1]);
    if (value === "yuv420p" || value === "yuvj420p") return 8;
    return 0;
}

export function isTemporaryHlsFile(fileName) {
    return /\.tmp$/i.test(fileName) || /\.tmp\./i.test(fileName);
}

export function isFinalizedHlsOutputFile(fileName) {
    return /\.(m3u8|m4s|mp4|ts)$/i.test(fileName) && !isTemporaryHlsFile(fileName);
}

function isMediaSegment(fileName) {
    return /\.(m4s|ts)$/i.test(fileName);
}

function uploadedFileNames(uploaded) {
    if (!uploaded) return [];
    return Array.from(uploaded.keys());
}

function defaultRunProcess(command, args, timeoutMs, onProgress = null, options = {}) {
    return runSpawnedProcess(command, args, timeoutMs, onProgress, options);
}

function runSpawnedProcess(command, args, timeoutMs, onProgress = null, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { shell: false, windowsHide: true, cwd: options.cwd });
        let stdout = "";
        let stderr = "";
        const progressTimer = onProgress ? setInterval(() => {
            onProgress().catch(() => {});
        }, 4000) : null;
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(processError(`${command} timed out.`, {
                processName: command,
                timedOut: true,
                processCategory: "timeout"
            }));
        }, timeoutMs);
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.once("error", (error) => {
            reject(processError(`${command} failed to start.`, {
                cause: error,
                processName: command,
                processCategory: "spawn"
            }));
        });
        child.once("exit", (code) => {
            clearTimeout(timer);
            if (progressTimer) clearInterval(progressTimer);
            if (code === 0) resolve({ stdout, stderr });
            else reject(processError(`${command} failed with code ${code}.`, {
                processName: command,
                exitCode: Number.isInteger(code) ? code : undefined,
                processCategory: "exit"
            }));
        });
    });
}

function processError(message, metadata = {}) {
    const error = new Error(message);
    if (metadata.cause) error.cause = metadata.cause;
    if (metadata.processName) error.processName = metadata.processName;
    if (metadata.exitCode !== undefined) error.exitCode = metadata.exitCode;
    if (metadata.timedOut !== undefined) error.timedOut = metadata.timedOut;
    if (metadata.processCategory) error.processCategory = metadata.processCategory;
    return error;
}
