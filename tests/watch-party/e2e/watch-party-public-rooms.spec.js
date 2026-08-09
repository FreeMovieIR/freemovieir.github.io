import { test, expect } from "@playwright/test";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertCleanParticipant, closeParticipants, newParticipant, TEST_MEDIA_URL } from "./helpers.js";

const BASE_URL = "http://127.0.0.1:8080";
const PUBLIC_URL = `${BASE_URL}/watch-party/public/`;
const SECOND_TEST_MEDIA_URL = `${TEST_MEDIA_URL}?v=public-v4`;
const RTDB_ORIGIN = "http://127.0.0.1:9000";
const NS = "demo-freemovieir-default-rtdb";
const ADMIN = encodeURIComponent(JSON.stringify({ uid: "public-e2e-admin", admin: true }));
const ARTIFACT_DIR = path.resolve("artifacts/watch-party/public-v4", process.env.PUBLIC_V4_SCREENSHOT_PHASE || "final");
const V3_ARTIFACT_DIR = path.resolve("artifacts/watch-party/public-v3");
const V5_ARTIFACT_DIR = path.resolve("artifacts/watch-party/playback-v5");

mkdirSync(ARTIFACT_DIR, { recursive: true });
mkdirSync(V3_ARTIFACT_DIR, { recursive: true });
mkdirSync(V5_ARTIFACT_DIR, { recursive: true });

