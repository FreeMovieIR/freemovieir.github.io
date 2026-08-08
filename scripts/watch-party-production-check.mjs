import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const configPath = resolve(root, args.config || "watch-party/runtime-config.js");
const runtimeConfig = await readFile(configPath, "utf8");

if (/BEGIN PRIVATE KEY|service_account|private_key|firebase-adminsdk/i.test(runtimeConfig)) {
    throw new Error("Generated runtime config contains private credential-looking data.");
}

const module = await import(`${pathToFileURL(configPath).href}?check=${Date.now()}`);
const config = module.watchPartyConfig;
if (!config) throw new Error("Runtime config does not export watchPartyConfig.");

if (config.environment === "production") {
    if (config.useEmulators !== false) throw new Error("Production runtime config enables emulators.");
    if ("emulators" in config) throw new Error("Production runtime config must not include emulator endpoints.");
    if (runtimeConfig.match(/127\.0\.0\.1|localhost|demo-freemovieir|__WATCH_PARTY_/i)) {
        throw new Error("Production runtime config contains local/test/template text.");
    }
    for (const key of ["apiKey", "authDomain", "databaseURL", "projectId", "appId"]) {
        if (!config.firebase?.[key]) throw new Error(`Production runtime config missing firebase.${key}.`);
    }
    const publicRooms = config.publicRooms;
    if (!publicRooms || typeof publicRooms !== "object") throw new Error("Production runtime config missing publicRooms.");
    for (const key of ["enabled", "creationEnabled", "maintenance", "forceDisableActiveRooms"]) {
        if (typeof publicRooms[key] !== "boolean") throw new Error(`Production publicRooms.${key} must be boolean.`);
    }
    if (publicRooms.forceDisableActiveRooms !== false) {
        throw new Error("Production publicRooms.forceDisableActiveRooms must remain false.");
    }
    if (publicRooms.creationEnabled === true && publicRooms.enabled !== true) {
        throw new Error("Production publicRooms.creationEnabled cannot be true while publicRooms.enabled is false.");
    }
    if (typeof publicRooms.functionTimeoutMs !== "number" || publicRooms.functionTimeoutMs < 1000) {
        throw new Error("Production publicRooms.functionTimeoutMs must be a sane number.");
    }
}

if (!config.rtc || !("turnCredentialsEndpoint" in config.rtc)) {
    throw new Error("Runtime config does not expose TURN credential endpoint field.");
}

if (!config.mediaGateway || !("enabled" in config.mediaGateway) || !("baseUrl" in config.mediaGateway)) {
    throw new Error("Runtime config does not expose mediaGateway fields.");
}
if (config.environment === "production" && config.mediaGateway.enabled && !/^https:\/\//i.test(config.mediaGateway.baseUrl || "")) {
    throw new Error("Production mediaGateway.baseUrl must use HTTPS when enabled.");
}

const rules = await readFile(resolve(root, "firebase/database.rules.json"), "utf8");
if (/\"\.read\"\s*:\s*true|\"\.write\"\s*:\s*true/.test(rules)) {
    throw new Error("Open Firebase rule pattern found in firebase/database.rules.json.");
}

console.log(`[watch-party:test:production] production-shape config checks passed for ${args.config || "watch-party/runtime-config.js"}.`);

function parseArgs(argv) {
    const parsed = {};
    for (const arg of argv) {
        const match = /^--([^=]+)=(.*)$/.exec(arg);
        if (match) parsed[match[1]] = match[2];
    }
    return parsed;
}
