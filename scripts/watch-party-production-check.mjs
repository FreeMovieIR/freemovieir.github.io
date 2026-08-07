import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const runtimeConfig = await readFile(resolve(root, "watch-party/runtime-config.js"), "utf8");
const files = [
    "watch-party/index.html",
    "watch-party/js/firebase-client.js",
    "watch-party/js/service-availability.js",
    "watch-party/runtime-config.js"
];

if (/BEGIN PRIVATE KEY|service_account|private_key/i.test(runtimeConfig)) {
    throw new Error("Generated runtime config contains private credential-looking data.");
}

const productionLike = runtimeConfig.includes('environment: "production"');
if (productionLike && /useEmulators:\s*true/.test(runtimeConfig)) {
    throw new Error("Production runtime config enables emulators.");
}

for (const file of files) {
    const content = await readFile(resolve(root, file), "utf8");
    if (/\.read"\s*:\s*true|\.write"\s*:\s*true/.test(content)) {
        throw new Error(`Open Firebase rule pattern found in ${file}`);
    }
}

if (!runtimeConfig.includes("turnCredentialsEndpoint")) {
    throw new Error("Runtime config does not expose TURN credential endpoint field.");
}

console.log("[watch-party:test:production] production-shape config checks passed.");
