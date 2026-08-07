const AUTH_ERROR_VIEWS = Object.freeze({
    "FIREBASE-SDK-NETWORK": {
        primary: "ارتباط با سرویس ورود برقرار نشد. اتصال اینترنت را بررسی کنید.",
        secondary: "اگر داخل ایران هستید و مشکل ادامه دارد، یک‌بار با VPN امتحان کنید."
    },
    "AUTH-NETWORK": {
        primary: "اتصال به سرویس ورود برقرار نشد.",
        secondary: "اتصال اینترنت را بررسی کنید. اگر داخل ایران هستید و مشکل ادامه دارد، یک‌بار با VPN امتحان کنید."
    },
    "AUTH-TIMEOUT": {
        primary: "اتصال به سرویس ورود بیشتر از حد معمول طول کشید.",
        secondary: "دوباره تلاش کنید. اگر داخل ایران هستید و مشکل تکرار می‌شود، اتصال با VPN را هم امتحان کنید."
    },
    "FIREBASE-SDK-LOAD": {
        primary: "بخشی از سرویس موردنیاز بارگذاری نشد. صفحه را دوباره بارگذاری کنید.",
        secondary: ""
    },
    "FIREBASE-CONFIG-LOAD": {
        primary: "تنظیمات اتصال سرویس بارگذاری نشد. صفحه را تازه‌سازی کنید و دوباره امتحان کنید.",
        secondary: ""
    },
    "AUTH-DISABLED": {
        primary: "ورود مهمان موقتاً در دسترس نیست. لطفاً کمی بعد دوباره امتحان کنید.",
        secondary: ""
    },
    "AUTH-CONFIG": {
        primary: "سرویس ورود موقتاً دچار مشکل شده است.",
        secondary: ""
    },
    "AUTH-RATE": {
        primary: "تعداد تلاش‌های ورود زیاد بوده است. کمی صبر کنید و دوباره امتحان کنید.",
        secondary: ""
    },
    "AUTH-UNKNOWN": {
        primary: "ورود انجام نشد. لطفاً دوباره امتحان کنید.",
        secondary: ""
    }
});

export function getAuthErrorView(code, {
    buildId = globalThis.wpBuildId || "",
    online = globalThis.navigator?.onLine,
    endpoints = null,
    userAgent = globalThis.navigator?.userAgent || ""
} = {}) {
    const safeCode = AUTH_ERROR_VIEWS[code] ? code : "AUTH-UNKNOWN";
    return {
        code: safeCode,
        primary: AUTH_ERROR_VIEWS[safeCode].primary,
        secondary: AUTH_ERROR_VIEWS[safeCode].secondary,
        retryLabel: "تلاش دوباره",
        backLabel: "بازگشت",
        safeReport: {
            code: safeCode,
            buildId: String(buildId || "development").slice(0, 80),
            browser: getBrowserBucket(userAgent),
            online: typeof online === "boolean" ? online : null,
            endpoints: sanitizeEndpointProbe(endpoints)
        }
    };
}

export function formatSafeErrorReport(report = {}) {
    return JSON.stringify({
        diagnosticCode: report.code || "AUTH-UNKNOWN",
        buildId: report.buildId || "development",
        browser: report.browser || "unknown",
        online: report.online,
        endpoints: sanitizeEndpointProbe(report.endpoints)
    }, null, 2);
}

function getBrowserBucket(userAgent) {
    const ua = String(userAgent || "");
    if (/Edg\//.test(ua)) return "edge";
    if (/CriOS|Chrome\//.test(ua)) return "chrome";
    if (/Firefox\//.test(ua)) return "firefox";
    if (/Safari\//.test(ua) && /Mobile|iPhone|iPad/i.test(ua)) return "mobile-safari";
    if (/Safari\//.test(ua)) return "safari";
    return "unknown";
}

function sanitizeEndpointProbe(endpoints) {
    if (!endpoints || typeof endpoints !== "object") return null;
    return {
        gstatic: sanitizeEndpoint(endpoints.gstatic),
        identityToolkit: sanitizeEndpoint(endpoints.identityToolkit)
    };
}

function sanitizeEndpoint(endpoint) {
    return {
        reachable: Boolean(endpoint?.reachable),
        status: Number.isFinite(Number(endpoint?.status)) ? Number(endpoint.status) : null
    };
}
