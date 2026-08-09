import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, isPublicAddress, normalizeSourceUrl, redactUrl } from "../src/security.js";

test("source URL validation rejects credentials and unsupported protocols", () => {
    assert.throws(() => normalizeSourceUrl("file:///etc/passwd"));
    assert.throws(() => normalizeSourceUrl("https://user:pass@example.com/video.mkv"));
    assert.equal(normalizeSourceUrl("https://example.com/movie.mkv#secret").href, "https://example.com/movie.mkv");
});

test("private, loopback, link-local, and metadata addresses are not public", () => {
    for (const address of ["127.0.0.1", "10.0.0.4", "172.16.1.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "fd00::1"]) {
        assert.equal(isPublicAddress(address), false, address);
    }
    assert.equal(isPublicAddress("8.8.8.8"), true);
    assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("public URL assertion blocks private DNS answers and metadata host", async () => {
    await assert.rejects(
        () => assertPublicHttpUrl("https://cdn.example.test/movie.mkv", {
            lookup: async () => [{ address: "10.1.2.3", family: 4 }]
        }),
        /Private/
    );
    await assert.rejects(
        () => assertPublicHttpUrl("https://metadata.google.internal/movie.mkv", {
            lookup: async () => [{ address: "8.8.8.8", family: 4 }]
        }),
        /Metadata/
    );
    const url = await assertPublicHttpUrl("https://cdn.example.test/movie.mkv?token=private", {
        lookup: async () => [{ address: "8.8.8.8", family: 4 }]
    });
    assert.equal(url.hostname, "cdn.example.test");
});

test("redacted URLs remove query strings and fragments", () => {
    assert.equal(redactUrl("https://cdn.example.test/private/movie.mkv?token=secret#x"), "https://cdn.example.test/private/movie.mkv");
});
