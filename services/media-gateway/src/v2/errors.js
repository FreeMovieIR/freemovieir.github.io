import { SAFE_ERROR } from "./constants.js";

export class GatewayError extends Error {
    constructor(status, safeCode, message = "Media Gateway request failed.") {
        super(message);
        this.name = "GatewayError";
        this.status = status;
        this.safeCode = safeCode || SAFE_ERROR.INTERNAL;
    }
}

export function gatewayError(status, safeCode, message) {
    return new GatewayError(status, safeCode, message);
}

export function normalizeGatewayError(error) {
    if (error instanceof GatewayError) return error;
    if (error?.status && error?.safeCode) {
        return new GatewayError(error.status, error.safeCode, error.message);
    }
    return new GatewayError(500, SAFE_ERROR.INTERNAL, "Media Gateway request failed.");
}

export function publicError(error) {
    const normalized = normalizeGatewayError(error);
    return {
        safeError: normalized.safeCode,
        message: userSafeMessage(normalized.safeCode)
    };
}

export function userSafeMessage(safeCode) {
    switch (safeCode) {
        case SAFE_ERROR.AUTH_REQUIRED:
        case SAFE_ERROR.AUTH_INVALID:
            return "دسترسی معتبر نیست.";
        case SAFE_ERROR.SOURCE_BLOCKED:
            return "این لینک برای آماده‌سازی امن قابل استفاده نیست.";
        case SAFE_ERROR.SOURCE_UNAVAILABLE:
            return "لینک فیلم دیگر در دسترس نیست.";
        case SAFE_ERROR.RANGE_UNSUPPORTED:
            return "این سرور رسانه درخواست Range را پشتیبانی نمی‌کند.";
        case SAFE_ERROR.RATE_LIMITED:
            return "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.";
        case SAFE_ERROR.JOB_NOT_PLAYABLE:
            return "نسخه سازگار هنوز آماده پخش نیست.";
        case SAFE_ERROR.JOB_EXPIRED:
            return "نسخه سازگار منقضی شده است.";
        case SAFE_ERROR.CONVERSION_FAILED:
            return "آماده‌سازی این فایل انجام نشد.";
        default:
            return "آماده‌سازی نسخه سازگار انجام نشد.";
    }
}

export function safeLog(event, details = {}) {
    const allowed = {};
    for (const key of [
        "operation",
        "jobId",
        "status",
        "stage",
        "safeError",
        "policy",
        "reused",
        "durationBucket",
        "errorName",
        "errorCode",
        "httpStatus",
        "callbackCount",
        "committed",
        "existing",
        "rtdbCategory",
        "processName",
        "exitCode",
        "timedOut",
        "processCategory",
        "method",
        "upstreamStatus",
        "redirectCount"
    ]) {
        if (details[key] !== undefined) allowed[key] = details[key];
    }
    console.info(`[media-gateway] ${event}`, allowed);
}
