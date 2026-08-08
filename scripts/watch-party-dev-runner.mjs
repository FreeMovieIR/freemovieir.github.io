import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const bin = (name) => path.join(root, "node_modules", ".bin", `${name}${isWindows ? ".cmd" : ""}`);
const children = [];

const firebase = start("firebase", [
    "emulators:start",
    "--only",
    "auth,database,functions",
    "--project",
    "demo-freemovieir"
]);

await waitForPort("127.0.0.1", 9099, 60_000);
await waitForPort("127.0.0.1", 9000, 60_000);
await waitForPort("127.0.0.1", 5001, 60_000);

const server = start("http-server", [".", "-p", "8080", "-a", "127.0.0.1", "-c-1"]);
await waitForPort("127.0.0.1", 8080, 30_000);

console.log("");
console.log("Watch Party local development is ready:");
console.log("  Watch Party: http://127.0.0.1:8080/watch-party/");
console.log("  Public Rooms: http://127.0.0.1:8080/watch-party/public/");
console.log("  Emulator UI: http://127.0.0.1:4000");
console.log("Press Ctrl+C to stop the local services.");

await Promise.race([
    waitForExit(firebase),
    waitForExit(server),
    new Promise((resolve) => process.once("SIGINT", resolve)),
    new Promise((resolve) => process.once("SIGTERM", resolve))
]);

shutdown();

function start(command, args) {
    const executable = bin(command);
    const child = spawn(executable, args, {
        cwd: root,
        shell: false,
        stdio: "inherit",
        windowsHide: true
    });
    children.push(child);
    child.on("error", (error) => {
        console.error(`Failed to start ${command}: ${error.message}`);
        shutdown(1);
    });
    return child;
}

function waitForExit(child) {
    return new Promise((resolve) => child.once("exit", resolve));
}

function waitForPort(host, port, timeoutMs) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const socket = net.createConnection({ host, port });
            socket.once("connect", () => {
                socket.destroy();
                resolve();
            });
            socket.once("error", () => {
                socket.destroy();
                if (Date.now() - started > timeoutMs) reject(new Error(`Timed out waiting for ${host}:${port}`));
                else setTimeout(attempt, 500);
            });
        };
        attempt();
    });
}

function shutdown(code = 0) {
    for (const child of children) {
        stopChild(child);
    }
    setTimeout(() => {
        for (const child of children) {
            stopChild(child, true);
        }
        process.exit(code);
    }, 1200).unref();
}

function stopChild(child, force = false) {
    if (child.killed || child.exitCode !== null || !child.pid) return;
    if (isWindows) {
        spawn("taskkill", ["/PID", String(child.pid), "/T", force ? "/F" : ""].filter(Boolean), {
            stdio: "ignore",
            windowsHide: true
        });
        return;
    }
    child.kill(force ? "SIGKILL" : "SIGTERM");
}
