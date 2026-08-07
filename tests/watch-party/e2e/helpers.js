import { expect } from "@playwright/test";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const BASE_URL = "http://127.0.0.1:8080";
export const WATCH_PARTY_URL = `${BASE_URL}/watch-party/`;
export const TEST_MEDIA_URL = `${BASE_URL}/test-assets/sample.mp4`;
export const SAMPLE_MP4_PATH = path.resolve("test-assets/sample.mp4");
export const ARTIFACT_DIR = path.resolve("artifacts/watch-party");
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const RTDB_EMULATOR_ORIGIN = "http://127.0.0.1:9000";
const RTDB_NAMESPACE = "demo-freemovieir-default-rtdb";
const ADMIN_OVERRIDE = encodeURIComponent(JSON.stringify({ uid: "watch-party-e2e-admin", admin: true }));

mkdirSync(ARTIFACT_DIR, { recursive: true });

export async function resetEmulators() {
    const rooms = await readRooms();
    for (const [roomCode, room] of Object.entries(rooms || {})) {
        const ownerUid = String(room?.ownerUid || "watch-party-e2e-admin");
        const ownerOverride = encodeURIComponent(JSON.stringify({ uid: ownerUid }));
        const response = await fetch(`${RTDB_EMULATOR_ORIGIN}/rooms/${roomCode}.json?ns=${RTDB_NAMESPACE}&auth_variable_override=${ownerOverride}`, {
            method: "DELETE"
        });
        if (!response.ok) {
            throw new Error(`Failed to reset RTDB room ${roomCode}: ${response.status} ${await response.text()}`);
        }
    }
    const remaining = await readRooms();
    if (remaining && Object.keys(remaining).length) {
        throw new Error(`Failed to reset RTDB emulator namespace ${RTDB_NAMESPACE}; remaining rooms: ${Object.keys(remaining).join(", ")}`);
    }
}

export async function readRooms() {
    const response = await fetch(`${RTDB_EMULATOR_ORIGIN}/rooms.json?ns=${RTDB_NAMESPACE}&auth_variable_override=${ADMIN_OVERRIDE}`, {
        headers: {
            Authorization: "Bearer owner"
        }
    });
    return response.ok ? await response.json() : null;
}

export async function readRoomAs(roomCode, uid) {
    const override = encodeURIComponent(JSON.stringify({ uid }));
    const response = await fetch(`${RTDB_EMULATOR_ORIGIN}/rooms/${roomCode}.json?ns=${RTDB_NAMESPACE}&auth_variable_override=${override}`, {
        headers: {
            Authorization: "Bearer owner"
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to read room ${roomCode}: ${response.status} ${await response.text()}`);
    }
    return response.json();
}

export async function releaseGuestSlotAs(roomCode, uid) {
    const override = encodeURIComponent(JSON.stringify({ uid }));
    const response = await fetch(`${RTDB_EMULATOR_ORIGIN}/rooms/${roomCode}/guestUid.json?ns=${RTDB_NAMESPACE}&auth_variable_override=${override}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer owner"
        },
        body: "null"
    });
    if (!response.ok) {
        throw new Error(`Failed to release guest slot for ${roomCode}: ${response.status} ${await response.text()}`);
    }
    return response.json();
}