test.describe("Public Rooms V4 E2E", () => {
    test("production feature flags and maintenance mode do not start public Firebase work", async ({ browser }) => {
        for (const scenario of [
            { name: "feature-disabled", publicRooms: { enabled: false, creationEnabled: false, maintenance: false } },
            { name: "maintenance", publicRooms: { enabled: true, creationEnabled: false, maintenance: true } }
        ]) {
            const participant = await newParticipant(browser, `public-${scenario.name}`);
            const network = [];
            try {
                await participant.page.route(/\/watch-party\/runtime-config\.js(\?.*)?$/, (route) => route.fulfill({
                    contentType: "text/javascript",
                    body: `export const watchPartyConfig = ${JSON.stringify({
                        environment: "production",
                        useEmulators: false,
                        firebase: {
                            apiKey: "AIzaSyA0000000000000000000000000000000000",
                            authDomain: "freemovieir-local-check.firebaseapp.com",
                            databaseURL: "https://freemovieir-local-check-default-rtdb.firebaseio.com",
                            projectId: "freemovieir-local-check",
                            appId: "1:123456789012:web:abcdef1234567890"
                        },
                        publicRooms: scenario.publicRooms
                    })};`
                }));
                participant.page.on("request", (request) => {
                    const url = request.url();
                    if (/firebasejs|googleapis|127\.0\.0\.1:9000|127\.0\.0\.1:5001|identitytoolkit/.test(url)) network.push(url);
                });
                await participant.page.goto(PUBLIC_URL, { waitUntil: "networkidle" });
                await expect(participant.page.locator("#state-unavailable")).toBeVisible();
                await expect(participant.page.getByTestId("public-open-create")).toBeHidden();
                await expect(participant.page.getByTestId("public-directory-list")).toBeHidden();
                expect(network).toEqual([]);
                await captureTo(participant.page, path.join(V3_ARTIFACT_DIR, `${scenario.name}.png`));
            } finally {
                await closeParticipants(participant);
            }
        }
    });

    test("host creates a public cinema room, guests chat/react, host moderates, and lifecycle remains safe", async ({ browser }) => {
        const uniqueRoomName = `اتاق تست عمومی ${Date.now()}`;
        const host = await newParticipant(browser, "public-host");
        const guest1 = await newParticipant(browser, "public-guest-1");
        const guest2 = await newParticipant(browser, "public-guest-2");
        const lateGuest = await newParticipant(browser, "public-late-guest");
        const fullGuest = await newParticipant(browser, "public-full-guest");
        try {
            await host.page.goto(PUBLIC_URL, { waitUntil: "domcontentloaded" });
            await expect(host.page.locator("#state-directory")).toBeVisible({ timeout: 30_000 });
            await expect(host.page.getByTestId("public-active-player")).not.toBeVisible();
            await capture(host.page, "discovery-desktop");
            await host.page.getByTestId("public-search").fill(`empty-${Date.now()}`);
            await expect(host.page.locator("#directory-empty")).toBeVisible();
            await capture(host.page, "empty-discovery");
            await host.page.getByTestId("public-search").fill("");
            await host.page.getByTestId("public-open-create").click();
            await expect(host.page.locator("#state-create")).toBeVisible();
            await capture(host.page, "create-desktop");
            await host.page.setViewportSize({ width: 390, height: 844 });
            await capture(host.page, "discovery-mobile");
            await capture(host.page, "create-mobile");
            await assertNoOverflow(host.page, 390);
            await host.page.setViewportSize({ width: 1280, height: 720 });

            await host.page.getByTestId("public-display-name").fill("Host One");
            await host.page.getByTestId("public-room-name").fill(uniqueRoomName);
            await host.page.getByTestId("public-movie-title").fill("Sample Movie");
            await host.page.getByTestId("public-media-url").fill(TEST_MEDIA_URL);
            await host.page.getByTestId("public-capacity").selectOption("4");
            const create = host.page.getByTestId("public-create-submit");
            await create.dblclick();
            await expect(host.page.locator("#state-room")).toBeVisible({ timeout: 30_000 });
            const roomId = new URL(host.page.url()).searchParams.get("room");
            expect(roomId).toMatch(/^[A-HJ-NP-Z2-9]{10,12}$/);
            await expect(host.page.getByTestId("public-room-count")).toContainText("۱ / ۴");
            await expect(host.page.getByTestId("public-open-host-controls")).toBeVisible();
            await expect(host.page.getByTestId("public-player-controls")).toBeVisible();
            await expect(host.page.getByTestId("public-play-pause")).toBeVisible();
            await expect(host.page.getByTestId("public-skip-back")).toBeVisible();
            await expect(host.page.getByTestId("public-skip-forward")).toBeVisible();
            await expect(host.page.getByTestId("public-seek")).toBeEnabled();
            await expect(host.page.getByTestId("public-fullscreen")).toBeVisible();
            const firstPlaybackRevision = (await readPublicRoom(roomId)).playback?.revision || 0;
            await host.page.getByTestId("public-play-pause").click();
            await expect.poll(async () => (await readPublicRoom(roomId)).playback?.action).toBe("play");
            const afterPlayRevision = (await readPublicRoom(roomId)).playback?.revision || 0;
            expect(afterPlayRevision).toBeGreaterThan(firstPlaybackRevision);
            await host.page.getByTestId("public-play-pause").click();
            await expect.poll(async () => (await readPublicRoom(roomId)).playback?.action).toBe("pause");
            const afterPauseRevision = (await readPublicRoom(roomId)).playback?.revision || 0;
            expect(afterPauseRevision).toBeGreaterThan(afterPlayRevision);
            await host.page.getByTestId("public-skip-forward").click();
            await expect.poll(async () => (await readPublicRoom(roomId)).playback?.action).toBe("seek");
            const afterForwardRevision = (await readPublicRoom(roomId)).playback?.revision || 0;
            expect(afterForwardRevision).toBeGreaterThan(afterPauseRevision);
            await host.page.getByTestId("public-skip-back").click();
            await expect.poll(async () => (await readPublicRoom(roomId)).playback?.revision).toBeGreaterThan(afterForwardRevision);
            const seekRevision = (await readPublicRoom(roomId)).playback?.revision || 0;
            await host.page.getByTestId("public-seek").evaluate((input) => {
                input.value = "1";
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            });
            await expect.poll(async () => (await readPublicRoom(roomId)).playback?.revision).toBeGreaterThan(seekRevision);
            await captureV5(host.page, "public-host-controls-desktop");
            await host.page.getByTestId("public-open-host-controls").click();
            await expect(host.page.getByTestId("public-host-control-dialog")).toBeVisible();
            await expect(host.page.getByTestId("public-social-settings")).toBeVisible();
            await capture(host.page, "host-management-desktop");
            await host.page.locator("#close-host-controls").click();
            await expect(host.page.getByTestId("public-chat-list")).toContainText("هنوز گفتگویی");
            await capture(host.page, "host-room-desktop");
            await capture(host.page, "chat-empty");

            await guest1.page.goto(PUBLIC_URL, { waitUntil: "domcontentloaded" });
            await expect(guest1.page.getByText(uniqueRoomName)).toBeVisible();
            await guest1.page.getByTestId("public-search").fill("Sample");
            await capture(guest1.page, "discovery-search");
            await guest1.page.getByTestId("public-directory-filter").getByRole("button", { name: "جا دارد" }).click();
            await capture(guest1.page, "discovery-filtered");
            await guest1.page.getByRole("button", { name: "ورود" }).first().click();
            await expect(guest1.page.locator("#state-preview")).toBeVisible();
            await capture(guest1.page, "join-preview-desktop");
            await guest1.page.setViewportSize({ width: 390, height: 844 });
            await capture(guest1.page, "join-preview-mobile");
            await assertNoOverflow(guest1.page, 390);
            await guest1.page.setViewportSize({ width: 1280, height: 720 });
            await guest1.page.getByTestId("public-join-name").fill("Guest One");
            await guest1.page.getByTestId("public-join-submit").dblclick();
            await expect(guest1.page.locator("#state-room")).toBeVisible({ timeout: 30_000 });

            await guest2.page.goto(`${PUBLIC_URL}?room=${roomId}`, { waitUntil: "domcontentloaded" });
            await expect(guest2.page.locator("#state-preview")).toBeVisible();
            await guest2.page.getByTestId("public-join-name").fill("Guest Two");
            await guest2.page.getByTestId("public-join-submit").click();
            await expect(guest2.page.locator("#state-room")).toBeVisible({ timeout: 30_000 });
            await expect(host.page.getByTestId("public-room-count")).toContainText("۳ / ۴");
            await expect(guest2.page.getByTestId("public-social-settings")).toBeHidden();
            await expect(guest2.page.getByTestId("public-leave-room")).toBeVisible();
            await expect(guest2.page.getByTestId("public-player-controls")).toBeVisible();
            await expect(guest2.page.getByTestId("public-play-pause")).toBeHidden();
            await expect(guest2.page.getByTestId("public-skip-back")).toBeHidden();
            await expect(guest2.page.getByTestId("public-skip-forward")).toBeHidden();
            await expect(guest2.page.getByTestId("public-seek")).toBeDisabled();
            await expect(guest2.page.getByTestId("public-fullscreen")).toBeVisible();
            const beforeFullscreenPlayback = (await readPublicRoom(roomId)).playback?.revision;
            await guest2.page.getByTestId("public-fullscreen").click();
            await guest2.page.keyboard.press("Escape").catch(() => {});
            if (await guest2.page.evaluate(() => Boolean(document.fullscreenElement))) {
                await guest2.page.getByTestId("public-fullscreen").click();
            }
            await expect.poll(async () => guest2.page.evaluate(() => ({
                standardFullscreen: Boolean(document.fullscreenElement),
                cinemaMode: document.querySelector("#public-video-shell")?.classList.contains("cinema-mode-active") || false,
                cinemaLock: document.body.classList.contains("watch-party-cinema-lock")
            }))).toEqual({ standardFullscreen: false, cinemaMode: false, cinemaLock: false });
            await expect.poll(async () => (await readPublicRoom(roomId)).playback?.revision).toBe(beforeFullscreenPlayback);
            const beforeGuestAudioControls = (await readPublicRoom(roomId)).playback?.revision;
            await guest2.page.getByTestId("public-mute").click();
            await guest2.page.getByTestId("public-volume").evaluate((input) => {
                input.value = "0.25";
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
            await expect.poll(async () => (await readPublicRoom(roomId)).playback?.revision).toBe(beforeGuestAudioControls);
            await captureV5(guest2.page, "public-guest-controls-desktop");
            await host.page.getByTestId("public-members-tab").click();
            await capture(host.page, "members-desktop");
            await host.page.getByTestId("public-chat-tab").click();
            await capture(host.page, "lobby-two-users-owner");
            await capture(guest2.page, "guest-room-desktop");

            await guest1.page.getByTestId("public-chat-input").fill("سلام 👋");
            await guest1.page.getByTestId("public-chat-send").click();
            await expect(guest2.page.getByTestId("public-chat-list")).toContainText("سلام 👋");
            await expect(host.page.getByTestId("public-chat-list")).toContainText("Guest One");
            await host.page.getByTestId("public-chat-input").fill("خوش آمدید");
            await host.page.getByTestId("public-chat-send").click();
            await expect(guest1.page.getByTestId("public-chat-list")).toContainText("خوش آمدید");
            await capture(host.page, "chat-desktop");

            await guest1.page.getByTestId("public-chat-input").fill("پیام سریع");
            await guest1.page.getByTestId("public-chat-send").click();
            await expect(guest1.page.getByTestId("public-chat-error")).toContainText("حالت آهسته");
            await capture(guest1.page, "chat-slow-mode");
            guest1.events.consoleErrors = guest1.events.consoleErrors.filter((entry) => !/429 \(Too Many Requests\)/.test(entry));

            await host.page.getByTestId("public-open-host-controls").click();
            await host.page.getByTestId("public-chat-enabled").uncheck();
            await expect(guest1.page.locator("#public-chat-disabled")).toBeVisible({ timeout: 15_000 });
            await expect(guest1.page.getByTestId("public-chat-input")).toBeDisabled();
            await capture(guest1.page, "chat-disabled");
            await host.page.getByTestId("public-chat-enabled").check();
            await expect(guest1.page.getByTestId("public-chat-input")).toBeEnabled({ timeout: 15_000 });
            await host.page.getByTestId("public-host-movie-title").fill("Second Sample Movie");
            await host.page.getByTestId("public-host-media-url").fill(SECOND_TEST_MEDIA_URL);
            await host.page.getByTestId("public-host-media-submit").click();
            await expect(host.page.getByTestId("public-room-movie")).toContainText("Second Sample Movie", { timeout: 15_000 });
            await expect(guest1.page.getByTestId("public-room-movie")).toContainText("Second Sample Movie", { timeout: 15_000 });
            await expect.poll(async () => (await readDirectoryRoom(roomId)).movieTitle).toBe("Second Sample Movie");
            expect(await readDirectoryRoom(roomId)).not.toHaveProperty("media");
            await host.page.locator("#close-host-controls").click();

            await guest2.page.getByTestId("public-reaction-button").click();
            await expect(guest2.page.getByTestId("public-reaction-picker")).toBeVisible();
            await capture(guest2.page, "reaction-picker-desktop");
            await guest2.page.getByTestId("public-reaction-picker").getByRole("menuitem").filter({ hasText: "🍿" }).click();
            await expect(host.page.getByTestId("public-reaction-layer")).toContainText("🍿", { timeout: 15_000 });
            await expect(host.page.getByTestId("public-reaction-layer")).toContainText("Guest Two");
            await capture(host.page, "reactions");

            await host.page.getByTestId("public-open-host-controls").click();
            await host.page.getByTestId("public-reactions-enabled").uncheck();
            await expect(guest2.page.getByTestId("public-reaction-button")).toBeDisabled({ timeout: 15_000 });
            await host.page.locator("#close-host-controls").click();

            const guestOneUid = findMemberUid(await readPublicRoom(roomId), "Guest One");
            expect(guestOneUid).toBeTruthy();
            await host.page.getByTestId("public-delete-message").first().click();
            await expect(guest2.page.getByTestId("public-chat-list")).not.toContainText("سلام 👋", { timeout: 15_000 });
            await capture(host.page, "delete-message");

            await guest2.page.setViewportSize({ width: 360, height: 800 });
            await assertNoOverflow(guest2.page, 360);
            await capture(guest2.page, "guest-room-mobile");
            await captureV5(guest2.page, "public-guest-controls-mobile");
            await guest2.page.getByTestId("public-members-tab").click();
            await capture(guest2.page, "members-mobile");
            await guest2.page.getByTestId("public-chat-tab").click();
            await capture(guest2.page, "chat-mobile");
            await guest2.page.getByTestId("public-reactions-enabled").isHidden();

            await host.page.getByTestId("public-open-host-controls").click();
            await host.page.getByTestId("public-toggle-lock").click();
            await expect.poll(async () => (await readDirectoryRoom(roomId)).status).toBe("locked");
            await host.page.locator("#close-host-controls").click();
            await lateGuest.page.goto(`${PUBLIC_URL}?room=${roomId}`, { waitUntil: "domcontentloaded" });
            await expect(lateGuest.page.locator("#state-preview")).toBeVisible();
            await expect(lateGuest.page.getByTestId("public-join-submit")).toBeDisabled();
            await capture(lateGuest.page, "join-preview-locked");

            await host.page.getByTestId("public-open-host-controls").click();
            await host.page.getByTestId("public-toggle-lock").click();
            await expect.poll(async () => (await readDirectoryRoom(roomId)).status).toBe("open");
            await host.page.locator("#close-host-controls").click();
            await lateGuest.page.goto(`${PUBLIC_URL}?room=${roomId}`, { waitUntil: "domcontentloaded" });
            await lateGuest.page.getByTestId("public-join-name").fill("Late Guest");
            await lateGuest.page.getByTestId("public-join-submit").click();
            await expect(lateGuest.page.locator("#state-room")).toBeVisible({ timeout: 30_000 });
            await expect(host.page.getByTestId("public-room-count")).toContainText("۴ / ۴");
            await capture(lateGuest.page, "replacement-guest");
            await fullGuest.page.goto(`${PUBLIC_URL}?room=${roomId}`, { waitUntil: "domcontentloaded" });
            await expect(fullGuest.page.locator("#state-preview")).toBeVisible();
            await expect(fullGuest.page.getByTestId("public-join-submit")).toBeDisabled();
            await capture(fullGuest.page, "join-preview-full");

            await host.page.getByTestId("public-members-tab").click();
            await host.page.getByTestId("public-member-list").locator("[data-member-name='Guest One']").getByTestId("public-kick-member").click();
            await expect(host.page.getByTestId("public-confirm-dialog")).toBeVisible();
            await capture(host.page, "kick-member");
            await host.page.getByTestId("public-confirm-dialog").getByRole("button", { name: "اخراج" }).click();
            await expect.poll(async () => Boolean((await readPublicRoom(roomId)).members?.[guestOneUid])).toBe(false);
            await expect.poll(async () => Boolean((await readPublicRoom(roomId)).bans?.[guestOneUid])).toBe(true);
            await expect(guest1.page.locator("#state-ended")).toBeVisible({ timeout: 15_000 });

            await host.page.setViewportSize({ width: 390, height: 844 });
            await assertNoOverflow(host.page, 390);
            await captureV5(host.page, "public-host-controls-mobile");
            await host.page.getByTestId("public-open-host-controls").click();
            await capture(host.page, "host-management-mobile");
            await host.page.getByTestId("public-end-room").click();
            await expect(host.page.getByTestId("public-confirm-dialog")).toBeVisible();
            await capture(host.page, "room-end-confirm");
            await host.page.getByRole("button", { name: "پایان و حذف اتاق" }).click();
            await expect(host.page.locator("#state-ended")).toBeVisible({ timeout: 15_000 });
            await expect(guest2.page.locator("#state-ended")).toBeVisible({ timeout: 15_000 });
            await expect(lateGuest.page.locator("#state-ended")).toBeVisible({ timeout: 15_000 });

            assertCleanParticipant(host);
            assertCleanParticipant(guest1);
            assertCleanParticipant(guest2);
            assertCleanParticipant(lateGuest);
            assertCleanParticipant(fullGuest);
        } finally {
            await closeParticipants(host, guest1, guest2, lateGuest, fullGuest);
            buildIndex();
        }
    });

    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1600]) {
        test(`public discovery is responsive at ${width}px`, async ({ browser }) => {
            const viewport = { width, height: width < 768 ? 844 : 900 };
            const user = await newParticipant(browser, `public-mobile-${width}`, { viewport, screen: viewport, isMobile: width < 768, hasTouch: width < 768 });
            try {
                await user.page.goto(PUBLIC_URL, { waitUntil: "domcontentloaded" });
                await expect(user.page.locator("#state-directory")).toBeVisible();
                const metrics = await assertNoOverflow(user.page, width);
                expect(metrics.innerWidth).toBe(width);
                if (width === 390) await capture(user.page, "discovery-mobile-390");
                if (width === 360) await capture(user.page, "discovery-mobile-360");
                assertCleanParticipant(user);
            } finally {
                await closeParticipants(user);
            }
        });
    }
});

