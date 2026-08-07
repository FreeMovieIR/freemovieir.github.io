import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.WATCH_PARTY_PRODUCTION_SMOKE_PORT || 8082);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function command(name) {
    return process.platform === "win32" ? `${name}.cmd` : name;
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
    const failures = [];
    const pageErrors = [];
    const consoleErrors = [];

    page.on("request", (request) => requests.push(request.url()));
    page.on("requestfailed", (request) => {
        const url = request.url();
        if (url.startsWith(BASE_URL) || url.includes("gstatic.com/firebasejs")) {
            failures.push(`${url}: ${request.failure()?.errorText || "request failed"}`);
        }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.addInitScript(() => {
        window.addEventListener("unhandledrejection", (event) => {
            window.__previewUnhandledRejections = window.__previewUnhandledRejections || [];
            window.__previewUnhandledRejections.push(String(event.reason?.message || event.reason || "unhandled rejection"));
        });
    });

    await page.goto(`${BASE_URL}/watch-party/`, { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible" });
    await delay(500);

    await page.getByTestId("role-host").click();
    await page.locator("#screen-host-profile:not([hidden])").waitFor({ timeout: 5000 });

    const globals = await page.evaluate(() => ({
        e2eHook: typeof window.__watchPartyTest,
        controlHook: typeof window.__WATCH_PARTY_TEST__,
        unhandled: window.__previewUnhandledRejections || []
    }));
    if (globals.e2eHook !== "undefined" || globals.controlHook !== "undefined") {
        throw new Error("Production artifact exposed Watch Party local test globals.");
    }
    if (globals.unhandled.length) throw new Error(`Unhandled promise rejection in production artifact:\n${globals.unhandled.join("\n")}`);
    if (pageErrors.length) throw new Error(`Page errors in production artifact:\n${pageErrors.join("\n")}`);
    if (consoleErrors.some((text) => /ReferenceError|SyntaxError|does not provide an export|connectAuthservice|connectDatabaseservice/i.test(text))) {
        throw new Error(`Console import/runtime errors in production artifact:\n${consoleErrors.join("\n")}`);
    }
    if (failures.length) throw new Error(`Required production artifact requests failed:\n${failures.join("\n")}`);

    assertRequested(requests, "/watch-party/runtime-config.js", "runtime-config.js");
    assertRequested(requests, "/watch-party/js/app.js", "app.js");

    const requiredModules = [
        "app.js",
        "firebase-client.js",
        "auth-diagnostics.js",
        "utils.js",
        "ui.js",
        "ui-state.js",
        "room-service.js",
        "media-controller.js",
        "sync-controller.js",
        "subtitle-controller.js",
        "chat-controller.js",
        "voice/voice-call.js",
        "voice/voice-media.js",
        "voice/voice-signaling.js",
        "voice/voice-state.js",
        "voice/voice-stats.js"
    ];
    for (const modulePath of requiredModules) {
        assertRequested(requests, `/watch-party/js/${modulePath}`, `watch-party/js/${modulePath}`);
    }
    if (requests.some((url) => /:(9000|9099)\b/.test(url))) {
        throw new Error("Production artifact attempted to contact Firebase emulator ports.");
    }

    await browser.close();
    browser = null;
    const requestedModules = requests.filter((url) => new URL(url).pathname.startsWith("/watch-party/js/")).length;
    console.log(`[pages:smoke] Watch Party production artifact browser smoke ok. Module requests observed: ${requestedModules}.`);
} finally {
    if (browser) await browser.close().catch(() => {});
    await stopProcess(server);
}

async function installFirebaseSdkMocks(context) {
    await context.route(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.5\/firebase-(app|auth|database|app-check)\.js$/, async (route) => {
        const url = route.request().url();
        let body;
        if (url.endsWith("firebase-app.js")) {
            body = `
const apps = [];
export function initializeApp(options) {
    const app = { name: "[DEFAULT]", options };
    apps.push(app);
    return app;
}
export function getApps() { return apps; }
export function getApp() { return apps[0]; }
`;
        } else if (url.endsWith("firebase-auth.js")) {
            body = `
export function getAuth(app) { return { app, currentUser: null }; }
export async function signInAnonymously(auth) {
    auth.currentUser = { uid: "production-smoke-user" };
    return { user: auth.currentUser };
}
export function connectAuthEmulator() { throw new Error("connectAuthEmulator must not run in production"); }
`;
        } else if (url.endsWith("firebase-database.js")) {
            body = `
export function getDatabase(app) { return { app }; }
export function connectDatabaseEmulator() { throw new Error("connectDatabaseEmulator must not run in production"); }
export function serverTimestamp() { return { ".sv": "timestamp" }; }
export function increment(value) { return { ".sv": { increment: value } }; }
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

function assertRequested(requests, pathname, label) {
    if (!requests.some((url) => {
        const parsed = new URL(url);
        return parsed.origin === BASE_URL && parsed.pathname === pathname;
    })) {
        throw new Error(`Production browser smoke did not request ${label}.`);
    }
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
        } catch {}
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
