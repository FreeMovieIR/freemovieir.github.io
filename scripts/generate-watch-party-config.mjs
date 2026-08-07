import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(root, "watch-party/runtime-config.template.js");
const outputPath = resolve(root, "watch-party/runtime-config.js");
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const environment = modeArg?.split("=")[1] || process.env.WATCH_PARTY_ENVIRONMENT || "test";

const requiredProduction = [
    "WATCH_PARTY_FIREBASE_API_KEY",
    "WATCH_PARTY_FIREBASE_AUTH_DOMAIN",
    "WATCH_PARTY_FIREBASE_DATABASE_URL",
    "WATCH_PARTY_FIREBASE_PROJECT_ID",
    "WATCH_PARTY_FIREBASE_APP_ID"
];

const defaults = environment === "production" ? {} : {
    WATCH_PARTY_FIREBASE_API_KEY: "demo-key",
    WATCH_PARTY_FIREBASE_AUTH_DOMAIN: "demo-freemovieir.firebaseapp.com",
    WATCH_PARTY_FIREBASE_DATABASE_URL: "http://127.0.0.1:9000?ns=demo-freemovieir-default-rtdb",
    WATCH_PARTY_FIREBASE_PROJECT_ID: "demo-freemovieir",
    WATCH_PARTY_FIREBASE_APP_ID: "1:1:web:demo",
    WATCH_PARTY_APP_CHECK_SITE_KEY: "",
    WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT: "",
    WATCH_PARTY_RTC_ICE_SERVERS: JSON.stringify([
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ])
};

function value(name) {
    return process.env[name] ?? defaults[name] ?? "";
}

function assertNoPrivateCredential(name, raw) {
    if (/BEGIN PRIVATE KEY|service_account|private_key/i.test(String(raw))) {
        throw new Error(`${name} looks like a private credential and must not be placed in frontend config.`);
    }
}

function redact(raw) {
    const text = String(raw || "");
    if (text.length <= 8) return "[redacted]";
    return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

if (environment === "production") {
    const missing = requiredProduction.filter((name) => !value(name));
    if (missing.length) {
        throw new Error(`Missing production Watch Party config variables: ${missing.join(", ")}`);
    }
}

const replacements = {
    __WATCH_PARTY_ENVIRONMENT__: environment,
    __WATCH_PARTY_FIREBASE_API_KEY__: value("WATCH_PARTY_FIREBASE_API_KEY"),
    __WATCH_PARTY_FIREBASE_AUTH_DOMAIN__: value("WATCH_PARTY_FIREBASE_AUTH_DOMAIN"),
    __WATCH_PARTY_FIREBASE_DATABASE_URL__: value("WATCH_PARTY_FIREBASE_DATABASE_URL"),
    __WATCH_PARTY_FIREBASE_PROJECT_ID__: value("WATCH_PARTY_FIREBASE_PROJECT_ID"),
    __WATCH_PARTY_FIREBASE_APP_ID__: value("WATCH_PARTY_FIREBASE_APP_ID"),
    __WATCH_PARTY_APP_CHECK_SITE_KEY__: value("WATCH_PARTY_APP_CHECK_SITE_KEY"),
    __WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT__: value("WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT")
};

for (const [name, raw] of Object.entries(replacements)) assertNoPrivateCredential(name, raw);

let iceServers = value("WATCH_PARTY_RTC_ICE_SERVERS") || "[]";
try {
    const parsed = JSON.parse(iceServers);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    for (const server of parsed) assertNoPrivateCredential("WATCH_PARTY_RTC_ICE_SERVERS", JSON.stringify(server));
    iceServers = JSON.stringify(parsed, null, 8);
} catch {
    throw new Error("WATCH_PARTY_RTC_ICE_SERVERS must be a JSON array.");
}

let template = await readFile(templatePath, "utf8");
for (const [token, raw] of Object.entries(replacements)) {
    template = template.replaceAll(token, escapeJsString(raw));
}
template = template
    .replaceAll("__WATCH_PARTY_APP_CHECK_ENABLED__", String(Boolean(value("WATCH_PARTY_APP_CHECK_SITE_KEY"))))
    .replaceAll("__WATCH_PARTY_RTC_ICE_SERVERS__", iceServers);

if (environment === "production" && /127\.0\.0\.1|localhost/.test(template.replace(/emulators:[\s\S]*?appCheck:/, "appCheck:"))) {
    throw new Error("Generated production config contains a local URL outside emulator documentation.");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, template, "utf8");
console.log(`[watch-party:build] runtime config generated for ${environment}. Values are not printed. Project: ${redact(value("WATCH_PARTY_FIREBASE_PROJECT_ID"))}`);

function escapeJsString(raw) {
    return String(raw || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}
