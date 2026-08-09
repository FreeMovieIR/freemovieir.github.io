import { randomUUID } from "node:crypto";
import { GATEWAY_SCHEMA_VERSION, JOB_STAGES, JOB_STATUS, REUSABLE_STATUSES } from "../constants.js";

export class MemoryJobStore {
    constructor({ now = () => Date.now() } = {}) {
        this.now = now;
        this.jobs = new Map();
        this.createEvents = [];
    }

    async get(jobKey) {
        return clone(this.jobs.get(jobKey) || null);
    }

    async createIfAbsent(jobKey, input) {
        const now = this.now();
        const existing = this.jobs.get(jobKey);
        if (existing && isReusable(existing, now)) {
            return { job: clone(existing), created: false, reused: true };
        }
        const job = {
            schemaVersion: GATEWAY_SCHEMA_VERSION,
            jobKey,
            jobId: jobKey,
            sourceHash: input.sourceHash,
            profileHash: input.profileHash,
            status: JOB_STATUS.QUEUED,
            stage: JOB_STAGES.QUEUED,
            createdAt: now,
            updatedAt: now,
            expiresAt: input.expiresAt,
            requestedBy: input.requestedBy,
            requesters: { [input.requestedBy]: { uid: input.requestedBy, createdAt: now, lastSeenAt: now } },
            executionName: "",
            outputPrefix: input.outputPrefix,
            source: { encryptedOrPrivateUrl: input.sourceUrl },
            deviceProfile: input.deviceProfile,
            probe: null,
            conversion: { policy: null, progress: null },
            playback: { available: false, manifestObject: "" },
            lease: null,
            error: null
        };
        this.jobs.set(jobKey, job);
        this.createEvents.push({ jobKey, at: now });
        return { job: clone(job), created: true, reused: false };
    }

    async addRequester(jobKey, uid) {
        const job = this.jobs.get(jobKey);
        if (!job) return null;
        const now = this.now();
        job.requesters ||= {};
        job.requesters[uid] = { uid, lastSeenAt: now, createdAt: job.requesters[uid]?.createdAt || now };
        job.updatedAt = now;
        return clone(job);
    }

    async update(jobKey, patch = {}) {
        const job = this.jobs.get(jobKey);
        if (!job) return null;
        deepMerge(job, patch);
        job.updatedAt = this.now();
        this.jobs.set(jobKey, job);
        return clone(job);
    }

    async acquireLease(jobKey, owner, leaseTtlMs) {
        const job = this.jobs.get(jobKey);
        if (!job) return { acquired: false, job: null };
        const now = this.now();
        if (job.lease?.owner && job.lease.expiresAt > now && job.lease.owner !== owner) {
            return { acquired: false, job: clone(job) };
        }
        job.lease = { owner: owner || randomUUID(), acquiredAt: now, expiresAt: now + leaseTtlMs };
        job.updatedAt = now;
        return { acquired: true, job: clone(job) };
    }

    async releaseLease(jobKey, owner) {
        const job = this.jobs.get(jobKey);
        if (!job) return null;
        if (!owner || job.lease?.owner === owner) job.lease = null;
        job.updatedAt = this.now();
        return clone(job);
    }

    async findExpired(now = this.now()) {
        return [...this.jobs.values()].filter((job) => job.expiresAt <= now).map(clone);
    }

    async delete(jobKey) {
        return this.jobs.delete(jobKey);
    }

    async countActiveByUid(uid) {
        const now = this.now();
        return [...this.jobs.values()].filter((job) => (
            job.requesters?.[uid]
            && isReusable(job, now)
            && job.status !== JOB_STATUS.READY
        )).length;
    }

    async countCreatedByUidSince(uid, since) {
        return [...this.jobs.values()].filter((job) => job.requestedBy === uid && job.createdAt >= since).length;
    }

    async countGlobalActive() {
        const now = this.now();
        return [...this.jobs.values()].filter((job) => isReusable(job, now) && ![JOB_STATUS.PLAYABLE, JOB_STATUS.READY].includes(job.status)).length;
    }
}

export function isReusable(job, now = Date.now()) {
    return Boolean(job && job.expiresAt > now && REUSABLE_STATUSES.includes(job.status));
}

function deepMerge(target, patch) {
    for (const [key, value] of Object.entries(patch || {})) {
        if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object") {
            deepMerge(target[key], value);
        } else {
            target[key] = value;
        }
    }
}

function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
}
