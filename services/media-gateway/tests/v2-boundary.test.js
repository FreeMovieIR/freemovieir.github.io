import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateProductionGatewayConfig, loadGatewayConfig } from "../src/v2/config.js";
import { normalizeDedupUrl, makeJobKey } from "../src/v2/hash.js";

test("production Gateway config requires durable cloud resources and rejects local mode", () => {
    assert.throws(() => validateProductionGatewayConfig(loadGatewayConfig({
        MEDIA_GATEWAY_LOCAL_MODE: "true"
    })), /LOCAL_MODE/);
    assert.equal(validateProductionGatewayConfig(loadGatewayConfig({
        MEDIA_GATEWAY_PROJECT_ID: "freemovieir-fd57a",
        MEDIA_GATEWAY_DATABASE_URL: "https://freemovieir-fd57a-default-rtdb.firebaseio.com",
        MEDIA_GATEWAY_BUCKET: "freemovieir-media-temp",
        MEDIA_GATEWAY_REGION: "us-central1",
        MEDIA_GATEWAY_WORKER_JOB: "freemovieir-media-worker"
    })), true);
});

test("production server entry does not own authoritative memory, filesystem playback, or API background conversion", () => {
    const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
    assert.equal(/new\s+Map\s*\(/.test(server), false);
    assert.equal(/MEDIA_GATEWAY_OUTPUT_DIR|outputDir|\/media\//.test(server), false);
    assert.equal(/runJob\s*\(|\.catch\s*\(\s*\(.*Conversion/i.test(server), false);
});

test("dedup key normalizes URL fragments, casing, profile, and policy without raw path use", () => {
    const a = makeJobKey("HTTPS://Example.COM:443/path/movie.mkv#fragment", { browserFamily: "Safari" });
    const b = makeJobKey("https://example.com/path/movie.mkv", { browserFamily: "Safari" });
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.equal(a.includes("movie"), false);
    assert.equal(normalizeDedupUrl("https://Example.com:443/a.mkv#x"), "https://example.com/a.mkv");
});
