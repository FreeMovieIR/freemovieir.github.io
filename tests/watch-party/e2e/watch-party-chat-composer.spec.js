import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
    assertCleanParticipant,
    closeParticipants,
    createJoinedRoom,
    createOwnerRoom,
    joinGuestRoom,
    newParticipant,
    resetEmulators
} from "./helpers.js";

const COMPOSER_ARTIFACT_DIR = path.resolve("artifacts/watch-party/chat-composer-redesign");

mkdirSync(COMPOSER_ARTIFACT_DIR, { recursive: true });

test.describe("Watch Party chat composer", () => {
    test("desktop composer is integrated, keyboard-safe, and preserves chat behavior", async ({ browser }) => {
        const { owner, guest } = await createActiveRoom(browser);

        try {
            await owner.page.getByTestId("chat-tab").click();
            const composer = owner.page.getByTestId("chat-composer");
            const input = owner.page.getByTestId("chat-input");
            const send = owner.page.getByTestId("chat-send");

            await expect(composer).toBeVisible();
            await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
            await expect(send).toBeDisabled();
            await capture(owner.page, "desktop-empty");

            await input.focus();
            await capture(owner.page, "desktop-focused");

            await input.fill("سلام، آماده‌ای؟");
            await expect(send).toBeEnabled();
            await expect(owner.page.locator("#chat-count")).toHaveText("15 / 500");
            await capture(owner.page, "desktop-typing");

            await input.fill("ا".repeat(425));
            await expect(owner.page.locator("#chat-count")).toHaveClass(/is-warning/);
            await capture(owner.page, "desktop-near-limit");

            await input.fill("ا".repeat(500));
            await input.press("A");
            await expect.poll(() => input.inputValue().then((value) => value.length)).toBe(500);
            await expect(owner.page.locator("#chat-count")).toHaveClass(/is-limit/);

            await input.fill("خط اول");
            await input.press("Shift+Enter");
            await expect(input).toHaveValue(/خط اول\n/);

            const beforeComposition = await owner.page.locator(".chat-message").count();
            await input.evaluate((textarea) => {
                textarea.value = "پیام در حال ترکیب";
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                textarea.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                    isComposing: true
                }));
            });
            await owner.page.waitForTimeout(500);
            await expect.poll(() => owner.page.locator(".chat-message").count()).toBe(beforeComposition);

            await input.fill("پیام با Enter");
            await input.press("Enter");
            await expect.poll(() => input.inputValue()).toBe("");
            await expect(owner.page.locator("#chat-messages")).toContainText("پیام با Enter", { timeout: 10_000 });
            await expect(input).toHaveJSProperty("scrollTop", 0);
            await expect.poll(async () => Math.round((await input.boundingBox()).height)).toBeLessThanOrEqual(60);
            await expect(send).toBeDisabled();

            await owner.page.waitForTimeout(950);
            await input.fill("پیام چندخطی\nخط دوم\nخط سوم\nخط چهارم");
            const expandedHeight = await input.boundingBox();
            expect(expandedHeight.height).toBeGreaterThan(70);
            await send.click();
            await expect.poll(() => input.inputValue()).toBe("");
            await expect.poll(async () => Math.round((await input.boundingBox()).height)).toBeLessThanOrEqual(60);
            await expect(guest.page.locator("#chat-unread")).toBeVisible({ timeout: 10_000 });
            await guest.page.getByTestId("chat-tab").click();
            await expect(guest.page.locator("#chat-messages")).toContainText("پیام چندخطی", { timeout: 10_000 });
            await expect(owner.page.locator("#chat-messages")).toContainText("دیده شد", { timeout: 10_000 });

            await owner.page.locator("[data-reaction='🍿']").click();
            await expect(guest.page.locator(".reaction-float")).toBeVisible({ timeout: 10_000 });

            await expectNoHorizontalOverflow(owner.page);
            assertCleanParticipant(owner);
            assertCleanParticipant(guest);
        } finally {
            await closeParticipants(owner, guest);
            writeComposerIndex();
        }
    });

    for (const [name, viewport] of Object.entries({
        "iphone-320": { width: 320, height: 720 },
        "iphone-360": { width: 360, height: 800 },
        "iphone-375": { width: 375, height: 812 },
        "iphone-390": { width: 390, height: 844 },
        "iphone-430": { width: 430, height: 932 }
    })) {
        test(`${name} composer has no horizontal overflow and keeps iPhone-safe text sizing`, async ({ browser }) => {
            await resetEmulators();
            const owner = await newParticipant(browser, `${name}-owner`, {
                viewport,
                screen: viewport,
                isMobile: true,
                hasTouch: true
            });
            const guest = await newParticipant(browser, `${name}-guest`);

            try {
                const roomCode = await createOwnerRoom(owner.page, "Mobile Owner");
                await joinGuestRoom(guest.page, roomCode, "Mobile Guest");
                await owner.page.getByTestId("ready-button").click();
                await guest.page.getByTestId("ready-button").click();
                await expect(owner.page.locator("#screen-active-room")).toBeVisible({ timeout: 10_000 });
                await owner.page.getByTestId("chat-tab").click();
                await expect(owner.page.locator("#tab-chat")).toBeVisible();
                await expect.poll(() => owner.page.evaluate(() => window.innerWidth)).toBe(viewport.width);

                const input = owner.page.getByTestId("chat-input");
                const send = owner.page.getByTestId("chat-send");
                const fontSize = await input.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
                expect(fontSize).toBeGreaterThanOrEqual(16);
                const sendBox = await send.boundingBox();
                expect(sendBox.height).toBeGreaterThanOrEqual(44);
                await expect(send).toBeDisabled();
                await expectNoHorizontalOverflow(owner.page);

                if (name === "iphone-390") await capture(owner.page, "iphone-empty");
                await input.focus();
                if (name === "iphone-390") await capture(owner.page, "iphone-focused");
                await input.fill("سلام\nاین یک پیام چندخطی برای تست موبایل است.");
                await expect(send).toBeEnabled();
                await expectNoHorizontalOverflow(owner.page);
                if (name === "iphone-390") await capture(owner.page, "iphone-multiline");

                assertCleanParticipant(owner);
                assertCleanParticipant(guest);
            } finally {
                await closeParticipants(owner, guest);
                writeComposerIndex();
            }
        });
    }
});

async function createActiveRoom(browser) {
    const room = await createJoinedRoom(browser);
    await room.owner.page.getByTestId("ready-button").click();
    await room.guest.page.getByTestId("ready-button").click();
    await expect(room.owner.page.locator("#screen-active-room")).toBeVisible({ timeout: 10_000 });
    await expect(room.guest.page.locator("#screen-active-room")).toBeVisible({ timeout: 10_000 });
    return room;
}

async function expectNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
}

async function capture(page, name) {
    await page.screenshot({
        path: path.join(COMPOSER_ARTIFACT_DIR, `${name}.png`),
        fullPage: false
    });
}

function writeComposerIndex() {
    const files = [
        "desktop-empty.png",
        "desktop-focused.png",
        "desktop-typing.png",
        "desktop-near-limit.png",
        "iphone-empty.png",
        "iphone-focused.png",
        "iphone-multiline.png"
    ];
    const lines = ["# Watch Party Chat Composer Redesign", ""];
    for (const file of files) {
        lines.push(`- [${file}](./${file})`);
    }
    writeFileSync(path.join(COMPOSER_ARTIFACT_DIR, "index.md"), `${lines.join("\n")}\n`, "utf8");
}
