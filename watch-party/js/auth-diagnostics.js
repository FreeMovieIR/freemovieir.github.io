export const AUTH_ERROR_CATEGORIES = Object.freeze({
    NETWORK: "NETWORK",
    TIMEOUT: "TIMEOUT",
    OPERATION_NOT_ALLOWED: "OPERATION_NOT_ALLOWED",
    INVALID_CONFIG: "INVALID_CONFIG",
    TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    UNKNOWN: "UNKNOWN"
});

export const FIREBASE_INIT_ERROR_CATEGORIES = Object.freeze({
    SDK_NETWORK: "SDK_NETWORK",
    SDK_LOAD_FAILED: "SDK_LOAD_FAILED",
    CONFIG_LOAD_FAILED: "CONFIG_LOAD_FAILED"
});

export const AUTH_DIAGNOSTIC_CODES = Object.freeze({
    [AUTH_ERROR_CATEGORIES.NETWORK]: "AUTH-NETWORK",
    [AUTH_ERROR_CATEGORIES.TIMEOUT]: "AUTH-TIMEOUT",
    [AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED]: "AUTH-DISABLED",
    [AUTH_ERROR_CATEGORIES.INVALID_CONFIG]: "AUTH-CONFIG",
    [AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS]: "AUTH-RATE",
    [AUTH_ERROR_CATEGORIES.UNKNOWN]: "AUTH-UNKNOWN"
});

export const FIREBASE_INIT_DIAGNOSTIC_CODES = Object.freeze({
    [FIREBASE_INIT_ERROR_CATEGORIES.SDK_NETWORK]: "FIREBASE-SDK-NETWORK",
    [FIREBASE_INIT_ERROR_CATEGORIES.SDK_LOAD_FAILED]: "FIREBASE-SDK-LOAD",
    [FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED]: "FIREBASE-CONFIG-LOAD"
});

export const AUTH_USER_MESSAGES = Object.freeze({
    [AUTH_ERROR_CATEGORIES.NETWORK]: "اتصال به سرویس ورود برقرار نشد.",
    [AUTH_ERROR_CATEGORIES.TIMEOUT]: "اتصال به سرویس ورود بیشتر از حد معمول طول کشید.",
    [AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED]: "ورود مهمان موقتاً در دسترس نیست. لطفاً کمی بعد دوباره امتحان کنید.",
    [AUTH_ERROR_CATEGORIES.INVALID_CONFIG]: "سرویس ورود موقتاً دچار مشکل شده است.",
    [AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS]: "تعداد تلاش‌های ورود زیاد بوده است. کمی صبر کنید و دوباره امتحان کنید.",
    [AUTH_ERROR_CATEGORIES.UNKNOWN]: "ورود انجام نشد. لطفاً دوباره امتحان کنید."
});

export const FIREBASE_INIT_USER_MESSAGES = Object.freeze({
    [FIREBASE_INIT_ERROR_CATEGORIES.SDK_NETWORK]: "ارتباط با سرویس ورود برقرار نشد. اتصال اینترنت را بررسی کنید.",
    [FIREBASE_INIT_ERROR_CATEGORIES.SDK_LOAD_FAILED]: "بخشی از سرویس موردنیاز بارگذاری نشد. صفحه را دوباره بارگذاری کنید.",
    [FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED]: "تنظیمات اتصال سرویس بارگذاری نشد. صفحه را تازه‌سازی کنید و دوباره امتحان کنید."
});

export class AuthTimeoutError extends Error {
    constructor() {
        super("auth-timeout");
        this.name = "AuthTimeoutError";
    }
}

export class AuthInitializationError extends Error {
    constructor({ code, category, retryable }, cause) {
        super(AUTH_USER_MESSAGES[category] || AUTH_USER_MESSAGES[AUTH_ERROR_CATEGORIES.UNKNOWN]);
        this.name = "AuthInitializationError";
        this.code = code;
        this.category = category;
        this.retryable = Boolean(retryable);
        if (cause) Object.defineProperty(this, "cause", { value: cause, enumerable: false });
    }
}

export class FirebaseInitializationError extends Error {
    constructor({ code, category, retryable }, cause) {
        super(FIREBASE_INIT_USER_MESSAGES[category] || FIREBASE_INIT_USER_MESSAGES[FIREBASE_INIT_ERROR_CATEGORIES.SDK_LOAD_FAILED]);
        this.name = "FirebaseInitializationError";
        this.code = code;
        this.category = category;
        this.retryable = Boolean(retryable);
        if (cause) Object.defineProperty(this, "cause", { value: cause, enumerable: false });
    }
}

export function toAuthInitializationError(error) {
    if (error instanceof AuthInitializationError) return error;
    const category = classifyAuthError(error);
    return new AuthInitializationError({
        code: AUTH_DIAGNOSTIC_CODES[category],
        category,
        retryable: isAuthRetryable(category)
    }, error);
}

