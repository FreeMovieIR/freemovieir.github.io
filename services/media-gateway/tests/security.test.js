import test from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, normalizeSourceUrl, redactUrl } from "../src/security.js";

test("source URL validation rejects credentials and unsupported protocols", () => {
    assert.throws(() => normalizeSourceUrl("file:///etc/passwd"));
    assert.throws(() => normalizeSourceUrl("https://user:pass@example.com/video.mkv"));
    assert.equal(normalizeSourceUrl("https://example.com/movie.mkv#secret").href, "https://example.com/movie.mkv");
});

test("private, loopback, link-local, and metadata addresses are not public", () => {
    for (const address of ["127.0.0.1", "10.0.0.4", "172.16.1.1", "192.168.0.1", "169.254.169.254", "::1", "fe80::1"]) {
        assert.equal(isPublicAddress(address), false, address);
    }
    assert.equal(isPublicAddress("8.8.8.8"), true);
    assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("redacted URLs remove query strings and fragments", () => {
    assert.equal(redactUrl("https://cdn.example.test/private/movie.mkv?token=secret#x"), "https://cdn.example.test/private/movie.mkv");
});
