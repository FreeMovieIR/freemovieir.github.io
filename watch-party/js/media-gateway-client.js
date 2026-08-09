export const GATEWAY_JOB_STATUS = Object.freeze({
    QUEUED: "queued",
    PROCESSING: "processing",
    PLAYABLE: "playable",
    READY: "ready",
    FAILED: "failed",
    CANCELLED: "cancelled",
    EXPIRED: "expired"
});

export class MediaGatewayClient {
    constructor(config = {}, tokenProvider = null) {
        this.config = normalizeGatewayConfig(config.mediaGateway || config);
        this.tokenProvider = tokenProvider;
    }

    get enabled() {
        return Boolean(this.config.enabled && this.config.baseUrl);
    }

    async probe(mediaUrl, profile = {}) {
        return this.request("/v1/probe", {
            method: "POST",
            body: { mediaUrl, profile: sanitizeProfile(profile) },
            timeoutMs: this.config.requestTimeoutMs
        });
    }

    async createJob(mediaUrl, profile = {}, options = {}) {
        return this.request("/v1/jobs", {
            method: "POST",
            body: {
                mediaUrl,
                profile: sanitizeProfile(profile),
                preferRemux: options.preferRemux ?? this.config.preferRemux
            },
            timeoutMs: this.config.requestTimeoutMs
        });
    }

    async getJob(jobId) {
        return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, {
            method: "GET",
            timeoutMs: this.config.requestTimeoutMs
        });
    }

    async cancelJob(jobId) {
        return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, {
            method: "DELETE",
            timeoutMs: this.config.requestTimeoutMs
        });
    }

    async waitForReady(jobId, { signal, pollMs = 2500, timeoutMs = this.config.jobTimeoutMs } = {}) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (signal?.aborted) throw new DOMException("Gateway job cancelled", "AbortError");
            const job = await this.getJob(jobId);
            if (job.status === GATEWAY_JOB_STATUS.PLAYABLE || job.status === GATEWAY_JOB_STATUS.READY) return job;
            if ([GATEWAY_JOB_STATUS.FAILED, GATEWAY_JOB_STATUS.CANCELLED, GATEWAY_JOB_STATUS.EXPIRED].includes(job.status)) {
                throw new Error(job.message || "آماده‌سازی نسخه سازگار انجام نشد.");
            }
            await delay(pollMs, signal);
        }
        throw new Error("آماده‌سازی نسخه سازگار بیشتر از حد معمول طول کشید.");
    }

    async request(path, { method, body, timeoutMs }) {
        if (!this.enabled) throw new Error("Media Gateway is disabled.");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const token = this.tokenProvider ? await this.tokenProvider() : "";
            const response = await fetch(new URL(path, this.config.baseUrl).href, {
                method,
                headers: {
                    "content-type": "application/json",
                    ...(token ? { authorization: `Bearer ${token}` } : {})
                },
                body: body ? JSON.stringify(body) : undefined,
                credentials: "omit",
                signal: controller.signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || "Media Gateway request failed.");
            return data;
        } finally {
            clearTimeout(timer);
        }
    }
}

export function normalizeGatewayConfig(config = {}) {
    const baseUrl = String(config.baseUrl || "").trim().replace(/\/+$/, "/");
    return {
        enabled: Boolean(config.enabled && baseUrl),
        baseUrl,
        requestTimeoutMs: Number(config.requestTimeoutMs || 15000),
        jobTimeoutMs: Number(config.jobTimeoutMs || 120000),
        preferRemux: config.preferRemux !== false
    };
}

export function isGatewayConfigured(config = {}) {
    return normalizeGatewayConfig(config.mediaGateway || config).enabled;
}

function sanitizeProfile(profile = {}) {
    return {
        profile: profile.profile || "unknown",
        browserFamily: profile.browserFamily || "unknown",
        nativeHls: Boolean(profile.nativeHls),
        mediaSource: Boolean(profile.mediaSource),
        managedMediaSource: Boolean(profile.managedMediaSource),
        webCodecsVideo: Boolean(profile.webCodecsVideo),
        webCodecsAudio: Boolean(profile.webCodecsAudio)
    };
}

function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener?.("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Gateway job cancelled", "AbortError"));
        }, { once: true });
    });
}
