export const RESTORE_FAILURES = Object.freeze({
    TIMEOUT: "timeout",
    NOT_FOUND: "not-found",
    ENDED: "ended",
    EXPIRED: "expired",
    ACCESS_LOST: "access-lost",
    PERMISSION_DENIED: "permission-denied",
    NETWORK: "network",
    CANCELLED: "cancelled",
    UNKNOWN: "unknown"
});

export class RestoreError extends Error {
    constructor(reason, message) {
        super(message || reason);
        this.name = "RestoreError";
        this.reason = reason;
    }
}

export class RestoreCoordinator {
    constructor({
        timeoutMs = 10000,
        setTimeoutFn = (fn, ms) => globalThis.setTimeout(fn, ms),
        clearTimeoutFn = (id) => globalThis.clearTimeout(id),
        onTimeout = () => {}
    } = {}) {
        this.timeoutMs = timeoutMs;
        this.setTimeoutFn = setTimeoutFn;
        this.clearTimeoutFn = clearTimeoutFn;
        this.onTimeout = onTimeout;
        this.generation = 0;
        this.attemptCount = 0;
        this.activeTimer = null;
        this.activeGeneration = 0;
    }

    begin() {
        this.cancelTimer();
        const generation = ++this.generation;
        this.activeGeneration = generation;
        this.attemptCount += 1;
        this.activeTimer = this.setTimeoutFn(() => {
            if (!this.isCurrent(generation)) return;
            this.cancelTimer();
            this.onTimeout(generation);
        }, this.timeoutMs);
        return generation;
    }

    isCurrent(generation) {
        return generation === this.generation && generation === this.activeGeneration;
    }

    complete(generation) {
        if (!this.isCurrent(generation)) return false;
        this.cancelTimer();
        this.activeGeneration = 0;
        return true;
    }

    cancel() {
        this.generation += 1;
        this.activeGeneration = 0;
        this.cancelTimer();
    }

    cancelTimer() {
        if (this.activeTimer) this.clearTimeoutFn(this.activeTimer);
        this.activeTimer = null;
    }

    get active() {
        return this.activeGeneration !== 0;
    }
}

export function classifyRestoreFailure(error) {
    const reason = error?.reason;
    if (Object.values(RESTORE_FAILURES).includes(reason)) return reason;
    const message = String(error?.message || "");
    if (/permission[_ -]?denied|permission-denied/i.test(message)) return RESTORE_FAILURES.PERMISSION_DENIED;
    if (/network|offline|fetch|timeout|unavailable/i.test(message)) return RESTORE_FAILURES.NETWORK;
    return RESTORE_FAILURES.UNKNOWN;
}

export function getRestoreFailureMessage(reason) {
    switch (reason) {
        case RESTORE_FAILURES.TIMEOUT:
            return "بازیابی اتاق انجام نشد. ممکن است اتاق حذف شده باشد یا ارتباط موقتاً در دسترس نباشد.";
        case RESTORE_FAILURES.NOT_FOUND:
            return "اتاق قبلی دیگر وجود ندارد.";
        case RESTORE_FAILURES.ENDED:
            return "این اتاق پایان یافته است.";
        case RESTORE_FAILURES.EXPIRED:
            return "زمان این اتاق به پایان رسیده است.";
        case RESTORE_FAILURES.ACCESS_LOST:
            return "دسترسی شما به این اتاق دیگر فعال نیست.";
        case RESTORE_FAILURES.PERMISSION_DENIED:
            return "جایگاه شما در این اتاق دیگر در دسترس نیست.";
        case RESTORE_FAILURES.NETWORK:
            return "ارتباط برقرار نشد.";
        default:
            return "بازیابی اتاق انجام نشد. ممکن است اتاق حذف شده باشد یا ارتباط موقتاً در دسترس نباشد.";
    }
}

export function canRetryRestoreFailure(reason) {
    return [RESTORE_FAILURES.TIMEOUT, RESTORE_FAILURES.NETWORK, RESTORE_FAILURES.UNKNOWN].includes(reason);
}