export async function patchRoomAs(roomCode, uid, patch) {
    const override = encodeURIComponent(JSON.stringify({ uid }));
    const response = await fetch(`${RTDB_EMULATOR_ORIGIN}/rooms/${roomCode}.json?ns=${RTDB_NAMESPACE}&auth_variable_override=${override}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
    });
    if (!response.ok) {
        throw new Error(`Failed to patch room ${roomCode}: ${response.status} ${await response.text()}`);
    }
    return response.json();
}

export async function newParticipant(browser, label, options = {}) {
    const context = await browser.newContext({
        viewport: options.viewport,
        screen: options.screen || options.viewport,
        isMobile: options.isMobile,
        hasTouch: options.hasTouch,
        deviceScaleFactor: options.deviceScaleFactor,
        permissions: options.permissions || []
    });
    const events = {
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        dialogs: [],
        xssRequests: []
    };

    await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "www.gstatic.com") {
            await route.continue();
            return;
        }
        if (request.resourceType() === "script") {
            await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
            return;
        }
        if (request.resourceType() === "stylesheet") {
            await route.fulfill({ status: 200, contentType: "text/css", body: "" });
            return;
        }
        await route.abort("blockedbyclient");
    });

    const page = await context.newPage();
    page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (/cloud\.umami|favicon|ERR_BLOCKED_BY_CLIENT/i.test(text)) return;
        events.consoleErrors.push(`[${label}] ${text}`);
    });
    page.on("pageerror", (error) => events.pageErrors.push(`[${label}] ${error.message}`));
    page.on("dialog", async (dialog) => {
        events.dialogs.push(`[${label}] ${dialog.message()}`);
        await dialog.dismiss().catch(() => {});
    });
    page.on("request", (request) => {
        const requestUrl = request.url();
        if (/\/watch-party\/x($|\?)/.test(requestUrl) || /\/x($|\?)/.test(requestUrl)) {
            events.xssRequests.push(`[${label}] ${requestUrl}`);
        }
    });
    page.on("requestfailed", (request) => {
        const url = request.url();
        if (/cloud\.umami|cdn\.jsdelivr|cdnjs\.cloudflare|favicon/i.test(url)) return;
        if (/127\.0\.0\.1:8080\/test-assets\/.*\.(mp4|webm|mkv)/i.test(url) && /ERR_ABORTED/i.test(request.failure()?.errorText || "")) return;
        events.failedRequests.push(`[${label}] ${url} :: ${request.failure()?.errorText || "failed"}`);
    });
    page.on("response", (response) => {
        const url = response.url();
        if (!url.startsWith(BASE_URL)) return;
        if (response.status() >= 400) events.failedRequests.push(`[${label}] ${response.status()} ${url}`);
    });

    return { context, page, events, label };
}

export async function closeParticipants(...participants) {
    await Promise.all(participants.filter(Boolean).map((participant) => participant.context.close().catch(() => {})));
}

export function assertCleanParticipant(participant) {
    const { consoleErrors, pageErrors, failedRequests, dialogs, xssRequests } = participant.events;
    expect.soft(pageErrors, `${participant.label} page errors`).toEqual([]);
    expect.soft(consoleErrors, `${participant.label} console errors`).toEqual([]);
    expect.soft(failedRequests, `${participant.label} failed requests`).toEqual([]);
    expect.soft(dialogs, `${participant.label} unexpected dialogs`).toEqual([]);
    expect.soft(xssRequests, `${participant.label} XSS image requests`).toEqual([]);
}

export async function goFresh(page) {
    await page.goto("/watch-party/?resetSession=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#screen-welcome")).toBeVisible();
}

export async function createOwnerRoom(page, name = "Owner User") {
    await goFresh(page);
    await page.getByTestId("role-host").click();
    await expect(page.locator("#screen-host-profile")).toBeVisible();
    await page.getByTestId("host-display-name").fill(name);
    await page.locator("#host-profile-form").getByRole("button", { name: /./ }).first().click();
    await expect(page.locator("#screen-host-media")).toBeVisible();
    await page.getByTestId("host-video-url").fill(TEST_MEDIA_URL);
    await page.locator("input[name='subtitleMode'][value='none']").check();
    const createButton = page.getByTestId("create-room");
    await createButton.dblclick();
    await expect(page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
    const roomCode = (await page.getByTestId("room-code").textContent()).trim();
    expect(roomCode).toMatch(ROOM_CODE_PATTERN);
    return roomCode;
}

export async function joinGuestRoom(page, roomCode, name = "Guest User") {
    await goFresh(page);
    await page.getByTestId("role-guest").click();
    await expect(page.locator("#screen-guest-code")).toBeVisible();
    await page.getByTestId("guest-room-code").fill(` ${roomCode.toLowerCase().slice(0, 4)} ${roomCode.slice(4)} `);
    await expect(page.getByTestId("guest-room-code")).toHaveValue(roomCode);
    await page.locator("#guest-code-form").getByRole("button").first().click();
    await expect(page.locator("#screen-guest-profile")).toBeVisible();
    await page.getByTestId("guest-display-name").fill(name);
    await page.getByTestId("join-room").dblclick();
    await page.waitForFunction(() => ["lobby", "active-room"].includes(window.__watchPartyTest?.state), null, { timeout: 20_000 });
}

export async function createJoinedRoom(browser) {
    await resetEmulators();
    const owner = await newParticipant(browser, "owner");
    const guest = await newParticipant(browser, "guest");
    const roomCode = await createOwnerRoom(owner.page);
    await joinGuestRoom(guest.page, roomCode);
    await expect(owner.page.locator("#participants").getByTestId("participant-guest")).toContainText(/./, { timeout: 15_000 });
    return { owner, guest, roomCode };
}

export async function screenshot(page, name) {
    const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
}

export function buildScreenshotIndex() {
    const groups = new Map([
        ["Welcome", []],
        ["Host flow", []],
        ["Guest flow", []],
        ["Lobby", []],
        ["Active room", []],
        ["Chat", []],
        ["Dialogs", []],
        ["Errors", []],
        ["Mobile 390", []],
        ["Mobile 360", []],
        ["Other", []]
    ]);
    for (const file of readdirSync(ARTIFACT_DIR).filter((name) => name.endsWith(".png")).sort()) {
        const lower = file.toLowerCase();
        let group = "Other";
        if (lower.includes("welcome")) group = lower.includes("390") ? "Mobile 390" : lower.includes("360") ? "Mobile 360" : "Welcome";
        else if (lower.includes("host")) group = "Host flow";
        else if (lower.includes("guest") || lower.includes("invitation")) group = "Guest flow";
        else if (lower.includes("lobby") || lower.includes("replacement")) group = "Lobby";
        else if (lower.includes("active") || lower.includes("tab") || lower.includes("countdown")) group = "Active room";
        else if (lower.includes("chat") || lower.includes("reaction")) group = "Chat";
        else if (lower.includes("dialog")) group = "Dialogs";
        else if (lower.includes("error") || lower.includes("rejected")) group = "Errors";
        if (lower.includes("mobile-390")) group = "Mobile 390";
        if (lower.includes("mobile-360")) group = "Mobile 360";
        groups.get(group).push(file);
    }
    const lines = ["# Watch Party E2E Screenshot Index", ""];
    for (const [group, files] of groups) {
        if (!files.length) continue;
        lines.push(`## ${group}`, "");
        for (const file of files) {
            const size = statSync(path.join(ARTIFACT_DIR, file)).size;
            lines.push(`- [${file}](./${file}) (${Math.round(size / 1024)} KB)`);
        }
        lines.push("");
    }
    const indexPath = path.join(ARTIFACT_DIR, "index.md");
    writeFileSync(indexPath, lines.join("\n"), "utf8");
    return indexPath;
}

export async function waitForState(page, state) {
    await page.waitForFunction((expected) => window.__watchPartyTest?.state === expected, state);
}
