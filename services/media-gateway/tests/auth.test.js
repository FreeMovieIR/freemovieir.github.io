import test from "node:test";
import assert from "node:assert/strict";
import { extractBearerToken, verifyFirebaseIdToken } from "../src/auth.js";

test("bearer extraction accepts Firebase JWT shape only", () => {
    assert.equal(extractBearerToken("Bearer aaa.bbb.ccc"), "aaa.bbb.ccc");
    assert.equal(extractBearerToken("Bearer not-a-jwt"), "");
    assert.equal(extractBearerToken("Basic aaa.bbb.ccc"), "");
});

test("Firebase ID token verifier rejects missing project and malformed token safely", async () => {
    await assert.rejects(
        () => verifyFirebaseIdToken("aaa.bbb.ccc", { projectId: "" }),
        /Firebase project ID is required/
    );
    await assert.rejects(
        () => verifyFirebaseIdToken("not-a-token", { projectId: "demo-freemovieir" }),
        /Invalid Firebase ID token/
    );
});
