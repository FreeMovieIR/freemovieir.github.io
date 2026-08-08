import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";

const root = process.cwd();
const args = process.argv.slice(2);
const passthrough = args.filter((arg) => arg !== "--keep-services");
const keepServices = args.includes("--keep-services");
const children = [];

const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => key && !key.startsWith("=") && value !== undefined)
);

if (!childEnv.JAVA_TOOL_OPTIONS?.includes("-Xmx")) {
    childEnv.JAVA_TOOL_OPTIONS = `${childEnv.JAVA_TOOL_OPTIONS || ""} -Xmx256m`.trim();
}

const chromeCandidates = [
    childEnv.PLAYWRIGHT_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (chromePath && !childEnv.PLAYWRIGHT_CHROME_PATH) childEnv.PLAYWRIGHT_CHROME_PATH = chromePath;

function spawnLocal(command, commandArgs, options = {}) {
    const child = spawn(command, commandArgs, {
        cwd: root,
        env: childEnv,
        stdio: options.stdio || "inherit",
        shell: process.platform === "win32"
    });
    children.push(child);
    return child;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 60_000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            const socket = net.createConnection({ host, port });
            socket.once("connect", () => {
                socket.destroy();
                resolve();
            });
            socket.once("error", () => {
                socket.destroy();
                if (Date.now() - started > timeoutMs) reject(new Error(`Timed out waiting for ${host}:${port}`));
                else setTimeout(check, 500);
            });
        };
        check();
    });
}

function waitForHttp(url, timeoutMs = 60_000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            const request = http.get(url, (response) => {
                response.resume();
                if (response.statusCode && response.statusCode < 500) resolve();
                else retry();
            });
            request.once("error", retry);
        };
        const retry = () => {
            if (Date.now() - started > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
            else setTimeout(check, 500);
        };
        check();
    });
}

function killTree(child) {
    if (!child.pid || child.exitCode !== null) return Promise.resolve();
    if (process.platform !== "win32") {
        child.kill("SIGTERM");
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
        killer.once("exit", () => resolve());
        killer.once("error", () => resolve());
    });
}

async function stopChildren() {
    await Promise.all([...children].reverse().map(killTree));
}

process.once("SIGINT", async () => {
    await stopChildren();
    process.exit(130);
});

let exitCode = 1;
try {
    console.log("[watch-party:e2e] Generating local test runtime config...");
    const buildConfig = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "watch-party:build:test"], {
        cwd: root,
        env: childEnv,
        stdio: "inherit",
        shell: process.platform === "win32"
    });
    if (buildConfig.status !== 0) throw new Error("Failed to generate local test runtime config");

    console.log("[watch-party:e2e] Starting Firebase emulators...");
    spawnLocal("firebase.cmd", ["emulators:start", "--only", "auth,database,functions", "--project", "demo-freemovieir"]);
    await Promise.all([waitForPort(9099), waitForPort(9000), waitForPort(5001)]);
    await Promise.all([
        waitForHttp("http://127.0.0.1:9099/emulator/v1/projects/demo-freemovieir/config"),
        waitForHttp("http://127.0.0.1:9000/.json?ns=demo-freemovieir")
    ]);

    console.log("[watch-party:e2e] Starting static server...");
    spawnLocal("http-server.cmd", [".", "-p", "8080", "-a", "127.0.0.1", "-c-1"]);
    await waitForHttp("http://127.0.0.1:8080/watch-party/");

    console.log("[watch-party:e2e] Running Playwright...");
    const playwrightArgs = ["playwright", "test", ...passthrough];
    const runner = spawnLocal("npx.cmd", playwrightArgs);
    exitCode = await new Promise((resolve) => runner.once("exit", (code) => resolve(code ?? 1)));
} catch (error) {
    console.error(`[watch-party:e2e] ${error.message}`);
    exitCode = 1;
} finally {
    if (!keepServices) await stopChildren();
}

process.exit(exitCode);
