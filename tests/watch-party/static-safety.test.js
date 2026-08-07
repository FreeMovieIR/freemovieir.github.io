import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function files(root) {
    return readdirSync(root).flatMap((entry) => {
        const path = join(root, entry);
        return statSync(path).isDirectory() ? files(path) : [path];
    });
}

test("watch-party rendering path does not use unsafe innerHTML", () => {
    const matches = files("watch-party").filter((file) => file.endsWith(".js")).filter((file) => readFileSync(file, "utf8").includes("innerHTML"));
    assert.deepEqual(matches, []);
});

test("Firebase rules do not contain globally open read/write", () => {
    const rules = readFileSync("firebase/database.rules.json", "utf8");
    assert.equal(rules.includes('".read": true'), false);
    assert.equal(rules.includes('".write": true'), false);
});
