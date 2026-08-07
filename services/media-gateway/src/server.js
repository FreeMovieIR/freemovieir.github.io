import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { assertPublicHttpUrl, redactUrl } from "./security.js";
import { buildFfmpegArgs, buildFfprobeArgs, chooseConversionPolicy } from "./ffmpeg-policy.js";

const PORT = Number(process.env.PORT || 8787);
const OUTPUT_ROOT = resolve(process.env.MEDIA_GATEWAY_OUTPUT_DIR || ".media-gateway-output");
const JOB_TTL_MS = Number(process.env.MEDIA_GATEWAY_JOB_TTL_MS || 2 * 60 * 60 * 1000);
const MAX_ACTIVE_JOBS = Number(process.env.MEDIA_GATEWAY_MAX_ACTIVE_JOBS || 2);
const REQUIRE_AUTH = process.env.MEDIA_GATEWAY_REQUIRE_AUTH !== "false";
const jobs = new Map();

const server = http.createServer(async (request, response) => {
    try {
        if (REQUIRE_AUTH && !/^Bearer\s+[-._~+/=A-Za-z0-9]+$/.test(request.headers.authorization || "")) {
            return json(response, 401, { message: "Firebase ID token is required." });
        }
        const url = new URL(request.url, `http://${request.headers.host}`);
        if (request.method === "POST" && url.pathname === "/v1/probe") return handleProbe(request, response);
        if (request.method === "POST" && url.pathname === "/v1/jobs") return handleCreateJob(request, response);
        const jobMatch = url.pathname.match(/^\/v1\/jobs\/([A-Za-z0-9_-]{8,80})$/);
        if (jobMatch && request.method === "GET") return handleGetJob(response, jobMatch[1]);
        if (jobMatch && request.method === "DELETE") return handleCancelJob(response, jobMatch[1]);
        return json(response, 404, { message: "Not found." });
    } catch (error) {
        return json(response, 400, { message: error.message || "Request failed." });
    }
});

async function handleProbe(request, response) {
    const body = await readJson(request);
    const sourceUrl = await assertPublicHttpUrl(body.mediaUrl);
    const probe = await runProbe(sourceUrl.href);
    return json(response, 200, { source: { url: redactUrl(sourceUrl.href) }, probe });
}

async function handleCreateJob(request, response) {
    const activeJobs = Array.from(jobs.values()).filter((job) => ["queued", "processing"].includes(job.status)).length;
    if (activeJobs >= MAX_ACTIVE_JOBS) return json(response, 429, { message: "Too many active jobs." });
    const body = await readJson(request);
    const sourceUrl = await assertPublicHttpUrl(body.mediaUrl);
    const jobId = randomUUID().replace(/-/g, "");
    const outputDir = join(OUTPUT_ROOT, jobId);
    const outputManifest = join(outputDir, "index.m3u8");
    const expiresAt = Date.now() + JOB_TTL_MS;
    const job = {
        jobId,
        status: "queued",
        progress: { stage: "queued" },
        source: { url: redactUrl(sourceUrl.href) },
        outputDir,
        expiresAt,
        playback: null
    };
    jobs.set(jobId, job);
    runJob(job, sourceUrl.href, outputManifest, body.profile || {}).catch((error) => {
        job.status = "failed";
        job.message = error.message || "Conversion failed.";
    });
    return json(response, 202, publicJob(job));
}

async function runJob(job, sourceUrl, outputManifest, profile) {
    job.status = "processing";
    job.progress = { stage: "probe" };
    await mkdir(job.outputDir, { recursive: true });
    const probe = await runProbe(sourceUrl);
    job.progress = { stage: "prepare" };
    const policy = chooseConversionPolicy(probe, { supportsHevc: Boolean(profile.supportsHevc) });
    await writeFile(join(job.outputDir, "policy.json"), JSON.stringify({ policy, probe }, null, 2));
    job.progress = { stage: policy.mode };
    await runProcess("ffmpeg", buildFfmpegArgs({ sourceUrl, outputManifest, policy }), 120000);
    job.status = "ready";
    job.progress = { stage: "ready" };
    job.playback = {
        type: "hls",
        manifestUrl: `/media/${job.jobId}/index.m3u8`
    };
}

function handleGetJob(response, jobId) {
    const job = jobs.get(jobId);
    if (!job) return json(response, 404, { message: "Job not found." });
    if (job.expiresAt < Date.now() && job.status !== "expired") {
        job.status = "expired";
        job.progress = { stage: "expired" };
    }
    return json(response, 200, publicJob(job));
}

async function handleCancelJob(response, jobId) {
    const job = jobs.get(jobId);
    if (!job) return json(response, 404, { message: "Job not found." });
    job.status = "cancelled";
    job.progress = { stage: "cancelled" };
    await rm(job.outputDir, { recursive: true, force: true }).catch(() => {});
    return json(response, 200, publicJob(job));
}

async function runProbe(sourceUrl) {
    if (process.env.MEDIA_GATEWAY_FAKE_PROBE === "true") {
        return { container: "matroska", videoCodec: "h264", audioCodec: "aac", duration: 10 };
    }
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

function runProcess(command, args, timeoutMs) {
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
            else reject(new Error(`${command} failed with code ${code}.`));
        });
    });
}

async function readJson(request) {
    let text = "";
    for await (const chunk of request) {
        text += chunk;
        if (text.length > 16384) throw new Error("Request body is too large.");
    }
    return JSON.parse(text || "{}");
}

function publicJob(job) {
    return {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        playback: job.playback,
        expiresAt: job.expiresAt,
        message: job.message
    };
}

function json(response, status, body) {
    response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
    });
    response.end(JSON.stringify(body));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Media Gateway listening on ${PORT}`);
    });
}

export { server, jobs };
