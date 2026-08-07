import { test, expect } from "@playwright/test";
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import {
    BASE_URL,
    TEST_MEDIA_URL,
    assertCleanParticipant,
    closeParticipants,
    goFresh,
    newParticipant,
    readRoomAs,
    resetEmulators,
    screenshot
} from "./helpers.js";

test.describe("Watch Party media and emulator regressions", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-desktop", "Desktop-only regression coverage.");
    });

    test("blocked emulator ports show service unavailable and do not save a room session", async ({ browser }) => {
        await resetEmulators();
        const owner = await newParticipant(browser, "emulator-outage-owner");
        await owner.context.addInitScript(() => {
            window.__WATCH_PARTY_TEST__ = { forceServiceStatus: "both-unavailable" };
        });
        try {
            await goFresh(owner.page);
            await owner.page.evaluate(() => {
                window.__WATCH_PARTY_TEST__ ||= {};
                window.__WATCH_PARTY_TEST__.forceServiceStatus = "both-unavailable";
            });
            await owner.page.getByTestId("role-host").click();
            await expect(owner.page.locator("#screen-service-unavailable")).toBeVisible({ timeout: 10_000 });
            await expect(owner.page.getByTestId("service-retry")).toBeVisible();
            await expect(owner.page.getByTestId("service-back")).toBeVisible();
            await screenshot(owner.page, "firebase-offline-service-unavailable");
            const storedRoomKeys = await owner.page.evaluate(() => Object.keys(localStorage).filter((key) => /watchParty.*room/i.test(key)));
            expect(storedRoomKeys).toEqual([]);
            await owner.page.evaluate(() => { window.__WATCH_PARTY_TEST__.forceServiceStatus = null; });
            await owner.page.getByTestId("service-back").click();
            await expect(owner.page.locator("#screen-welcome")).toBeVisible();
            await owner.page.getByTestId("role-host").click();
            await expect(owner.page.locator("#screen-host-profile")).toBeVisible();
            await owner.page.getByTestId("host-display-name").fill("Outage Owner");
            await owner.page.locator("#host-profile-form").getByRole("button").first().click();
            await owner.page.getByTestId("host-video-url").fill(TEST_MEDIA_URL);
            await owner.page.getByTestId("create-room").click();
            await expect(owner.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            const hook = await owner.page.evaluate(() => window.__watchPartyTest);
            const createdRoom = await readRoomAs(hook.roomCode, hook.uid);
            expect(createdRoom?.ownerUid).toBe(hook.uid);
        } finally {
            await closeParticipants(owner);
        }
    });

    test("same MP4 fixture reaches metadata in /player and Watch Party native adapter", async ({ browser }) => {
        await resetEmulators();
        const playerContext = await browser.newContext();
        const player = await playerContext.newPage();
        const owner = await newParticipant(browser, "native-parity-owner");
        try {
            await player.goto(`${BASE_URL}/player/`, { waitUntil: "domcontentloaded" });
            await player.locator("#videoUrl").fill(TEST_MEDIA_URL);
            await player.evaluate(() => window.initPlayer());
            await player.locator("#videoPlayer").evaluate((video) => new Promise((resolve, reject) => {
                if (video.readyState >= 1) resolve();
                video.addEventListener("loadedmetadata", resolve, { once: true });
                video.addEventListener("error", () => reject(new Error("player metadata failed")), { once: true });
            }));

            await goFresh(owner.page);
            await owner.page.getByTestId("role-host").click();
            await owner.page.getByTestId("host-display-name").fill("Native Owner");
            await owner.page.locator("#host-profile-form").getByRole("button").first().click();
            await owner.page.getByTestId("host-video-url").fill(TEST_MEDIA_URL);
            await owner.page.getByTestId("create-room").click();
            await expect(owner.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            await expect.poll(() => owner.page.evaluate(() => window.__watchPartyTest.mediaDiagnostics?.readyState || 0)).toBeGreaterThanOrEqual(1);
            const diagnostics = await owner.page.evaluate(() => window.__watchPartyTest.mediaDiagnostics);
            expect(diagnostics.adapter).toBe("native");
            expect(diagnostics.crossOrigin).toBe("");
            await screenshot(owner.page, "native-media-watch-party-ready");
            assertCleanParticipant(owner);
        } finally {
            await playerContext.close();
            await closeParticipants(owner);
        }
    });

    test("native playback works from a no-CORS second local origin", async ({ browser }) => {
        await resetEmulators();
        const server = await startNoCorsMediaServer(8091);
        const mediaUrl = "http://127.0.0.1:8091/no-cors.mp4?token=private";
        const rawContext = await browser.newContext({ baseURL: BASE_URL });
        const rawPage = await rawContext.newPage();
        const owner = await newParticipant(browser, "no-cors-owner");
        try {
            await rawPage.goto(`${BASE_URL}/watch-party/`, { waitUntil: "domcontentloaded" });
            const fetchBlocked = await rawPage.evaluate(async (url) => {
                try {
                    await fetch(url, { mode: "cors" });
                    return false;
                } catch {
                    return true;
                }
            }, mediaUrl);
            expect(fetchBlocked).toBe(true);
            const nativeLoaded = await rawPage.evaluate((url) => new Promise((resolve) => {
                const video = document.createElement("video");
                video.preload = "metadata";
                video.addEventListener("loadedmetadata", () => resolve({ ok: true, crossOrigin: video.crossOrigin, readyState: video.readyState }), { once: true });
                video.addEventListener("error", () => resolve({ ok: false, error: video.error?.code || 0 }), { once: true });
                video.src = url;
                video.load();
            }), mediaUrl);
            expect(nativeLoaded.ok).toBe(true);
            expect(nativeLoaded.crossOrigin || "").toBe("");

            await goFresh(owner.page);
            await owner.page.getByTestId("role-host").click();
            await owner.page.getByTestId("host-display-name").fill("No CORS Owner");
            await owner.page.locator("#host-profile-form").getByRole("button").first().click();
            await owner.page.getByTestId("host-video-url").fill(mediaUrl);
            await owner.page.getByTestId("create-room").click();
            await expect(owner.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            await expect.poll(() => owner.page.evaluate(() => window.__watchPartyTest.mediaDiagnostics?.readyState || 0)).toBeGreaterThanOrEqual(1);
            const diagnostics = await owner.page.evaluate(() => window.__watchPartyTest.mediaDiagnostics);
            expect(diagnostics.adapter).toBe("native");
            expect(diagnostics.crossOrigin).toBe("");
            await screenshot(owner.page, "native-media-no-cors-ready");
        } finally {
            await rawContext.close();
            await closeParticipants(owner);
            await new Promise((resolve) => server.close(resolve));
        }
    });
});

function startNoCorsMediaServer(port) {
    const filePath = path.resolve("test-assets/sample.mp4");
    const server = http.createServer((request, response) => {
        if (request.method === "HEAD") {
            response.writeHead(405);
            response.end();
            return;
        }
        if (request.url?.startsWith("/no-cors.mp4")) {
            const stat = statSync(filePath);
            response.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Length": stat.size,
                "Accept-Ranges": "bytes"
            });
            createReadStream(filePath).pipe(response);
            return;
        }
        response.writeHead(404);
        response.end();
    });
    return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
