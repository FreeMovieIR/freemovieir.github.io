import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldUseEmulators } from "../../watch-party/js/firebase-client.js";

test("emulator mode is explicit/local and never automatic on production hostname", () => {
    assert.equal(shouldUseEmulators({ environment: "production", useEmulators: true }, "freemovieir.github.io"), false);
    assert.equal(shouldUseEmulators({}, "localhost"), false);
    assert.equal(shouldUseEmulators({}, "127.0.0.1"), false);
    assert.equal(shouldUseEmulators({ environment: "local", useEmulators: true }, "localhost"), true);
    assert.equal(shouldUseEmulators({ environment: "local", useEmulators: true }, "example.test"), false);
    assert.equal(shouldUseEmulators({}, "example.test"), false);
});
