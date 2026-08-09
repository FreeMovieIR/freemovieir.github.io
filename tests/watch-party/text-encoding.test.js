import test from "node:test";
import assert from "node:assert/strict";
import {
    auditHtmlCharset,
    findMojibakeMarkers,
    validateUtf8Buffer
} from "../../scripts/check-text-encoding.mjs";

test("valid UTF-8 Persian text passes byte validation and mojibake scan", () => {
    const persian = "\u0633\u06cc\u0646\u0645\u0627\u06cc \u0639\u0645\u0648\u0645\u06cc \u0641\u06cc\u0631\u06cc \u0645\u0648\u0648\u06cc";
    const utf8 = validateUtf8Buffer(Buffer.from(persian, "utf8"));

    assert.equal(utf8.valid, true);
    assert.equal(findMojibakeMarkers(utf8.text).length, 0);
});

test("known Persian mojibake is detected", () => {
    const mojibake = "\u00d8\u00b3\u00db\u0152\u00d9\u2020\u00d9\u2026\u00d8\u00a7\u00db\u0152 \u00d8\u00b9\u00d9\u2026\u00d9\u02c6\u00d9\u2026\u00db\u0152";
    const hits = findMojibakeMarkers(mojibake);

    assert.equal(hits.length, 1);
    assert.match(hits[0].label, /Persian UTF-8/);
});

test("known emoji mojibake is detected", () => {
    const mojibake = "\u00f0\u0178\u00a4\u008d";
    const hits = findMojibakeMarkers(mojibake);

    assert.equal(hits.length, 1);
    assert.match(hits[0].label, /emoji/);
});

test("invalid UTF-8 bytes are rejected", () => {
    const invalid = validateUtf8Buffer(Buffer.from([0xc3, 0x28]));

    assert.equal(invalid.valid, false);
});

test("HTML charset audit accepts UTF-8 and rejects missing or conflicting declarations", () => {
    assert.equal(auditHtmlCharset("<!doctype html><meta charset=\"UTF-8\"><title>x</title>").valid, true);
    assert.equal(auditHtmlCharset("<!doctype html><title>x</title>").valid, false);
    assert.equal(auditHtmlCharset("<meta charset=\"windows-1256\"><title>x</title>").valid, false);
});
