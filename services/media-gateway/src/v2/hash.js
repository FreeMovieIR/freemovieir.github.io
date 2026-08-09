import { createHash } from "node:crypto";
import { GATEWAY_POLICY_VERSION } from "./constants.js";

export function sha256Hex(value) {
    return createHash("sha256").update(String(value)).digest("hex");
}

export function normalizeDedupUrl(url) {
    const parsed = new URL(String(url));
    parsed.hash = "";
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
        parsed.port = "";
    }
    return parsed.href;
}

export function normalizeDeviceProfile(profile = {}) {
    return {
        profile: String(profile.profile || "unknown").slice(0, 32),
        browserFamily: String(profile.browserFamily || "unknown").slice(0, 32),
        nativeHls: Boolean(profile.nativeHls),
        mediaSource: Boolean(profile.mediaSource),
        managedMediaSource: Boolean(profile.managedMediaSource),
        webCodecsVideo: Boolean(profile.webCodecsVideo),
        webCodecsAudio: Boolean(profile.webCodecsAudio),
        supportsHevc: Boolean(profile.supportsHevc)
    };
}

export function makeProfileHash(profile = {}) {
    return sha256Hex(JSON.stringify(normalizeDeviceProfile(profile)));
}

export function makeJobKey(sourceUrl, profile = {}, policyVersion = GATEWAY_POLICY_VERSION) {
    const normalizedUrl = normalizeDedupUrl(sourceUrl);
    const profileHash = makeProfileHash(profile);
    return sha256Hex(`${normalizedUrl}|${profileHash}|${policyVersion}`);
}

export function hashSourceUrl(sourceUrl) {
    return sha256Hex(normalizeDedupUrl(sourceUrl));
}
