import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import {
    ARTIFACT_DIR,
    BASE_URL,
    ROOM_CODE_PATTERN,
    SAMPLE_MP4_PATH,
    TEST_MEDIA_URL,
    WATCH_PARTY_URL,
    assertCleanParticipant,
    buildScreenshotIndex,
    closeParticipants,
    createJoinedRoom,
    createOwnerRoom,
    goFresh,
    joinGuestRoom,
    newParticipant,
    readRoomAs,
    releaseGuestSlotAs,
    resetEmulators,
    screenshot,
    waitForState
} from "./helpers.js";

test.describe("Watch Party desktop E2E", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-desktop", "Desktop-only multi-user flow.");
    });
    test.afterAll(() => buildScreenshotIndex());

    test("initial welcome stage is isolated and keyboard-accessible", async ({ browser }) => {
        await resetEmulators();
        const visitor = await newParticipant(browser, "visitor");
        try {
            await goFresh(visitor.page);
            await expect(visitor.page.getByTestId("role-host")).toBeVisible();
            await expect(visitor.page.getByTestId("role-guest")).toBeVisible();
            await expect(visitor.page.getByTestId("active-player")).toBeHidden();
            await expect(visitor.page.locator("#tab-chat")).toBeHidden();
            await expect(visitor.page.getByTestId("room-code")).toBeHidden();
            await expect(visitor.page.locator("#mic-button")).toBeHidden();
            await expect(visitor.page.locator("#tab-subtitle")).toBeHidden();
            await expect(visitor.page.getByTestId("room-tab")).toBeHidden();

            await visitor.page.getByTestId("role-host").focus();
            await visitor.page.keyboard.press("Enter");
            await expect(visitor.page.locator("#screen-host-profile")).toBeVisible();

            await visitor.page.goto("/watch-party/?resetSession=1", { waitUntil: "domcontentloaded" });
            await visitor.page.getByTestId("role-guest").focus();
            await visitor.page.keyboard.press("Enter");
            await expect(visitor.page.locator("#screen-guest-code")).toBeVisible();

            await visitor.page.setViewportSize({ width: 390, height: 844 });
            await visitor.page.goto("/watch-party/?resetSession=1", { waitUntil: "domcontentloaded" });
            await screenshot(visitor.page, "welcome-mobile-390");
            await visitor.page.setViewportSize({ width: 360, height: 800 });
            await visitor.page.goto("/watch-party/?resetSession=1", { waitUntil: "domcontentloaded" });
            await screenshot(visitor.page, "welcome-mobile-360");
            await visitor.page.setViewportSize({ width: 1365, height: 900 });
            await visitor.page.goto("/watch-party/?resetSession=1", { waitUntil: "domcontentloaded" });
            await screenshot(visitor.page, "welcome-desktop");
            assertCleanParticipant(visitor);
        } finally {
            await closeParticipants(visitor);
        }
    });

    test("host creates room, guest joins, third user is rejected, lobby starts active room, chat and ending work", async ({ browser }) => {
        await resetEmulators();
        const owner = await newParticipant(browser, "owner");
        const guest = await newParticipant(browser, "guest");
        const third = await newParticipant(browser, "third");
        let replacement;
        try {
            await goFresh(owner.page);
            await owner.page.getByTestId("role-host").click();
            await expect(owner.page.locator("#screen-host-profile")).toBeVisible();
            await expect(owner.page.getByTestId("guest-room-code")).toBeHidden();
            await owner.page.getByTestId("host-display-name").fill("Owner User");
            await screenshot(owner.page, "host-profile");
            await owner.page.locator("#host-profile-form").getByRole("button").first().click();
            await expect(owner.page.locator("#screen-host-media")).toBeVisible();
            await expect(owner.page.getByTestId("host-video-url")).toBeVisible();
            await owner.page.locator("input[name='subtitleMode'][value='url']").check();
            await expect(owner.page.getByTestId("host-subtitle-url")).toBeVisible();
            await owner.page.locator("input[name='subtitleMode'][value='none']").check();
            await owner.page.getByTestId("host-video-url").fill(TEST_MEDIA_URL);
            await screenshot(owner.page, "host-media");
            await owner.page.getByTestId("create-room").dblclick();
            await expect(owner.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            await screenshot(owner.page, "owner-lobby-alone");

            const roomCode = (await owner.page.getByTestId("room-code").textContent()).trim();
            expect(roomCode).toMatch(ROOM_CODE_PATTERN);
            await expect(owner.page.locator("#invite-link")).toHaveValue(new RegExp(`/watch-party/\\?room=${roomCode}$`));
            await expect(owner.page.getByTestId("active-player")).toBeHidden();
            await expect(owner.page.locator("#participants").getByTestId("participant-owner")).toContainText(/Owner/);
            await expect(owner.page.locator("#participants").getByTestId("participant-guest")).toContainText(/./);
            const ownerHookAfterCreate = await owner.page.evaluate(() => window.__watchPartyTest);
            const roomAfterCreate = await readRoomAs(roomCode, ownerHookAfterCreate.uid);
            expect(roomAfterCreate?.ownerUid).toBe(ownerHookAfterCreate.uid);

            await goFresh(guest.page);
            await guest.page.getByTestId("role-guest").click();
            await expect(guest.page.locator("#screen-guest-code")).toBeVisible();
            await expect(guest.page.getByTestId("host-video-url")).toBeHidden();
            await guest.page.getByTestId("guest-room-code").fill(` ${roomCode.toLowerCase()} `);
            await expect(guest.page.getByTestId("guest-room-code")).toHaveValue(roomCode);
            await screenshot(guest.page, "guest-code");
            await guest.page.locator("#guest-code-form").getByRole("button").first().click();
            await expect(guest.page.locator("#screen-guest-profile")).toBeVisible();
            await guest.page.getByTestId("guest-display-name").fill("Guest User");
            await screenshot(guest.page, "guest-profile");
            await guest.page.getByTestId("join-room").dblclick();
            await expect(guest.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            await expect(owner.page.locator("#participants").getByTestId("participant-guest")).toContainText(/Guest/, { timeout: 15_000 });
            await screenshot(owner.page, "lobby-two-users-owner");
            await screenshot(guest.page, "lobby-two-users-guest");
            await expect(guest.page.locator("#lobby-host-actions")).toBeHidden();

            const ownerHook = await owner.page.evaluate(() => window.__watchPartyTest);
            const guestHook = await guest.page.evaluate(() => window.__watchPartyTest);
            expect(ownerHook.uid).toBeTruthy();
            expect(guestHook.uid).toBeTruthy();
            expect(ownerHook.uid).not.toBe(guestHook.uid);
            expect(ownerHook.roomRole).toBe("owner");
            expect(guestHook.roomRole).toBe("guest");

            await goFresh(third.page);
            await third.page.getByTestId("role-guest").click();
            await third.page.getByTestId("guest-room-code").fill(roomCode);
            await third.page.locator("#guest-code-form").getByRole("button").first().click();
            await third.page.getByTestId("guest-display-name").fill("Third User");
            await third.page.getByTestId("join-room").click();
            await expect(third.page.locator("#screen-guest-profile")).toBeVisible();
            await expect(third.page.locator("#guest-name-error")).toContainText(/./);
            await screenshot(third.page, "third-user-rejected");
            const thirdHook = await third.page.evaluate(() => window.__watchPartyTest);
            expect(thirdHook.uid).toBeTruthy();
            expect(new Set([ownerHook.uid, guestHook.uid, thirdHook.uid]).size).toBe(3);
            const roomAfterThird = await owner.page.evaluate(() => window.__watchPartyTest.room);
            expect(roomAfterThird.guestUid).toBe(guestHook.uid);
            expect(roomAfterThird.participantUids).not.toContain(thirdHook.uid);

            await owner.page.getByTestId("ready-button").click();
            await expect(guest.page.locator("#participants").getByTestId("participant-owner")).toContainText(/./);
            await guest.page.getByTestId("ready-button").click();
            await expect(owner.page.getByTestId("countdown")).toBeVisible({ timeout: 10_000 });
            await screenshot(owner.page, "countdown-owner");
            const seen = new Set();
            const started = Date.now();
            while (Date.now() - started < 4_500) {
                const text = await owner.page.getByTestId("countdown").textContent().catch(() => "");
                if (text?.trim()) seen.add(text.trim());
                if (await owner.page.locator("#screen-active-room").isVisible().catch(() => false)) break;
                await owner.page.waitForTimeout(250);
            }
            expect([...seen]).toEqual(expect.arrayContaining(["3", "2", "1"]));
            await expect(owner.page.locator("#screen-active-room")).toBeVisible({ timeout: 10_000 });
            await expect(guest.page.locator("#screen-active-room")).toBeVisible({ timeout: 10_000 });
            await expect(owner.page.locator("#screen-lobby")).toBeHidden();
            await screenshot(owner.page, "active-room-owner");
            await screenshot(guest.page, "active-room-guest");

            const tokenBefore = await owner.page.evaluate(() => window.__watchPartyTest.videoElementToken);
            const timeBefore = await owner.page.getByTestId("active-player").evaluate((video) => video.currentTime);
            await expect(owner.page.locator("#tab-room")).toBeVisible();
            await screenshot(owner.page, "tab-room");
            await owner.page.getByTestId("chat-tab").click();
            await expect(owner.page.locator("#tab-chat")).toBeVisible();
            await screenshot(owner.page, "tab-chat");
            await owner.page.getByTestId("subtitle-tab").click();
            await expect(owner.page.locator("#tab-subtitle")).toBeVisible();
            await screenshot(owner.page, "tab-subtitle");
            await owner.page.getByTestId("settings-tab").click();
            await expect(owner.page.locator("#tab-settings")).toBeVisible();
            await screenshot(owner.page, "tab-settings");
            const tokenAfter = await owner.page.evaluate(() => window.__watchPartyTest.videoElementToken);
            const timeAfter = await owner.page.getByTestId("active-player").evaluate((video) => video.currentTime);
            expect(tokenAfter).toBe(tokenBefore);
            expect(Math.abs(timeAfter - timeBefore)).toBeLessThan(1);
            await owner.page.getByTestId("room-tab").click();
            await expect(owner.page.getByTestId("end-room")).toBeVisible();
            await guest.page.getByTestId("settings-tab").click();
            await expect(guest.page.locator("#active-subtitle-host-controls")).toBeHidden();
            await expect(guest.page.getByTestId("end-room")).toBeHidden();
            await guest.page.getByTestId("room-tab").click();
            await expect(guest.page.getByTestId("leave-room")).toBeVisible();

            await owner.page.getByTestId("chat-tab").click();
            await owner.page.getByTestId("chat-input").fill("Hello guest");
            await owner.page.getByTestId("chat-send").click();
            await expect(guest.page.locator("#chat-unread")).toBeVisible({ timeout: 10_000 });
            await guest.page.getByTestId("chat-tab").click();
            await expect(guest.page.locator("#chat-messages")).toContainText("Hello guest");
            await guest.page.waitForTimeout(950);
            await guest.page.getByTestId("chat-input").fill("Hello owner");
            await guest.page.getByTestId("chat-send").click();
            await expect.poll(() => guest.page.getByTestId("chat-input").inputValue()).toBe("");
            await expect.poll(async () => {
                const room = await readRoomAs(roomCode, guestHook.uid);
                return Object.values(room?.chat || {}).map((message) => message.text);
            }).toContain("Hello owner");
            await expect(owner.page.locator("#chat-messages")).toContainText("Hello owner");
            await guest.page.getByTestId("chat-input").fill("");
            const beforeEmpty = await guest.page.locator(".chat-message").count();
            await guest.page.getByTestId("chat-send").click();
            await expect.poll(() => guest.page.locator(".chat-message").count()).toBe(beforeEmpty);
            await guest.page.getByTestId("chat-input").evaluate((input) => { input.value = "A".repeat(501); });
            await guest.page.locator("#chat-form").evaluate((form) => form.requestSubmit());
            await expect.poll(() => guest.page.locator(".chat-message").count()).toBe(beforeEmpty);

            const payloads = [`<img src=x onerror=alert("xss")>`, `<script>alert("xss")</script>`];
            for (const payload of payloads) {
                await owner.page.getByTestId("chat-input").fill(payload);
                await owner.page.getByTestId("chat-send").click();
                await expect(guest.page.locator("#chat-messages")).toContainText(payload.slice(0, 20), { timeout: 10_000 });
                await owner.page.waitForTimeout(950);
            }
            await screenshot(guest.page, "chat-xss-plain-text");
            await owner.page.locator("[data-reaction]").first().click();
            await expect(guest.page.locator(".reaction-float")).toBeVisible({ timeout: 10_000 });
            await screenshot(guest.page, "reaction");
            await expect(guest.page.locator(".reaction-float")).toHaveCount(0, { timeout: 5_000 });
            await screenshot(owner.page, "chat-two-users");

            await guest.page.getByTestId("room-tab").click();
            await guest.page.getByTestId("leave-room").click();
            await expect(guest.page.locator("#confirm-dialog")).toBeVisible();
            await screenshot(guest.page, "leave-dialog");
            await guest.page.locator("#dialog-cancel").click();
            await expect(guest.page.locator("#screen-active-room")).toBeVisible();
            await guest.page.getByTestId("leave-room").click();
            await guest.page.locator("#dialog-confirm").click();
            await expect(guest.page.locator("#screen-welcome")).toBeVisible({ timeout: 15_000 });
            await expect(owner.page.locator("#active-participants").getByTestId("participant-guest")).toContainText(/./, { timeout: 15_000 });

            replacement = await newParticipant(browser, "replacement");
            await joinGuestRoom(replacement.page, roomCode, "Replacement Guest");
            await expect(owner.page.locator("#active-participants").getByTestId("participant-guest")).toContainText(/Replacement/, { timeout: 15_000 });
            await screenshot(replacement.page, "replacement-guest");

            await owner.page.getByTestId("room-tab").click();
            await owner.page.getByTestId("end-room").click();
            await expect(owner.page.locator("#confirm-dialog")).toBeVisible();
            await owner.page.locator("#dialog-confirm").click();
            await expect(owner.page.getByTestId("room-ended-state")).toBeVisible({ timeout: 15_000 });
            await expect(replacement.page.getByTestId("room-ended-state")).toBeVisible({ timeout: 15_000 });
            await expect(owner.page.getByTestId("active-player")).toBeHidden();
            await screenshot(owner.page, "room-ended-owner");
            await screenshot(replacement.page, "room-ended-guest");

            assertCleanParticipant(owner);
            assertCleanParticipant(guest);
            assertCleanParticipant(third);
            assertCleanParticipant(replacement);
        } finally {
            await closeParticipants(owner, guest, third, replacement);
        }
    });

    test("invitation URL preloads guest code without auto-joining", async ({ browser }) => {
        await resetEmulators();
        const owner = await newParticipant(browser, "owner-invite");
        const invitee = await newParticipant(browser, "invitee");
        try {
            const roomCode = await createOwnerRoom(owner.page, "Invite Owner");
            await invitee.page.goto(`/watch-party/?room=${roomCode.toLowerCase()}`, { waitUntil: "domcontentloaded" });
            await expect(invitee.page.locator("#screen-guest-code")).toBeVisible();
            await expect(invitee.page.getByTestId("guest-room-code")).toHaveValue(roomCode);
            await expect(invitee.page.locator("#invitation-detected")).toBeVisible();
            await expect(invitee.page.locator("#screen-lobby")).toBeHidden();
            await invitee.page.locator("[data-action='switch-host']").click();
            await expect(invitee.page.locator("#screen-host-profile")).toBeVisible();
            await screenshot(invitee.page, "invitation-prefilled");
            assertCleanParticipant(owner);
            assertCleanParticipant(invitee);
        } finally {
            await closeParticipants(owner, invitee);
        }
    });

    test("owner and guest refresh restore membership without wrong role", async ({ browser }) => {
        const { owner, guest, roomCode } = await createJoinedRoom(browser);
        try {
            await screenshot(owner.page, "restoring-room");
            await owner.page.reload({ waitUntil: "domcontentloaded" });
            await expect(owner.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            await expect(owner.page.getByTestId("room-code")).toHaveText(roomCode);
            await expect(owner.page.locator("#participants").getByTestId("participant-owner")).toContainText(/Owner/);
            const ownerAfter = await owner.page.evaluate(() => window.__watchPartyTest);
            expect(ownerAfter.roomRole).toBe("owner");
            await screenshot(owner.page, "restored-owner");

            await guest.page.reload({ waitUntil: "domcontentloaded" });
            await expect(guest.page.locator("#screen-lobby")).toBeVisible({ timeout: 20_000 });
            const guestAfter = await guest.page.evaluate(() => window.__watchPartyTest);
            expect(guestAfter.roomRole).toBe("guest");
            expect(guestAfter.roomCode).toBe(roomCode);
            const room = await owner.page.evaluate(() => window.__watchPartyTest.room);
            expect(room.participantUids.filter(Boolean).length).toBe(2);
            await screenshot(guest.page, "restored-guest");
            assertCleanParticipant(owner);
            assertCleanParticipant(guest);
        } finally {
            await closeParticipants(owner, guest);
        }
    });

    test("restore cancellation returns to Welcome and ignores late restore completion", async ({ browser }) => {
        await resetEmulators();
        const owner = await newParticipant(browser, "restore-cancel-owner");
        try {
            await createOwnerRoom(owner.page, "Restore Owner");
            await owner.context.addInitScript(() => {
                window.__WATCH_PARTY_TEST__ = { delayRestoreMs: 1600, restoreTimeoutMs: 5000 };
            });
            await owner.page.reload({ waitUntil: "domcontentloaded" });
            await expect(owner.page.locator("#screen-restoring-room")).toBeVisible({ timeout: 10_000 });
            await expect(owner.page.getByTestId("restore-cancel")).toBeVisible();
            await screenshot(owner.page, "restoring-with-cancel");
            await owner.page.getByTestId("restore-cancel").click();
            await expect(owner.page.locator("#screen-welcome")).toBeVisible();
            await expect(owner.page).not.toHaveURL(/room=|resetSession=|restore=/);
            await screenshot(owner.page, "welcome-after-restore-cancel");
            await owner.page.waitForTimeout(2200);
            await expect(owner.page.locator("#screen-welcome")).toBeVisible();
            await expect.poll(() => owner.page.evaluate(() => window.__watchPartyTest.roomListenerActive)).toBe(false);
            await owner.page.reload({ waitUntil: "domcontentloaded" });
            await expect(owner.page.locator("#screen-welcome")).toBeVisible();
            await owner.page.getByTestId("role-host").click();
            await expect(owner.page.locator("#screen-host-profile")).toBeVisible();
            await owner.page.locator("#screen-host-profile [data-action='back-role']").click();
            await expect(owner.page.locator("#screen-welcome")).toBeVisible();
            await owner.page.getByTestId("role-guest").click();
            await expect(owner.page.locator("#screen-guest-code")).toBeVisible();
            assertCleanParticipant(owner);
        } finally {
            await closeParticipants(owner);
        }
    });

    test("restore timeout shows retry and cancel without automatic retry loop", async ({ browser }) => {
        await resetEmulators();
        const owner = await newParticipant(browser, "restore-timeout-owner");
        try {
            await createOwnerRoom(owner.page, "Timeout Owner");
            await owner.context.addInitScript(() => {
                window.__WATCH_PARTY_TEST__ = { delayRestoreMs: 5000, restoreTimeoutMs: 900 };
            });
            await owner.page.reload({ waitUntil: "domcontentloaded" });
            await expect(owner.page.locator("#screen-restoring-room")).toBeVisible();
            await expect(owner.page.locator("#screen-restore-failed")).toBeVisible({ timeout: 5_000 });
            await expect(owner.page.getByTestId("restore-retry-failed")).toBeVisible();
            await expect(owner.page.getByTestId("restore-cancel-failed")).toBeVisible();
            await screenshot(owner.page, "restore-timeout");
            await screenshot(owner.page, "restore-failed-actions");
            const attempts = await owner.page.evaluate(() => window.__watchPartyTest.restoreAttemptCount);
            await owner.page.waitForTimeout(1400);
            await expect.poll(() => owner.page.evaluate(() => window.__watchPartyTest.restoreAttemptCount)).toBe(attempts);
            await owner.page.getByTestId("restore-cancel-failed").click();
            await expect(owner.page.locator("#screen-welcome")).toBeVisible();
            assertCleanParticipant(owner);
        } finally {
            await closeParticipants(owner);
        }
    });

    test("manual restore retry starts one active attempt and disables retry while pending", async ({ browser }) => {
        await resetEmulators();
        const owner = await newParticipant(browser, "restore-retry-owner");
        try {
            await createOwnerRoom(owner.page, "Retry Owner");
            await owner.context.addInitScript(() => {
                window.__WATCH_PARTY_TEST__ = { delayRestoreMs: 5000, restoreTimeoutMs: 700 };
            });
            await owner.page.reload({ waitUntil: "domcontentloaded" });
            await expect(owner.page.locator("#screen-restore-failed")).toBeVisible({ timeout: 5_000 });
            const before = await owner.page.evaluate(() => window.__watchPartyTest.restoreAttemptCount);
            await owner.page.getByTestId("restore-retry-failed").click();
            await expect(owner.page.locator("#screen-restoring-room")).toBeVisible();
            await expect(owner.page.getByTestId("restore-retry")).toBeDisabled();
            await expect.poll(() => owner.page.evaluate(() => window.__watchPartyTest.restoreAttemptCount)).toBe(before + 1);
            await owner.page.getByTestId("restore-cancel").click();
            await expect(owner.page.locator("#screen-welcome")).toBeVisible();
            assertCleanParticipant(owner);
        } finally {
            await closeParticipants(owner);
        }
    });

    test("removed guest is not trapped in restoration and cannot reclaim a replaced slot", async ({ browser }) => {
        const { owner, guest, roomCode } = await createJoinedRoom(browser);
        try {
            const ownerHook = await owner.page.evaluate(() => window.__watchPartyTest);
            const guestHook = await guest.page.evaluate(() => window.__watchPartyTest);
            await releaseGuestSlotAs(roomCode, guestHook.uid);
            await guest.page.reload({ waitUntil: "domcontentloaded" });
            await expect(guest.page.locator("#screen-restore-failed")).toBeVisible({ timeout: 15_000 });
            await expect(guest.page.getByTestId("restore-failed-message")).toContainText(/جایگاه|دسترسی/);
            await expect(guest.page.getByTestId("restore-retry-failed")).toBeHidden();
            await guest.page.getByTestId("restore-cancel-failed").click();
            await expect(guest.page.locator("#screen-welcome")).toBeVisible();
            const room = await readRoomAs(roomCode, ownerHook.uid);
            expect(room.guestUid || null).toBe(null);
            assertCleanParticipant(owner);
            assertCleanParticipant(guest);
        } finally {
            await closeParticipants(owner, guest);
        }
    });

    test("documents playback E2E availability", async () => {
        test.skip(!existsSync(SAMPLE_MP4_PATH), "Manual playback E2E required: test-assets/sample.mp4 is not present.");
        expect(existsSync(SAMPLE_MP4_PATH)).toBe(true);
    });
});


