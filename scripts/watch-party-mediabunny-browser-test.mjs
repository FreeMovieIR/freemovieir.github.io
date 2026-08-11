import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => key && !key.startsWith("=") && value !== undefined)
);
const children = [];

function spawnLocal(command, args, options = {}) {
    const child = spawn(command, args, {
        cwd: root,
        env: childEnv,
        stdio: "inherit",
        shell: options.shell ?? process.platform === "win32"
    });
    children.push(child);
    return child;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30_000) {
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
                else setTimeout(check, 300);
            });
        };
        check();
    });
}

function waitForHttp(url, timeoutMs = 30_000) {
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
            else setTimeout(check, 300);
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
        killer.once("exit", resolve);
        killer.once("error", resolve);
    });
}

async function stopChildren() {
    await Promise.all([...children].reverse().map(killTree));
}

let exitCode = 1;
try {
    console.log("[watch-party:mediabunny-browser] Starting static server only...");
    const httpServerBin = path.join(root, "node_modules", "http-server", "bin", "http-server");
    spawnLocal(process.execPath, [httpServerBin, ".", "-p", "8080", "-a", "127.0.0.1", "-c-1"], { shell: false });
    await waitForPort(8080);
    await waitForHttp("http://127.0.0.1:8080/watch-party/dev/mediabunny-harness.html");

    console.log("[watch-party:mediabunny-browser] Running Playwright Mediabunny browser spec...");
    const runner = spawnLocal(process.platform === "win32" ? "npx.cmd" : "npx", [
        "playwright",
        "test",
        "--project=mediabunny-browser"
    ]);
    exitCode = await new Promise((resolve) => runner.once("exit", (code) => resolve(code ?? 1)));
} catch (error) {
    console.error(`[watch-party:mediabunny-browser] ${error.message}`);
    exitCode = 1;
} finally {
    await stopChildren();
}

process.exit(exitCode);
