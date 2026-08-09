import test from "node:test";
import assert from "node:assert/strict";
import { rewriteManifest, MemoryObjectStore } from "../src/v2/stores/memory-object-store.js";
import { CloudStorageObjectStore } from "../src/v2/stores/cloud-storage-object-store.js";

test("rewriteManifest signs EXT-X-MAP URI attributes and media segment lines", () => {
    const signed = [];
    const output = rewriteManifest([
        "#EXTM3U",
        "#EXT-X-MAP:URI=\"init.mp4\"",
        "#EXTINF:4.0,",
        "segment0.m4s",
        "#EXT-X-ENDLIST"
    ].join("\n"), (uri) => {
        signed.push(uri);
        return `signed://${uri}`;
    });

    assert.deepEqual(signed, ["init.mp4", "segment0.m4s"]);
    assert.match(output, /#EXT-X-MAP:URI="signed:\/\/init\.mp4"/);
    assert.equal(output.includes("URI=\"init.mp4\""), false);
    assert.match(output, /^signed:\/\/segment0\.m4s$/m);
});

test("rewriteManifest preserves data URIs and rewrites every repeated local URI occurrence", () => {
    const signed = [];
    const dataUri = "data:application/octet-stream;base64,AAAA";
    const output = rewriteManifest([
        "#EXTM3U",
        `#EXT-X-MAP:URI="${dataUri}"`,
        "#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"",
        "#EXT-X-MAP:URI=\"init.mp4\"",
        "#EXT-X-MAP:URI=\"init.mp4\"",
        "segment0.m4s",
        "segment0.m4s"
    ].join("\n"), (uri) => {
        signed.push(uri);
        return `signed-${signed.length}-${uri}`;
    });

    assert.deepEqual(signed, ["key.bin", "init.mp4", "init.mp4", "segment0.m4s", "segment0.m4s"]);
    assert.match(output, new RegExp(`#EXT-X-MAP:URI="${dataUri}"`));
    assert.match(output, /#EXT-X-KEY:METHOD=AES-128,URI="signed-1-key\.bin"/);
    assert.match(output, /#EXT-X-MAP:URI="signed-2-init\.mp4"/);
    assert.match(output, /#EXT-X-MAP:URI="signed-3-init\.mp4"/);
    assert.match(output, /^signed-4-segment0\.m4s$/m);
    assert.match(output, /^signed-5-segment0\.m4s$/m);
});

test("MemoryObjectStore playback access signs init maps and segments", async () => {
    const store = new MemoryObjectStore({ now: () => 1_700_000_000_000 });
    await store.putManifest("jobs/job1/index.m3u8", [
        "#EXTM3U",
        "#EXT-X-MAP:URI=\"init.mp4\"",
        "#EXTINF:4.0,",
        "segment0.m4s"
    ].join("\n"));

    const access = await store.createPlaybackAccess({
        manifestObject: "jobs/job1/index.m3u8",
        expiresAt: 1_700_000_600_000
    });
    const signedManifestObject = decodeURIComponent(access.manifestUrl.match(/^memory:\/\/signed\/([^?]+)/)[1]);
    const signedManifest = await store.readText(signedManifestObject);

    assert.match(signedManifest, /#EXT-X-MAP:URI="memory:\/\/signed\/init\.mp4\?expires=1700000600000"/);
    assert.match(signedManifest, /^memory:\/\/signed\/segment0\.m4s\?expires=1700000600000$/m);
    assert.equal(signedManifest.includes("URI=\"init.mp4\""), false);
});

test("CloudStorageObjectStore playback access signs EXT-X-MAP and segment references with mocked Storage", async () => {
    const storage = new MockStorage({
        "jobs/job1/index.m3u8": [
            "#EXTM3U",
            "#EXT-X-MAP:URI=\"init.mp4\"",
            "#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"",
            "#EXTINF:4.0,",
            "segment0.m4s",
            "#EXTINF:4.0,",
            "segment0.m4s"
        ].join("\n")
    });
    const store = new CloudStorageObjectStore({
        storage,
        bucketName: "private-bucket",
        signingExpiresMs: 600_000,
        now: () => 1_700_000_000_000
    });

    const access = await store.createPlaybackAccess({
        manifestObject: "jobs/job1/index.m3u8",
        expiresAt: 1_700_000_600_000
    });
    const signedManifest = storage.saved.get("jobs/job1/index.signed.1700000600000.m3u8").toString("utf8");

    assert.equal(access.type, "hls");
    assert.match(access.manifestUrl, /^https:\/\/signed\.example\.test\//);
    assert.match(signedManifest, /#EXT-X-MAP:URI="https:\/\/signed\.example\.test\/jobs%2Fjob1%2Finit\.mp4\?expires=1700000600000"/);
    assert.match(signedManifest, /#EXT-X-KEY:METHOD=AES-128,URI="https:\/\/signed\.example\.test\/jobs%2Fjob1%2Fkey\.bin\?expires=1700000600000"/);
    assert.equal((signedManifest.match(/^https:\/\/signed\.example\.test\/jobs%2Fjob1%2Fsegment0\.m4s\?expires=1700000600000$/gm) || []).length, 2);
    assert.equal(signedManifest.includes("URI=\"init.mp4\""), false);
    assert.deepEqual(new Set(storage.signedNames), new Set([
        "jobs/job1/init.mp4",
        "jobs/job1/key.bin",
        "jobs/job1/segment0.m4s",
        "jobs/job1/index.signed.1700000600000.m3u8"
    ]));
});

class MockStorage {
    constructor(initialObjects = {}) {
        this.objects = new Map(Object.entries(initialObjects).map(([name, body]) => [name, Buffer.from(body)]));
        this.saved = new Map();
        this.signedNames = [];
    }

    bucket() {
        return {
            file: (name) => ({
                save: async (body) => {
                    const buffer = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body));
                    this.objects.set(name, buffer);
                    this.saved.set(name, buffer);
                },
                exists: async () => [this.objects.has(name)],
                download: async () => [this.objects.get(name) || Buffer.from("")],
                getSignedUrl: async ({ expires }) => {
                    this.signedNames.push(name);
                    return [`https://signed.example.test/${encodeURIComponent(name)}?expires=${expires.getTime()}`];
                }
            }),
            deleteFiles: async () => {}
        };
    }
}
