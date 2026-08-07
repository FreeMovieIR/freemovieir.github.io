import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldUseEmulators } from "../../watch-party/js/firebase-client.js";

test("emulator mode is explicit/local and never automatic on production hostname", () => {
    assert.equal(shouldUseEmulators({ useEmulators: true }, "freemovieir.github.io"), false);
    assert.equal(shouldUseEmulators({}, "localhost"), true);
    assert.equal(shouldUseEmulators({}, "127.0.0.1"), true);
    assert.equal(shouldUseEmulators({ useEmulators: true }, "example.test"), true);
    assert.equal(shouldUseEmulators({}, "example.test"), false);
});