async function assertNoOverflow(page, expectedWidth) {
    const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }));
    expect(metrics.innerWidth).toBe(expectedWidth);
    expect(metrics.overflow).toBe(false);
    return metrics;
}

async function readDirectoryRoom(roomId) {
    const response = await fetch(`${RTDB_ORIGIN}/publicRoomDirectory/${roomId}.json?ns=${NS}&auth_variable_override=${ADMIN}`, {
        headers: { Authorization: "Bearer owner" }
    });
    if (!response.ok) throw new Error(`read directory failed: ${response.status}`);
    return response.json();
}

async function readPublicRoom(roomId) {
    const response = await fetch(`${RTDB_ORIGIN}/publicRooms/${roomId}.json?ns=${NS}`, {
        headers: { Authorization: "Bearer owner" }
    });
    if (!response.ok) throw new Error(`read public room failed: ${response.status}`);
    return response.json();
}

function findMemberUid(room, displayName) {
    return Object.entries(room?.members || {}).find(([, member]) => member.displayName === displayName)?.[0] || "";
}

async function capture(page, name) {
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: false });
}

async function captureTo(page, filePath) {
    await page.screenshot({ path: filePath, fullPage: false });
    buildScreenshotIndex(V3_ARTIFACT_DIR, "Public Rooms V3 Screenshots", new Map([
        ["Feature Flags", ["feature", "maintenance"]],
        ["Errors", ["timeout", "rate-limit", "offline", "kicked", "ended"]],
        ["Mobile", ["mobile"]],
        ["Other", []]
    ]));
}

