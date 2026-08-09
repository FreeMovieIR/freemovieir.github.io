import { rewriteManifest } from "./memory-object-store.js";

export class CloudStorageObjectStore {
    constructor({ storage, bucketName, signingExpiresMs, now = () => Date.now() } = {}) {
        if (!storage) throw new Error("CloudStorageObjectStore requires a Storage client.");
        if (!bucketName) throw new Error("CloudStorageObjectStore requires MEDIA_GATEWAY_BUCKET.");
        this.storage = storage;
        this.bucket = storage.bucket(bucketName);
        this.signingExpiresMs = signingExpiresMs;
        this.now = now;
    }

    async putObject(name, body, metadata = {}) {
        const file = this.bucket.file(name);
        await file.save(body, {
            resumable: false,
            metadata: {
                contentType: metadata.contentType || "application/octet-stream",
                cacheControl: metadata.cacheControl || "private, max-age=60"
            }
        });
        return { name };
    }

    async putManifest(name, text, metadata = {}) {
        return this.putObject(name, text, { contentType: "application/vnd.apple.mpegurl", ...metadata });
    }

    async putSegment(name, body, metadata = {}) {
        return this.putObject(name, body, { contentType: metadata.contentType || "video/mp2t", ...metadata });
    }

    async exists(name) {
        const [exists] = await this.bucket.file(name).exists();
        return exists;
    }

    async readText(name) {
        const [buffer] = await this.bucket.file(name).download();
        return buffer.toString("utf8");
    }

    async deletePrefix(prefix) {
        await this.bucket.deleteFiles({ prefix, force: true });
    }

    async createPlaybackAccess({ manifestObject, expiresAt }) {
        const manifestText = await this.readText(manifestObject);
        const basePrefix = manifestObject.replace(/[^/]+$/, "");
        const pendingResources = [];
        const rewritten = rewriteManifest(manifestText, (segment) => {
            const objectName = `${basePrefix}${segment}`;
            const placeholder = `__PENDING_SIGNED_RESOURCE_${pendingResources.length}__`;
            pendingResources.push({ placeholder, objectName });
            return placeholder;
        });
        let signedManifest = rewritten;
        const signedUrlCache = new Map();
        for (const resource of pendingResources) {
            let url = signedUrlCache.get(resource.objectName);
            if (!url) {
                url = await this.signedReadUrl(resource.objectName, expiresAt);
                signedUrlCache.set(resource.objectName, url);
            }
            signedManifest = signedManifest.replaceAll(resource.placeholder, url);
        }
        const signedManifestObject = `${manifestObject.replace(/\.m3u8$/i, "")}.signed.${expiresAt}.m3u8`;
        await this.putManifest(signedManifestObject, signedManifest, {
            cacheControl: "private, max-age=30"
        });
        return {
            type: "hls",
            manifestUrl: await this.signedReadUrl(signedManifestObject, expiresAt),
            expiresAt
        };
    }

    async signedReadUrl(objectName, expiresAt) {
        const [url] = await this.bucket.file(objectName).getSignedUrl({
            action: "read",
            version: "v4",
            expires: new Date(expiresAt)
        });
        return url;
    }
}