export function toFirebaseInitializationError(error, category = classifyFirebaseSdkLoadError(error)) {
    if (error instanceof FirebaseInitializationError) return error;
    const resolvedCategory = Object.values(FIREBASE_INIT_ERROR_CATEGORIES).includes(category)
        ? category
        : FIREBASE_INIT_ERROR_CATEGORIES.SDK_LOAD_FAILED;
    return new FirebaseInitializationError({
        code: FIREBASE_INIT_DIAGNOSTIC_CODES[resolvedCategory],
        category: resolvedCategory,
        retryable: resolvedCategory !== FIREBASE_INIT_ERROR_CATEGORIES.CONFIG_LOAD_FAILED
    }, error);
}

export function classifyAuthError(error) {
    if (error instanceof AuthTimeoutError || error?.name === "AbortError" || error?.code === "timeout") {
        return AUTH_ERROR_CATEGORIES.TIMEOUT;
    }
    const firebaseCode = getSafeFirebaseErrorCode(error);
    if (firebaseCode === "auth/network-request-failed") return AUTH_ERROR_CATEGORIES.NETWORK;
    if (firebaseCode === "auth/operation-not-allowed") return AUTH_ERROR_CATEGORIES.OPERATION_NOT_ALLOWED;
    if (firebaseCode === "auth/invalid-api-key" || firebaseCode === "auth/app-not-authorized") return AUTH_ERROR_CATEGORIES.INVALID_CONFIG;
    if (firebaseCode === "auth/too-many-requests") return AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS;
    return AUTH_ERROR_CATEGORIES.UNKNOWN;
}

export function classifyFirebaseSdkLoadError(error) {
    if (looksLikeNetworkLoadFailure(error)) return FIREBASE_INIT_ERROR_CATEGORIES.SDK_NETWORK;
    return FIREBASE_INIT_ERROR_CATEGORIES.SDK_LOAD_FAILED;
}

export function getAuthUserMessage(error) {
    const authError = toAuthInitializationError(error);
    return AUTH_USER_MESSAGES[authError.category] || AUTH_USER_MESSAGES[AUTH_ERROR_CATEGORIES.UNKNOWN];
}

export function getFirebaseInitUserMessage(error) {
    const initError = toFirebaseInitializationError(error);
    return FIREBASE_INIT_USER_MESSAGES[initError.category] || FIREBASE_INIT_USER_MESSAGES[FIREBASE_INIT_ERROR_CATEGORIES.SDK_LOAD_FAILED];
}

export function getSafeFirebaseErrorCode(error) {
    for (const code of [error?.code, error?.cause?.code]) {
        if (typeof code === "string" && /^auth\/[a-z0-9-]+$/i.test(code)) return code;
    }
    return "";
}

export function getSafeDiagnostic(error) {
    if (error instanceof AuthInitializationError || error instanceof FirebaseInitializationError) {
        return { code: error.code, category: error.category, retryable: error.retryable };
    }
    if (isAuthLikeError(error)) {
        const authError = toAuthInitializationError(error);
        return { code: authError.code, category: authError.category, retryable: authError.retryable };
    }
    const initError = toFirebaseInitializationError(error);
    return { code: initError.code, category: initError.category, retryable: initError.retryable };
}

export function getSafeAuthLogDetails(error, online = globalThis.navigator?.onLine) {
    const authError = toAuthInitializationError(error);
    return {
        category: authError.category,
        firebaseCode: getSafeFirebaseErrorCode(error),
        online: typeof online === "boolean" ? online : null
    };
}

export async function withAuthTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AuthTimeoutError()), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function probeFirebasePublicEndpoints({ fetchFn = globalThis.fetch?.bind(globalThis), timeoutMs = 3000 } = {}) {
    return {
        gstatic: await probePublicEndpoint(fetchFn, "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js", timeoutMs),
        identityToolkit: await probePublicEndpoint(fetchFn, "https://identitytoolkit.googleapis.com/$discovery/rest?version=v1", timeoutMs)
    };
}

function isAuthRetryable(category) {
    return [
        AUTH_ERROR_CATEGORIES.NETWORK,
        AUTH_ERROR_CATEGORIES.TIMEOUT,
        AUTH_ERROR_CATEGORIES.TOO_MANY_REQUESTS,
        AUTH_ERROR_CATEGORIES.UNKNOWN
    ].includes(category);
}

function isAuthLikeError(error) {
    return error instanceof AuthTimeoutError || Boolean(getSafeFirebaseErrorCode(error));
}

function looksLikeNetworkLoadFailure(error) {
    const name = String(error?.name || "");
    const message = String(error?.message || "");
    return name === "TypeError"
        || /failed to fetch|dynamically imported module|network|load failed|importing a module script failed/i.test(message);
}

async function probePublicEndpoint(fetchFn, url, timeoutMs) {
    if (!fetchFn) return { reachable: false, status: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchFn(url, {
            method: "GET",
            cache: "no-store",
            mode: "cors",
            credentials: "omit",
            signal: controller.signal
        });
        return { reachable: Boolean(response?.ok), status: Number(response?.status || 0) || null };
    } catch {
        return { reachable: false, status: null };
    } finally {
        clearTimeout(timer);
    }
}
