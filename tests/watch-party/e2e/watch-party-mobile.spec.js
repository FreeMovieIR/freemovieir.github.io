import { test, expect } from "@playwright/test";
import {
    BASE_URL,
    assertCleanParticipant,
    buildScreenshotIndex,
    closeParticipants,
    goFresh,
    newParticipant,
    resetEmulators,
    screenshot
} from "./helpers.js";

function mobileLabel(projectName) {
    return projectName === "mobile-390" ? "mobile-390" : "mobile-360";
}

function mobileViewport(projectName) {
    return projectName === "mobile-390" ? { width: 390, height: 844 } : { width: 360, height: 800 };
}

async function expectNoHorizontalOverflow(page, expectedWidth) {
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(expectedWidth);
    const metrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
}

test.describe("Watch Party mobile E2E", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(!["mobile-390", "mobile-360"].includes(testInfo.project.name), "Mobile viewport projects only.");
    });
    test.afterAll(() => buildScreenshotIndex());

    test("mobile setup, lobby, active room, chat, and dialog fit the requested viewport", async ({ browser }, testInfo) => {
        await resetEmulators();
        const viewport = mobileViewport(testInfo.project.name);
        const label = mobileLabel(testInfo.project.name);
        const contextOptions = { viewport, screen: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
        const owner = await newParticipant(browser, `${label}-owner`, contextOptions);
        const guest = await newParticipant(browser, `${label}-guest`, contextOptions);
        try {
            await goFresh(owner.page);
            await expectNoHorizontalOverflow(owner.page, viewport.width);
            await screenshot(owner.page, `${label}-welcome`);
            await owner.page.getByTestId("role-host").click();
            await expect(owner.page.locator("#screen-host-profile")).toBeVisible();
            await owner.page.getByTestId("host-display-name").fill("Mobile Owner");
            await expectNoHorizontalOverflow(owner.page, viewport.width);
            const hostButtonBox = await owner.page.locator("#host-profile-form button[type='submit']").boundingBox();
            expect(hostButtonBox.height).toBeGreaterThanOrEqual(40);
            await screenshot(owner.page, `${label}-host-setup`);
            await owner.page.locator("#host-profile-form button[type='submit']").click();
            await owner.page.getByTestId("host-video-url").fill(`${BASE_URL}/test-assets/sample.vtt`);
            await owner.page.getByTestId("create-room").click();
            await expect(owner.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            await expectNoHorizontalOverflow(owner.page, viewport.width);
            await screenshot(owner.page, `${label}-lobby`);
            const roomCode = (await owner.page.getByTestId("room-code").textContent()).trim();

            await goFresh(guest.page);
            await guest.page.getByTestId("role-guest").click();
            await expect(guest.page.locator("#screen-guest-code")).toBeVisible();
            await guest.page.getByTestId("guest-room-code").fill(roomCode);
            await expectNoHorizontalOverflow(guest.page, viewport.width);
            await screenshot(guest.page, `${label}-guest-setup`);
            await guest.page.locator("#guest-code-form button[type='submit']").click();
            await guest.page.getByTestId("guest-display-name").fill("Mobile Guest");
            await guest.page.getByTestId("join-room").click();
            await guest.page.waitForFunction(() => ["lobby", "active-room"].includes(window.__watchPartyTest?.state), null, { timeout: 20_000 });
            await expectNoHorizontalOverflow(guest.page, viewport.width);

            await owner.page.getByTestId("ready-button").click();
            await guest.page.getByTestId("ready-button").click();
            await expect(owner.page.locator("#screen-active-room")).toBeVisible({ timeout: 10_000 });
            await expect(guest.page.locator("#screen-active-room")).toBeVisible({ timeout: 10_000 });
            await expect(owner.page.getByTestId("active-player")).toBeVisible();
            const firstVisible = await owner.page.locator("#screen-active-room > *").first().evaluate((el) => el.className);
            expect(String(firstVisible)).toContain("cinema");
            await expectNoHorizontalOverflow(owner.page, viewport.width);
            await screenshot(owner.page, `${label}-active-room`);

            await owner.page.getByTestId("chat-tab").click();
            await expect(owner.page.locator("#tab-chat")).toBeVisible();
            await owner.page.getByTestId("chat-input").fill("Mobile chat");
            await expectNoHorizontalOverflow(owner.page, viewport.width);
            await screenshot(owner.page, `${label}-chat-panel`);

            await owner.page.getByTestId("room-tab").click();
            await owner.page.getByTestId("end-room").click();
            await expect(owner.page.locator("#confirm-dialog")).toBeVisible();
            const dialogBox = await owner.page.locator("#confirm-dialog .dialog").boundingBox();
            expect(dialogBox.width).toBeLessThanOrEqual(viewport.width);
            await screenshot(owner.page, `${label}-leave-dialog`);

            assertCleanParticipant(owner);
            assertCleanParticipant(guest);
        } finally {
            await closeParticipants(owner, guest);
        }
    });
});
