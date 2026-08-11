export function createMediabunnyRelayFetch({ relayBaseUrl, tokenProvider, fetchFn = globalThis.fetch } = {}) {
    const baseUrl = normalizeRelayBaseUrl(relayBaseUrl);
    if (!baseUrl || typeof fetchFn !== "function") return null;
    return async function mediabunnyRelayFetch(input, init = {}) {
        const originalUrl = extractRequestUrl(input);
        const method = String(init?.method || input?.method || "GET").toUpperCase();
        const headers = new Headers(input?.headers || {});
        for (const [name, value] of new Headers(init?.headers || {})) headers.set(name, value);
        const range = headers.get("range");
        const token = await tokenProvider?.();
        const relayUrl = new URL("/v3/range", baseUrl);
        relayUrl.searchParams.set("url", originalUrl);
        const relayHeaders = new Headers();
        if (token) relayHeaders.set("authorization", `Bearer ${token}`);
        if (range) relayHeaders.set("range", range);
        return fetchFn(relayUrl.href, {
            method,
            headers: relayHeaders,
            signal: init?.signal,
            credentials: "omit",
            mode: "cors"
        });
    };
}

export function normalizeRelayBaseUrl(rawBaseUrl) {
    try {
        const url = new URL(String(rawBaseUrl || "").trim());
        if (url.protocol !== "https:" && !isLocalHttp(url)) return "";
        url.search = "";
        url.hash = "";
        return url.href.replace(/\/$/, "");
    } catch {
        return "";
    }
}

export function extractRequestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    if (input?.url) return String(input.url);
    return String(input || "");
}

function isLocalHttp(url) {
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
}
