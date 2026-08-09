import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.PAGES_PREVIEW_PORT || 8081);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function command(name) {
    return process.platform === "win32" ? `${name}.cmd` : name;
}

function canBindPort(port) {
    return new Promise((resolve) => {
        const server = createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => server.close(() => resolve(true)));
        server.listen(port, HOST);
    });
}

async function waitForHttp(url, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function startPreviewServer() {
    const child = spawn(command("http-server"), ["dist", "-p", String(PORT), "-a", HOST, "-c-1"], {
        cwd: process.cwd(),
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    return child;
}

async function stopProcess(child) {
    if (!child || child.killed) return;
    if (process.platform === "win32" && child.pid) {
        spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        await Promise.race([
            new Promise((resolve) => child.once("exit", resolve)),
            delay(3000)
        ]);
        return;
    }
    child.kill();
    await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(3000)
    ]);
    if (!child.killed) child.kill("SIGKILL");
}

async function assertNotServed(pathname) {
    const response = await fetch(`${BASE_URL}${pathname}`, { cache: "no-store" });
    if (response.status !== 404) {
        throw new Error(`Source-only path is served from dist: ${pathname} returned ${response.status}`);
    }
}

if (!existsSync("dist/watch-party/index.html")) {
    throw new Error("dist/ is missing. Run npm run pages:build first.");
}

if (!(await canBindPort(PORT))) {
    throw new Error(`Port ${PORT} is already in use. Stop the existing preview server and retry.`);
}

let server;
let browser;
try {
    server = startPreviewServer();
    await waitForHttp(`${BASE_URL}/watch-party/`);

    browser = await chromium.launch({
        headless: true,
        executablePath: existsSync(chromePath) ? chromePath : undefined
    });

    const context = await browser.newContext();
    await installFirebaseSdkMocks(context);
    const page = await context.newPage();
    const requests = [];
    const sameOriginFailures = [];

    page.on("request", (request) => requests.push(request.url()));
    page.on("response", (response) => {
        const url = response.url();
        if (url.startsWith(BASE_URL) && response.status() >= 400) {
            sameOriginFailures.push(`${response.status()} ${url}`);
        }
    });

    for (const route of ["/", "/player/", "/watch-party/", "/watch-party/public/", "/movie/", "/series/", "/airing-today-tv-show/"]) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
        await page.locator("body").waitFor({ state: "visible" });
        await delay(350);
    }

    const runtimeRequests = requests.filter((url) => url.includes("/watch-party/runtime-config.js"));
    if (runtimeRequests.length === 0) {
        throw new Error("Watch Party did not request runtime-config.js from the production artifact.");
    }
    if (!runtimeRequests.some((url) => /[?&]v=/.test(url))) {
        throw new Error("runtime-config.js was requested without a build cache-busting query.");
    }
    if (requests.some((url) => url.includes("/watch-party/firebase-config.js"))) {
        throw new Error("Production artifact requested watch-party/firebase-config.js.");
    }
    if (requests.some((url) => url.includes("/watch-party/dev/local-test-bridge.js"))) {
        throw new Error("Production artifact requested the Watch Party development bridge.");
    }
    if (requests.some((url) => /:(9000|9099)\b/.test(url))) {
        throw new Error("Production artifact attempted to contact Firebase emulator ports.");
    }

    await page.goto(`${BASE_URL}/watch-party/public/`, { waitUntil: "domcontentloaded" });
    await page.locator("#state-unavailable:not([hidden]), #state-directory:not([hidden])").waitFor({ timeout: 7000 });

    await page.goto(`${BASE_URL}/watch-party/`, { waitUntil: "domcontentloaded" });
    const productionHookState = await page.evaluate(() => ({
        e2eHook: typeof window.__watchPartyTest,
        controlHook: typeof window.__WATCH_PARTY_TEST__
    }));
    if (productionHookState.e2eHook !== "undefined" || productionHookState.controlHook !== "undefined") {
        throw new Error("Production artifact exposed Watch Party local test globals.");
    }

    await assertNotServed("/scripts/build-pages.mjs");
    await assertNotServed("/tests/watch-party/utils.test.js");
    await assertNotServed("/firebase/database.rules.json");
    await assertNotServed("/package.json");
    await assertNotServed("/watch-party/dev/local-test-bridge.js");

    if (sameOriginFailures.length) {
        throw new Error(`Same-origin preview failures:\n${sameOriginFailures.join("\n")}`);
    }

    await browser.close();
    browser = null;

    console.log(`[pages:smoke] preview ok. Requests observed: ${requests.length}. Runtime config requests: ${runtimeRequests.length}.`);
} finally {
    if (browser) await browser.close().catch(() => {});
    await stopProcess(server);
}

async function installFirebaseSdkMocks(context) {
    await context.route(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.5\/firebase-(app|auth|database|functions|app-check)\.js$/, async (route) => {
        const url = route.request().url();
        let body;
        if (url.endsWith("firebase-app.js")) {
            body = `
const apps = [];
export function initializeApp(options, name = "[DEFAULT]") {
    const app = { name, options };
    apps.push(app);
    return app;
}
export function getApps() { return apps; }
export function getApp(name = "[DEFAULT]") { return apps.find((app) => app.name === name) || apps[0]; }
`;
        } else if (url.endsWith("firebase-auth.js")) {
            body = `
export function getAuth(app) { return { app, currentUser: null }; }
export async function signInAnonymously(auth) {
    auth.currentUser = { uid: "production-preview-user", getIdToken: async () => "preview-token" };
    return { user: auth.currentUser };
}
export function connectAuthEmulator() { throw new Error("connectAuthEmulator must not run in production"); }
`;
        } else if (url.endsWith("firebase-database.js")) {
            body = `
const emptySnapshot = { exists: () => false, val: () => null };
export function getDatabase(app) { return { app }; }
export function connectDatabaseEmulator() { throw new Error("connectDatabaseEmulator must not run in production"); }
export function ref(database, path = "") { return { database, path }; }
export function query(reference, ...constraints) { return { reference, constraints }; }
export function orderByChild(child) { return { type: "orderByChild", child }; }
export function limitToLast(limit) { return { type: "limitToLast", limit }; }
export function onValue(target, next) {
    queueMicrotask(() => next(target?.reference?.path === "publicRoomDirectory" ? { exists: () => true, val: () => ({}) } : emptySnapshot));
    return () => {};
}
export async function get() { return emptySnapshot; }
export async function update() {}
export function onDisconnect() { return { update: async () => {} }; }
export function serverTimestamp() { return { ".sv": "timestamp" }; }
export function increment(value) { return { ".sv": { increment: value } }; }
`;
        } else if (url.endsWith("firebase-functions.js")) {
            body = `
export function getFunctions(app, region) { return { app, region }; }
export function connectFunctionsEmulator() { throw new Error("connectFunctionsEmulator must not run in production"); }
export function httpsCallable() { return async () => ({ data: { result: {} } }); }
`;
        } else {
            body = `
export function initializeAppCheck() { return {}; }
export class ReCaptchaEnterpriseProvider { constructor(siteKey) { this.siteKey = siteKey; } }
`;
        }
        await route.fulfill({
            status: 200,
            contentType: "application/javascript; charset=utf-8",
            body
        });
    });
}
