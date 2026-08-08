import { spawn, spawnSync } from "node:child_process";

const existingJavaOptions = process.env.JAVA_TOOL_OPTIONS || "";
const heapCap = "-Xmx256m";
const javaOptions = existingJavaOptions.includes("-Xmx")
    ? existingJavaOptions
    : `${existingJavaOptions} ${heapCap}`.trim();

const firebaseBin = process.platform === "win32" ? "firebase.cmd" : "firebase";
const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => key && !key.startsWith("=") && value !== undefined)
);
const args = [
    "emulators:exec",
    "--only",
    "database",
    "--project",
    "demo-freemovieir",
    "node --test tests/watch-party/rules/database-rules.test.js && node --test tests/watch-party/rules/public-room-rules.test.js"
];

const command = process.platform === "win32"
    ? `${firebaseBin} emulators:exec --only database --project demo-freemovieir "node --test tests/watch-party/rules/database-rules.test.js && node --test tests/watch-party/rules/public-room-rules.test.js"`
    : firebaseBin;

function listDatabaseEmulatorPids() {
    if (process.platform !== "win32") return new Set();
    const result = spawnSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*firebase-database-emulator*--port 9000*' } | Select-Object -ExpandProperty ProcessId"
    ], { encoding: "utf8" });
    if (result.status !== 0) return new Set();
    return new Set(result.stdout
        .split(/\r?\n/)
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0));
}

function stopProcessTree(pid) {
    if (!pid) return;
    if (process.platform === "win32") {
        spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
        return;
    }
    try {
        process.kill(pid, "SIGTERM");
    } catch {
        // The emulator may already have exited.
    }
}

const existingDatabaseEmulators = listDatabaseEmulatorPids();

const child = spawn(command, process.platform === "win32" ? [] : args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
        ...childEnv,
        JAVA_TOOL_OPTIONS: javaOptions
    }
});

child.on("exit", (code, signal) => {
    for (const pid of listDatabaseEmulatorPids()) {
        if (!existingDatabaseEmulators.has(pid)) stopProcessTree(pid);
    }
    if (signal) {
        console.error(`Rules test process stopped by signal ${signal}`);
        process.exit(1);
    }
    process.exit(code ?? 1);
});