function buildIndex() {
    buildScreenshotIndex(ARTIFACT_DIR, "Public Rooms V4 Screenshots", new Map([
        ["Discovery", ["discovery", "empty"]],
        ["Room Cards", ["room-card", "join-preview-full", "join-preview-locked"]],
        ["Create", ["create"]],
        ["Join", ["join-preview"]],
        ["Chat", ["chat"]],
        ["Reactions", ["reaction"]],
        ["Members", ["members"]],
        ["Host Management", ["host-management", "kick", "delete", "end"]],
        ["Active Room", ["room", "guest", "lobby", "replacement"]],
        ["Mobile", ["mobile"]],
        ["Other", []]
    ]));
    buildScreenshotIndex(V5_ARTIFACT_DIR, "Public Playback V5 Screenshots", new Map([
        ["Host Controls", ["host-controls"]],
        ["Guest Controls", ["guest-controls"]],
        ["Fullscreen", ["fullscreen"]],
        ["MKV", ["mkv"]],
        ["Other", []]
    ]));
}

async function captureV5(page, name) {
    await page.screenshot({ path: path.join(V5_ARTIFACT_DIR, `${name}.png`), fullPage: false });
}

function buildScreenshotIndex(directory, title, groupMatchers) {
    const files = readdirSync(directory).filter((file) => file.endsWith(".png")).sort();
    const groups = new Map([...groupMatchers.keys()].map((group) => [group, []]));
    for (const file of files) {
        const lower = file.toLowerCase();
        let group = "Other";
        for (const [candidate, matchers] of groupMatchers) {
            if (candidate === "Other") continue;
            if (matchers.some((matcher) => lower.includes(matcher))) {
                group = candidate;
                break;
            }
        }
        if (lower.includes("mobile") && groups.has("Mobile")) group = "Mobile";
        groups.get(group).push(file);
    }
    const lines = [`# ${title}`, ""];
    for (const [group, filesInGroup] of groups) {
        if (!filesInGroup.length) continue;
        lines.push(`## ${group}`, "");
        for (const file of filesInGroup) {
            const size = Math.round(statSync(path.join(directory, file)).size / 1024);
            lines.push(`- [${file}](./${file}) (${size} KB)`);
        }
        lines.push("");
    }
    writeFileSync(path.join(directory, "index.md"), `${lines.join("\n")}\n`, "utf8");
}
