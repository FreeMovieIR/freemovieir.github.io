import { Readable } from "node:stream";
import { assertPublicHttpUrl } from "../security.js";
import { SAFE_ERROR } from "./constants.js";
import { gatewayError, publicError, safeLog } from "./errors.js";

const MAX_REDIRECTS = 5;
const SAFE_RESPONSE_HEADERS = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified"
];

export async function handleRangeRelay(request, response, { tokenVerifier, config, cors, url }) {
    const method = request.method || "GET";
    if (!["GET", "HEAD"].includes(method)) {
        return writeRelayJson(response, 405, publicError(gatewayError(405, SAFE_ERROR.BAD_REQUEST, "Method not allowed.")), cors);
    }

    let upstreamResponse = null;
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    try {
        await tokenVerifier.verifyRequest(request);
        const sourceUrl = await normalizeRelaySource(url?.searchParams?.get("url"), config);
        const range = getSingleRangeHeader(request);
        if (method === "GET" && !range) throw gatewayError(400, SAFE_ERROR.BAD_REQUEST, "A single byte Range header is required.");

        upstreamResponse = await fetchRelayUpstream(sourceUrl, {
            method,
            range,
            signal: controller.signal,
            config
        });
        const status = upstreamResponse.status;
        safeLog("range-relay", { method, upstreamStatus: status });

        if (range && status === 200) {
            await cancelUpstreamBody(upstreamResponse);
            return writeRelayJson(response, 502, publicError(gatewayError(502, SAFE_ERROR.RANGE_UNSUPPORTED, "Upstream ignored Range.")), cors);
        }
        if (![200, 206, 416].includes(status)) {
            await cancelUpstreamBody(upstreamResponse);
            return writeRelayJson(response, status >= 400 && status < 500 ? status : 502, publicError(gatewayError(502, SAFE_ERROR.SOURCE_UNAVAILABLE, "Upstream source is unavailable.")), cors);
        }

        const headers = {
            "cache-control": "no-store",
            ...corsHeaders(cors, true),
            ...relayResponseHeaders(upstreamResponse.headers)
        };
        response.writeHead(status, headers);
        if (method === "HEAD" || !upstreamResponse.body) {
            response.end();
            return;
        }
        await pipeWebBody(upstreamResponse.body, response);
    } catch (error) {
        await cancelUpstreamBody(upstreamResponse);
        if (response.headersSent) {
            response.destroy();
            return;
        }
        const status = Number(error?.status || 500);
        return writeRelayJson(response, status, publicError(error), cors);
    }
}

export async function fetchRelayUpstream(sourceUrl, { method = "GET", range = "", signal, config = {} } = {}) {
    let currentUrl = sourceUrl;
    const fetchFn = config?.relay?.fetchFn || globalThis.fetch;
    if (typeof fetchFn !== "function") throw gatewayError(500, SAFE_ERROR.INTERNAL, "Fetch is unavailable.");
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const headers = range ? { range } : {};
        const response = await fetchFn(currentUrl.href, {
            method,
            headers,
            redirect: "manual",
            signal
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        if (redirectCount === MAX_REDIRECTS) {
            await cancelUpstreamBody(response);
            throw gatewayError(508, SAFE_ERROR.SOURCE_BLOCKED, "Too many redirects.");
        }
        const location = response.headers?.get?.("location");
        await cancelUpstreamBody(response);
        if (!location) throw gatewayError(502, SAFE_ERROR.SOURCE_UNAVAILABLE, "Redirect location is missing.");
        const nextUrl = new URL(location, currentUrl);
        currentUrl = await normalizeRelaySource(nextUrl.href, config);
        safeLog("range-relay-redirect", { redirectCount: redirectCount + 1 });
    }
    throw gatewayError(508, SAFE_ERROR.SOURCE_BLOCKED, "Too many redirects.");
}

export async function normalizeRelaySource(rawUrl, config = {}) {
    try {
        return await assertPublicHttpUrl(rawUrl, {
            lookup: config?.relay?.lookup
        });
    } catch {
        throw gatewayError(400, SAFE_ERROR.SOURCE_BLOCKED, "Source URL is blocked.");
    }
}

export function getSingleRangeHeader(request) {
    const rawRangeCount = Array.isArray(request.rawHeaders)
        ? request.rawHeaders.filter((name, index) => index % 2 === 0 && name.toLowerCase() === "range").length
        : 0;
    if (rawRangeCount > 1) throw gatewayError(400, SAFE_ERROR.BAD_REQUEST, "Only one Range header is supported.");
    const range = String(request.headers?.range || "").trim();
    if (!range) return "";
    if (!/^bytes=(?:\d+-\d*|\d*-\d+)$/i.test(range)) {
        throw gatewayError(400, SAFE_ERROR.BAD_REQUEST, "Only simple byte ranges are supported.");
    }
    if (range.includes(",")) throw gatewayError(400, SAFE_ERROR.BAD_REQUEST, "Multiple byte ranges are not supported.");
    return range;
}

export function relayResponseHeaders(headers) {
    const output = {};
    for (const name of SAFE_RESPONSE_HEADERS) {
        const value = headers?.get?.(name);
        if (value) output[name] = value;
    }
    return output;
}

export function corsHeaders(cors, exposeRangeHeaders = false) {
    if (!cors?.origin || !cors.allowed) return {};
    return {
        "access-control-allow-origin": cors.origin,
        "vary": "Origin",
        ...(exposeRangeHeaders ? {
            "access-control-expose-headers": "Content-Range,Accept-Ranges,Content-Length,Content-Type,ETag,Last-Modified"
        } : {})
    };
}

async function pipeWebBody(body, response) {
    const stream = Readable.fromWeb ? Readable.fromWeb(body) : Readable.from(body);
    await new Promise((resolve, reject) => {
        stream.once("error", reject);
        response.once("error", reject);
        response.once("finish", resolve);
        stream.pipe(response);
    });
}

async function cancelUpstreamBody(response) {
    try {
        await response?.body?.cancel?.();
    } catch {}
}

function writeRelayJson(response, status, body, cors = null) {
    response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...corsHeaders(cors, false)
    });
    response.end(JSON.stringify(body));
}
