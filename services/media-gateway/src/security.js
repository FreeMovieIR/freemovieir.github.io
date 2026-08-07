import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_V4 = [
    ["10.0.0.0", 8],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["0.0.0.0", 8],
    ["100.64.0.0", 10]
];

const BLOCKED_HOSTS = new Set([
    "metadata.google.internal",
    "169.254.169.254"
]);

export function normalizeSourceUrl(raw) {
    const url = new URL(String(raw || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS media URLs are allowed.");
    if (url.username || url.password) throw new Error("Credentials in media URLs are not allowed.");
    url.hash = "";
    return url;
}

export async function assertPublicHttpUrl(rawUrl) {
    const url = normalizeSourceUrl(rawUrl);
    if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Metadata endpoints are blocked.");
    const addresses = await dns.lookup(url.hostname, { all: true, verbatim: false });
    if (!addresses.length) throw new Error("Source host did not resolve.");
    for (const address of addresses) {
        if (!isPublicAddress(address.address)) throw new Error("Private, loopback, and link-local addresses are blocked.");
    }
    return url;
}

export function isPublicAddress(address) {
    if (net.isIP(address) === 4) {
        const value = ipv4ToInt(address);
        return !PRIVATE_V4.some(([base, bits]) => {
            const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
            return (value & mask) === (ipv4ToInt(base) & mask);
        });
    }
    if (net.isIP(address) === 6) {
        const lower = address.toLowerCase();
        return !(
            lower === "::1"
            || lower.startsWith("fc")
            || lower.startsWith("fd")
            || lower.startsWith("fe80")
            || lower.startsWith("::ffff:127.")
        );
    }
    return false;
}

export function redactUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        url.search = "";
        url.hash = "";
        return url.href;
    } catch {
        return "[invalid-url]";
    }
}

function ipv4ToInt(address) {
    return address.split(".").reduce((value, part) => ((value << 8) + Number(part)) >>> 0, 0);
}
