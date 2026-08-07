export const AUTH_ERROR_CATEGORIES = Object.freeze({
    NETWORK: "NETWORK",
    TIMEOUT: "TIMEOUT",
    OPERATION_NOT_ALLOWED: "OPERATION_NOT_ALLOWED",
    INVALID_CONFIG: "INVALID_CONFIG",
    TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    UNKNOWN: "UNKNOWN"
});

export const AUTH_DIAGNOSTIC_CODES = Object.freeze({
    [AUTH_ERROR_CATEGORIES.NETWORK]: "AUTH-NETWORK",
    [AUTH_ERROR_CATEGORIES.TIMEOUT]: "AUTH-TIMEOUT",
    [AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED]: "AUTH-DISABLED",
    [AUTH_ERROR_CATEGORIES.INVALID_CONFIG]: "AUTH-CONFIG",
    [AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS]: "AUTH-RATE",
    [AUTH_ERROR_CATEGORIES.UNKNOWN]: "AUTH-UNKNOWN"
});

export const AUTH_USER_MESSAGES = Object.freeze({
    [AUTH_ERROR_CATEGORIES.NETWORK]: "اتصال به سرویس ورود برقرار نشد. اینترنت یا محدودیت شبکه را بررسی کنید.",
    [AUTH_ERROR_CATEGORIES.TIMEOUT]: "اتصال به سرویس ورود بیش از حد طول کشید. دوباره تلاش کنید.",
    [AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED]: "ورود مهمان در تنظیمات سرویس فعال نیست.",
    [AUTH_ERROR_CATEGORIES.INVALID_CONFIG]: "پیکربندی سرویس ورود معتبر نیست.",
    [AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS]: "تعداد تلاش‌ها زیاد بوده است. کمی بعد دوباره امتحان کنید.",
    [AUTH_ERROR_CATEGORIES.UNKNOWN]: "ورود مهمان انجام نشد. دوباره تلاش کنید."
});

const FIREBASE_ENDPOINTS = Object.freeze({
    gstatic: "https://www.gstatic.com/generate_204",
    identityToolkit: "https://identitytoolkit.googleapis.com/$discovery/rest?version=v1"
});

export class AuthTimeoutError extends Error {
    constructor(message = "auth-timeout") {
        super(message);
        this.name = "AuthTimeoutError";
        this.code = "timeout";
    }
}

export class AuthInitializationError extends Error {
    constructor({ code, category, retryable, cause }) {
        super(AUTH_USER_MESSAGES[category] || AUTH_USER_MESSAGES[AUTH_ERROR_CATEGORIES.UNKNOWN]);
        this.name = "AuthInitializationError";
        this.code = code;
        this.category = category;
        this.retryable = Boolean(retryable);
        if (cause) {
            Object.defineProperty(this, "cause", {
                value: cause,
                enumerable: false,
                configurable: false,
                writable: false
            });
        }
    }

    toJSON() {
        return {
            code: this.code,
            category: this.category,
            retryable: this.retryable
        };
    }
}

export function toAuthInitializationError(error) {
    if (error instanceof AuthInitializationError) return error;
    const category = classifyAuthError(error);
    return new AuthInitializationError({
        code: AUTH_DIAGNOSTIC_CODES[category] || AUTH_DIAGNOSTIC_CODES[AUTH_ERROR_CATEGORIES.UNKNOWN],
        category,
        retryable: isRetryableAuthCategory(category),
        cause: error
    });
}

export function classifyAuthError(error) {
    if (error instanceof AuthInitializationError) return error.category;
    const code = normalizeFirebaseCode(error?.code || "");
    const message = String(error?.message || "");
    if (error instanceof AuthTimeoutError || code === "timeout" || /timeout|timed out|aborted/i.test(message)) {
        return AUTH_ERROR_CATEGORIES.TIMEOUT;
    }
    if (code === "auth/network-request-failed" || /network-request-failed|failed to fetch|networkerror|offline/i.test(message)) {
        return AUTH_ERROR_CATEGORIES.NETWORK;
    }
    if (code === "auth/operation-not-allowed" || /operation-not-allowed|operation_not_allowed/i.test(message)) {
        return AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED;
    }
    if (code === "auth/invalid-api-key" || code === "auth/app-not-authorized" || /invalid-api-key|app-not-authorized|api key not valid/i.test(message)) {
        return AUTH_ERROR_CATEGORIES.INVALID_CONFIG;
    }
    if (code === "auth/too-many-requests" || /too-many-requests|quota|rate/i.test(message)) {
        return AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS;
    }
    return AUTH_ERROR_CATEGORIES.UNKNOWN;
}

export function getSafeFirebaseCode(error) {
    const code = normalizeFirebaseCode(error instanceof AuthInitializationError ? error.cause?.code : error?.code);
    return code || "unknown";
}

export function getAuthUserMessage(errorOrCategory) {
    const category = typeof errorOrCategory === "string" ? errorOrCategory : classifyAuthError(errorOrCategory);
    return AUTH_USER_MESSAGES[category] || AUTH_USER_MESSAGES[AUTH_ERROR_CATEGORIES.UNKNOWN];
}

export function getAuthDiagnosticCode(errorOrCategory) {
    const category = typeof errorOrCategory === "string" ? errorOrCategory : classifyAuthError(errorOrCategory);
    return AUTH_DIAGNOSTIC_CODES[category] || AUTH_DIAGNOSTIC_CODES[AUTH_ERROR_CATEGORIES.UNKNOWN];
}

export function isRetryableAuthCategory(category) {
    return category === AUTH_ERROR_CATEGORIES.NETWORK
        || category === AUTH_ERROR_CATEGORIES.TIMEOUT
        || category === AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS
        || category === AUTH_ERROR_CATEGORIES.UNKNOWN;
}

export function resolveAuthRetryTarget({ role, action } = {}) {
    if (action === "create") return "host-media";
    if (action === "join") return "guest-profile";
    if (role === "host") return "host-profile";
    if (role === "guest") return "guest-code";
    return "welcome";
}

export async function probeFirebaseAuthEndpoints({ fetchFn = globalThis.fetch, timeoutMs = 2500 } = {}) {
    if (typeof fetchFn !== "function") {
        return {
            gstatic: { reachable: false, reason: "fetch-unavailable" },
            identityToolkit: { reachable: false, reason: "fetch-unavailable" }
        };
    }
    const [gstatic, identityToolkit] = await Promise.all([
        probePublicEndpoint(fetchFn, FIREBASE_ENDPOINTS.gstatic, timeoutMs),
        probePublicEndpoint(fetchFn, FIREBASE_ENDPOINTS.identityToolkit, timeoutMs)
    ]);
    return { gstatic, identityToolkit };
}

async function probePublicEndpoint(fetchFn, url, timeoutMs) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        await fetchFn(url, {
            method: "GET",
            mode: "no-cors",
            cache: "no-store",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: controller?.signal
        });
        return { reachable: true };
    } catch (error) {
        return { reachable: false, reason: error?.name === "AbortError" ? "timeout" : "unreachable" };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function normalizeFirebaseCode(code) {
    const value = String(code || "").trim();
    if (!value) return "";
    const lower = value.toLowerCase();
    if (/^[a-z0-9_/-]+$/.test(lower)) return lower.replace(/_/g, "-");
    return "";
}
