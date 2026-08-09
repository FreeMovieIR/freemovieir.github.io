import { GATEWAY_SCHEMA_VERSION, JOB_STAGES, JOB_STATUS, REUSABLE_STATUSES } from "../constants.js";

export class RtdbJobStore {
    constructor({ database, path = "mediaGatewayJobs", now = () => Date.now() } = {}) {
        if (!database) throw new Error("RtdbJobStore requires an Admin SDK database instance.");
        this.database = database;
        this.path = path.replace(/^\/+|\/+$/g, "");
        this.now = now;
    }

    ref(jobKey = "") {
        return this.database.ref(jobKey ? `${this.path}/${jobKey}` : this.path);
    }

    async get(jobKey) {
        const snapshot = await this.ref(jobKey).get();
        return snapshot.exists() ? snapshot.val() : null;
    }

    async createIfAbsent(jobKey, input) {
        const now = this.now();
        let result = null;
        await this.ref(jobKey).transaction((current) => {
            if (current && isReusable(current, now)) {
                result = { job: current, created: false, reused: true };
                return current;
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
            result = { job, created: true, reused: false };
            return job;
        }, { applyLocally: false });
        return result || { job: await this.get(jobKey), created: false, reused: true };
    }

    async addRequester(jobKey, uid) {
        const now = this.now();
        await this.ref(`${jobKey}/requesters/${uid}`).update({ uid, lastSeenAt: now });
        await this.ref(jobKey).child("updatedAt").set(now);
        return this.get(jobKey);
    }

    async update(jobKey, patch = {}) {
        await this.ref(jobKey).update({ ...flattenPatch(patch), updatedAt: this.now() });
        return this.get(jobKey);
    }

    async acquireLease(jobKey, owner, leaseTtlMs) {
        const now = this.now();
        let acquired = false;
        await this.ref(jobKey).transaction((job) => {
            if (!job) return job;
            if (job.lease?.owner && job.lease.expiresAt > now && job.lease.owner !== owner) return job;
            acquired = true;
            return {
                ...job,
                lease: { owner, acquiredAt: now, expiresAt: now + leaseTtlMs },
                updatedAt: now
            };
        }, { applyLocally: false });
        return { acquired, job: await this.get(jobKey) };
    }

    async releaseLease(jobKey, owner) {
        const job = await this.get(jobKey);
        if (!job) return null;
        if (!owner || job.lease?.owner === owner) {
            await this.ref(jobKey).update({ lease: null, updatedAt: this.now() });
        }
        return this.get(jobKey);
    }

    async findExpired(now = this.now()) {
        const snapshot = await this.ref().orderByChild("expiresAt").endAt(now).get();
        if (!snapshot.exists()) return [];
        return Object.values(snapshot.val() || {});
    }

    async delete(jobKey) {
        await this.ref(jobKey).remove();
        return true;
    }

    async countActiveByUid(uid) {
        const snapshot = await this.ref().orderByChild(`requesters/${uid}/uid`).equalTo(uid).get();
        const now = this.now();
        return Object.values(snapshot.val() || {}).filter((job) => (
            isReusable(job, now) && job.status !== JOB_STATUS.READY
        )).length;
    }

    async countCreatedByUidSince(uid, since) {
        const snapshot = await this.ref().orderByChild("requestedBy").equalTo(uid).get();
        return Object.values(snapshot.val() || {}).filter((job) => Number(job.createdAt || 0) >= since).length;
    }

    async countGlobalActive() {
        const snapshot = await this.ref().get();
        const now = this.now();
        return Object.values(snapshot.val() || {}).filter((job) => (
            isReusable(job, now) && ![JOB_STATUS.PLAYABLE, JOB_STATUS.READY].includes(job.status)
        )).length;
    }
}

export function isReusable(job, now = Date.now()) {
    return Boolean(job && job.expiresAt > now && REUSABLE_STATUSES.includes(job.status));
}

function flattenPatch(value, prefix = "", output = {}) {
    for (const [key, item] of Object.entries(value || {})) {
        const path = prefix ? `${prefix}/${key}` : key;
        if (item && typeof item === "object" && !Array.isArray(item)) flattenPatch(item, path, output);
        else output[path] = item;
    }
    return output;
}
