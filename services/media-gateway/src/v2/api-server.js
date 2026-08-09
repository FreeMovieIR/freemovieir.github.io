import http from "node:http";
import { assertPublicHttpUrl } from "../security.js";
import { JOB_STATUS, SAFE_ERROR } from "./constants.js";
import { gatewayError, normalizeGatewayError, publicError, safeLog } from "./errors.js";
import { hashSourceUrl, makeJobKey, makeProfileHash, normalizeDeviceProfile } from "./hash.js";

export function createMediaGatewayApi({
    jobStore,
    objectStore,
    executor,
    tokenVerifier,
    config,
    now = () => Date.now()
}) {
    if (!jobStore || !objectStore || !executor || !tokenVerifier) {
        throw new Error("Media Gateway API requires jobStore, objectStore, executor, and tokenVerifier.");
    }
    return http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
            if (request.method === "POST" && url.pathname === "/v2/probe") {
                return json(response, 200, await probeSource(request, { tokenVerifier, config }));
            }
            if (request.method === "POST" && url.pathname === "/v2/jobs") {
                return json(response, 202, await createJob(request, { jobStore, executor, tokenVerifier, config, now }));
            }
            const jobMatch = url.pathname.match(/^\/v2\/jobs\/([a-f0-9]{64})$/);
            if (jobMatch && request.method === "GET") {
                return json(response, 200, await getJob(request, jobMatch[1], { jobStore, tokenVerifier, now }));
            }
            if (jobMatch && request.method === "DELETE") {
                return json(response, 200, await releaseJobInterest(request, jobMatch[1], { jobStore, tokenVerifier }));
            }
            const playbackMatch = url.pathname.match(/^\/v2\/jobs\/([a-f0-9]{64})\/playback$/);
            if (playbackMatch && (request.method === "GET" || request.method === "POST")) {
                return json(response, 200, await getPlayback(request, playbackMatch[1], { jobStore, objectStore, tokenVerifier, config, now }));
            }
            return json(response, 404, publicError(gatewayError(404, SAFE_ERROR.JOB_NOT_FOUND, "Not found.")));
        } catch (error) {
            const normalized = normalizeGatewayError(error);
            return json(response, normalized.status, publicError(normalized));
        }
    });
}

async function probeSource(request, { tokenVerifier, config }) {
    await tokenVerifier.verifyRequest(request);
    const body = await readJson(request, config.limits.requestBodyLimit);
    if (!body.mediaUrl) throw gatewayError(400, SAFE_ERROR.BAD_REQUEST, "mediaUrl is required.");
    const publicUrl = await normalizeSource(body.mediaUrl);
    return {
        source: { hash: hashSourceUrl(publicUrl.href) },
        accepted: true
    };
}

async function createJob(request, context) {
    const { jobStore, executor, tokenVerifier, config, now } = context;
    const auth = await tokenVerifier.verifyRequest(request);
    const body = await readJson(request, config.limits.requestBodyLimit);
    if (!body.mediaUrl) throw gatewayError(400, SAFE_ERROR.BAD_REQUEST, "mediaUrl is required.");
    const publicUrl = await normalizeSource(body.mediaUrl);
    await assertWithinRateLimits(jobStore, auth.uid, config, now);
    const deviceProfile = normalizeDeviceProfile(body.deviceProfile || body.profile || {});
    const jobKey = makeJobKey(publicUrl.href, deviceProfile);
    const expiresAt = now() + config.limits.jobTtlMs;
    const result = await jobStore.createIfAbsent(jobKey, {
        sourceUrl: publicUrl.href,
        sourceHash: hashSourceUrl(publicUrl.href),
        profileHash: makeProfileHash(deviceProfile),
        deviceProfile,
        requestedBy: auth.uid,
        outputPrefix: `jobs/${jobKey}/`,
        expiresAt
    });
    if (!result.created) await jobStore.addRequester(jobKey, auth.uid);
    if (result.created) {
        const started = await executor.start(jobKey);
        if (started?.executionName) await jobStore.update(jobKey, { executionName: started.executionName });
    }
    const job = await jobStore.get(jobKey) || result.job;
    safeLog("job-create", { jobId: jobKey, status: job.status, stage: job.stage, reused: !result.created });
    return publicJob(job, { reused: !result.created });
}

