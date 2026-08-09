import { createPublicKey, verify as verifySignature } from "node:crypto";

const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const MAX_CLOCK_SKEW_SECONDS = 300;

let cachedCerts = null;
let cachedCertsUntil = 0;

export function extractBearerToken(header = "") {
    const match = String(header || "").match(/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    return match ? match[1] : "";
}

export async function verifyFirebaseIdToken(token, { projectId, fetchImpl = fetch, now = Date.now() } = {}) {
    if (!projectId) throw authError("auth-config-missing", "Firebase project ID is required.");
    const parts = String(token || "").split(".");
    if (parts.length !== 3) throw authError("auth-token-invalid", "Invalid Firebase ID token.");
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJwtJson(headerPart);
    const payload = decodeJwtJson(payloadPart);
    if (header.alg !== "RS256" || !header.kid) throw authError("auth-token-invalid", "Invalid Firebase ID token.");
    const expectedIssuer = `https://securetoken.google.com/${projectId}`;
    if (payload.aud !== projectId || payload.iss !== expectedIssuer) {
        throw authError("auth-token-project", "Firebase ID token does not belong to this project.");
    }
    const seconds = Math.floor(now / 1000);
    if (Number(payload.exp || 0) + MAX_CLOCK_SKEW_SECONDS < seconds) throw authError("auth-token-expired", "Firebase ID token expired.");
    if (Number(payload.iat || 0) - MAX_CLOCK_SKEW_SECONDS > seconds) throw authError("auth-token-invalid", "Firebase ID token issued in the future.");
    if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
        throw authError("auth-token-invalid", "Firebase ID token subject is invalid.");
    }
    const certs = await getSecureTokenCerts({ fetchImpl, now });
    const cert = certs[header.kid];
    if (!cert) throw authError("auth-token-invalid", "Firebase ID token certificate is unknown.");
    const signed = `${headerPart}.${payloadPart}`;
    const ok = verifySignature(
        "RSA-SHA256",
        Buffer.from(signed),
        createPublicKey(cert),
        base64UrlDecode(signaturePart)
    );
    if (!ok) throw authError("auth-token-invalid", "Firebase ID token signature is invalid.");
    return {
        uid: payload.sub,
        projectId,
        authTime: payload.auth_time || null
    };
}

export async function authorizeRequest(request, options = {}) {
    if (options.requireAuth === false) return { uid: "local-dev", projectId: options.projectId || "local" };
    const token = extractBearerToken(request.headers.authorization || "");
    if (!token) throw authError("auth-token-required", "Firebase ID token is required.");
    return verifyFirebaseIdToken(token, options);
}

async function getSecureTokenCerts({ fetchImpl, now }) {
    if (cachedCerts && cachedCertsUntil > now) return cachedCerts;
    const response = await fetchImpl(CERT_URL, { headers: { accept: "application/json" } });
    if (!response.ok) throw authError("auth-cert-unreachable", "Firebase token certificates are unreachable.");
    const cacheControl = response.headers?.get?.("cache-control") || "";
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
    cachedCerts = await response.json();
    cachedCertsUntil = now + Math.max(60, maxAge) * 1000;
    return cachedCerts;
}

function decodeJwtJson(part) {
    try {
        return JSON.parse(base64UrlDecode(part).toString("utf8"));
    } catch {
        throw authError("auth-token-invalid", "Invalid Firebase ID token.");
    }
}

function base64UrlDecode(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

function authError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.status = code === "auth-token-required" ? 401 : 403;
    return error;
}
