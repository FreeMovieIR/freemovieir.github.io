export class MemoryObjectStore {
    constructor({ now = () => Date.now() } = {}) {
        this.now = now;
        this.objects = new Map();
    }

    async putObject(name, body, metadata = {}) {
        this.objects.set(name, {
            body: Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body)),
            metadata,
            updatedAt: this.now()
        });
        return { name };
    }

    async putManifest(name, text, metadata = {}) {
        return this.putObject(name, text, { contentType: "application/vnd.apple.mpegurl", ...metadata });
    }

    async putSegment(name, body, metadata = {}) {
        return this.putObject(name, body, { contentType: "video/mp2t", ...metadata });
    }

    async exists(name) {
        return this.objects.has(name);
    }

    async readText(name) {
        const object = this.objects.get(name);
        return object ? object.body.toString("utf8") : "";
    }

    async deletePrefix(prefix) {
        for (const name of [...this.objects.keys()]) {
            if (name.startsWith(prefix)) this.objects.delete(name);
        }
    }

    async createPlaybackAccess({ manifestObject, expiresAt }) {
        if (!this.objects.has(manifestObject)) return null;
        const manifest = this.objects.get(manifestObject).body.toString("utf8");
        const rewritten = rewriteManifest(manifest, (segment) => `memory://signed/${encodeURIComponent(segment)}?expires=${expiresAt}`);
        const accessObject = `${manifestObject.replace(/\.m3u8$/i, "")}.signed.${expiresAt}.m3u8`;
        await this.putManifest(accessObject, rewritten, { temporary: true });
        return {
            type: "hls",
            manifestUrl: `memory://signed/${encodeURIComponent(accessObject)}?expires=${expiresAt}`,
            expiresAt
        };
    }
}

export function rewriteManifest(text, signSegment) {
    return String(text || "").split(/\r?\n/).map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith("#")) return rewriteDirectiveUriAttributes(line, signSegment);
        if (!shouldSignManifestUri(trimmed)) return line;
        return signSegment(trimmed);
    }).join("\n");
}

function rewriteDirectiveUriAttributes(line, signUri) {
    return String(line).replace(/\bURI="([^"]*)"/g, (match, uri) => {
        if (!shouldSignManifestUri(uri)) return match;
        return `URI="${signUri(uri)}"`;
    });
}

function shouldSignManifestUri(uri) {
    const value = String(uri || "").trim();
    if (!value) return false;
    if (/^data:/i.test(value)) return false;
    return !/^[a-z][a-z0-9+.-]*:/i.test(value);
}
