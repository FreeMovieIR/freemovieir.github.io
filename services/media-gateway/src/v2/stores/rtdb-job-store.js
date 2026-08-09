import { GATEWAY_SCHEMA_VERSION, JOB_STAGES, JOB_STATUS, REUSABLE_STATUSES } from "../constants.js";
import { safeLog } from "../errors.js";

export const RTDB_ERROR_CATEGORY = Object.freeze({
    PERMISSION_DENIED: "RTDB_PERMISSION_DENIED",
    VALIDATION_FAILED: "RTDB_VALIDATION_FAILED",
    INVALID_DATA: "RTDB_INVALID_DATA",
    INVALID_KEY: "RTDB_INVALID_KEY",
    TRANSACTION_ABORTED: "RTDB_TRANSACTION_ABORTED",
    NETWORK: "RTDB_NETWORK",
    AUTH: "RTDB_AUTH",
    UNKNOWN: "RTDB_UNKNOWN"
});

const FIREBASE_KEY_PATTERN = /[.#$\/\[\]\u0000-\u001f\u007f]/;
const JOB_KEY_PATTERN = /^[a-f0-9]{64}$/;

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
        assertValidJobKey(jobKey);
        const newJob = buildGatewayJob(jobKey, input, now);
        validateFirebaseSerializableJob(jobKey, newJob);
        let callbackCount = 0;
        let returnedExisting = false;
        safeLog("rtdb-create-start", { operation: "createIfAbsent", jobId: jobKey });
        try {
            const transactionResult = await this.ref(jobKey).transaction((current) => {
                callbackCount += 1;
                const existing = Boolean(current);
                safeLog("rtdb-transaction-callback", {
                    operation: "createIfAbsent",
                    jobId: jobKey,
                    callbackCount,
                    existing
                });
                if (current && isReusable(current, now)) {
                    returnedExisting = true;
                    return current;
                }
                safeLog("rtdb-transaction-return-new-job", {
                    operation: "createIfAbsent",
                    jobId: jobKey,
                    callbackCount,
                    existing
                });
                return newJob;
            }, undefined, false);
            const committed = Boolean(transactionResult?.committed);
            const snapshot = transactionResult?.snapshot || await this.ref(jobKey).get();
            const persisted = snapshot?.exists?.() ? snapshot.val() : null;
            if (!committed || !persisted) {
                throw withRtdbCategory(
                    new Error("Realtime Database transaction did not persist a job."),
                    RTDB_ERROR_CATEGORY.TRANSACTION_ABORTED
                );
            }
            const created = !returnedExisting;
            safeLog("rtdb-transaction-complete", {
                operation: "createIfAbsent",
                jobId: jobKey,
                callbackCount,
                committed,
                existing: !created
            });
            return { job: persisted, created, reused: !created };
        } catch (error) {
            const rtdbCategory = classifyRtdbError(error);
            safeLog("rtdb-create-error", {
                operation: "createIfAbsent",
                jobId: jobKey,
                callbackCount,
                rtdbCategory
            });
            throw withRtdbCategory(error, rtdbCategory);
        }
    }

    async addRequester(jobKey, uid) {
        assertValidJobKey(jobKey);
        assertValidFirebaseKey(uid, "requester uid");
        const now = this.now();
        await this.ref(`${jobKey}/requesters/${uid}`).update({ uid, lastSeenAt: now });
        await this.ref(jobKey).child("updatedAt").set(now);
        return this.get(jobKey);
    }

    async update(jobKey, patch = {}) {
        assertValidJobKey(jobKey);
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
        }, undefined, false);
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
        const snapshot = await this.ref().get();
        const now = this.now();
        return Object.values(snapshot.val() || {}).filter((job) => (
            job.requesters?.[uid]
            && isReusable(job, now)
            && job.status !== JOB_STATUS.READY
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

export function buildGatewayJob(jobKey, input, now = Date.now()) {
    return {
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
}

export function validateFirebaseSerializableJob(jobKey, job) {
    assertValidJobKey(jobKey);
    assertValidFirebaseKey(job?.requestedBy, "requestedBy");
    walkFirebaseValue(job, "job");
    return true;
}

export function classifyRtdbError(error) {
    if (error?.rtdbCategory && Object.values(RTDB_ERROR_CATEGORY).includes(error.rtdbCategory)) return error.rtdbCategory;
    const code = String(error?.code || "").toLowerCase();
    const name = String(error?.name || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    const status = Number(error?.status || error?.statusCode || error?.httpStatus || 0);
    const text = `${code} ${name} ${message}`;
    if (/permission[_ -]?denied|permission denied|permission_denied/.test(text)) return RTDB_ERROR_CATEGORY.PERMISSION_DENIED;
    if (/validation|validate|\.validate/.test(text)) return RTDB_ERROR_CATEGORY.VALIDATION_FAILED;
    if (/undefined|nan|infinity|-infinity|invalid data|unsupported value|not serializable/.test(text)) return RTDB_ERROR_CATEGORY.INVALID_DATA;
    if (/invalid.*(key|path)|(?:key|path).*invalid|contains.*[.#$\[\]]/.test(text)) return RTDB_ERROR_CATEGORY.INVALID_KEY;
    if (/transaction.*abort|transaction.*committed.*false|aborted/.test(text)) return RTDB_ERROR_CATEGORY.TRANSACTION_ABORTED;
    if (/network|timeout|unavailable|econnreset|enotfound|etimedout/.test(text)) return RTDB_ERROR_CATEGORY.NETWORK;
    if (/auth|credential|unauthenticated|unauthorized/.test(text) || status === 401 || status === 403) return RTDB_ERROR_CATEGORY.AUTH;
    return RTDB_ERROR_CATEGORY.UNKNOWN;
}

export function isReusable(job, now = Date.now()) {
    return Boolean(job && job.expiresAt > now && REUSABLE_STATUSES.includes(job.status));
}

function walkFirebaseValue(value, path) {
    if (value === undefined) throw invalidData(`${path} contains undefined.`);
    if (typeof value === "number" && !Number.isFinite(value)) throw invalidData(`${path} contains non-finite number.`);
    if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
        throw invalidData(`${path} contains unsupported value type.`);
    }
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) throw invalidData(`${path} contains unsupported array value.`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw invalidData(`${path} contains unsupported object instance.`);
    }
    for (const [key, child] of Object.entries(value)) {
        assertValidFirebaseKey(key, `${path} key`);
        walkFirebaseValue(child, `${path}/${key}`);
    }
}

function assertValidJobKey(jobKey) {
    if (typeof jobKey !== "string" || !JOB_KEY_PATTERN.test(jobKey)) {
        throw withRtdbCategory(new Error("Invalid Media Gateway job key."), RTDB_ERROR_CATEGORY.INVALID_KEY);
    }
}

function assertValidFirebaseKey(key, label) {
    if (typeof key !== "string" || key.length === 0 || FIREBASE_KEY_PATTERN.test(key)) {
        throw withRtdbCategory(new Error(`Invalid Firebase key: ${label}.`), RTDB_ERROR_CATEGORY.INVALID_KEY);
    }
}

function invalidData(message) {
    return withRtdbCategory(new Error(message), RTDB_ERROR_CATEGORY.INVALID_DATA);
}

function withRtdbCategory(error, rtdbCategory) {
    try {
        error.rtdbCategory = rtdbCategory;
    } catch {
        // Ignore immutable error-like values and let the caller classify them again.
    }
    return error;
}

function flattenPatch(value, prefix = "", output = {}) {
    for (const [key, item] of Object.entries(value || {})) {
        const path = prefix ? `${prefix}/${key}` : key;
        if (item && typeof item === "object" && !Array.isArray(item)) flattenPatch(item, path, output);
        else output[path] = item;
    }
    return output;
}
