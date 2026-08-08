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
    await page.locator("#state-unavailable:not([hidden])").waitFor({ timeout: 5000 });

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