async function getJob(request, jobKey, { jobStore, tokenVerifier, now }) {
    await tokenVerifier.verifyRequest(request);
    const job = await requireJob(jobStore, jobKey, now);
    return publicJob(job);
}

async function releaseJobInterest(request, jobKey, { jobStore, tokenVerifier }) {
    const auth = await tokenVerifier.verifyRequest(request);
    const job = await jobStore.get(jobKey);
    if (!job) throw gatewayError(404, SAFE_ERROR.JOB_NOT_FOUND, "Job not found.");
    const requesters = { ...(job.requesters || {}) };
    delete requesters[auth.uid];
    await jobStore.update(jobKey, { requesters });
    return { jobId: jobKey, released: true };
}

async function getPlayback(request, jobKey, { jobStore, objectStore, tokenVerifier, config, now }) {
    await tokenVerifier.verifyRequest(request);
    const job = await requireJob(jobStore, jobKey, now);
    if (![JOB_STATUS.PLAYABLE, JOB_STATUS.READY].includes(job.status) || !job.playback?.available) {
        throw gatewayError(409, SAFE_ERROR.JOB_NOT_PLAYABLE, "Job is not playable.");
    }
    const playback = await objectStore.createPlaybackAccess({
        manifestObject: job.playback.manifestObject,
        expiresAt: Math.min(job.expiresAt, now() + config.limits.playbackTtlMs)
    });
    if (!playback) throw gatewayError(409, SAFE_ERROR.JOB_NOT_PLAYABLE, "Playback is not available.");
    return { jobId: jobKey, playback };
}

async function requireJob(jobStore, jobKey, now) {
    const job = await jobStore.get(jobKey);
    if (!job) throw gatewayError(404, SAFE_ERROR.JOB_NOT_FOUND, "Job not found.");
    if (job.expiresAt <= now()) throw gatewayError(410, SAFE_ERROR.JOB_EXPIRED, "Job expired.");
    return job;
}

async function normalizeSource(rawUrl) {
    try {
        return await assertPublicHttpUrl(rawUrl);
    } catch {
        throw gatewayError(400, SAFE_ERROR.SOURCE_BLOCKED, "Source URL is blocked.");
    }
}

async function assertWithinRateLimits(jobStore, uid, config, now) {
    const [activeByUid, createdByUid, globalActive] = await Promise.all([
        jobStore.countActiveByUid(uid),
        jobStore.countCreatedByUidSince(uid, now() - 60 * 60 * 1000),
        jobStore.countGlobalActive()
    ]);
    if (activeByUid >= config.limits.maxActivePerUid) throw gatewayError(429, SAFE_ERROR.RATE_LIMITED, "UID active job limit reached.");
    if (createdByUid >= config.limits.maxCreatePerHour) throw gatewayError(429, SAFE_ERROR.RATE_LIMITED, "UID create rate limit reached.");
    if (globalActive >= config.limits.maxGlobalActive) throw gatewayError(429, SAFE_ERROR.RATE_LIMITED, "Global active job limit reached.");
}

async function readJson(request, limit) {
    let text = "";
    for await (const chunk of request) {
        text += chunk;
        if (text.length > limit) throw gatewayError(413, SAFE_ERROR.BAD_REQUEST, "Request body too large.");
    }
    try {
        return JSON.parse(text || "{}");
    } catch {
        throw gatewayError(400, SAFE_ERROR.BAD_REQUEST, "Request body must be JSON.");
    }
}

function publicJob(job, extra = {}) {
    return {
        jobId: job.jobKey || job.jobId,
        status: job.status,
        stage: job.stage,
        progress: job.conversion?.progress || null,
        playbackAvailable: Boolean(job.playback?.available),
        expiresAt: job.expiresAt,
        safeError: job.error?.safeCode || null,
        ...extra
    };
}

function json(response, status, body) {
    response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
    });
    response.end(JSON.stringify(body));
}
