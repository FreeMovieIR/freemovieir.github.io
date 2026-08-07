import { expect, test } from "@playwright/test";
import {
    assertCleanParticipant,
    closeParticipants,
    createOwnerRoom,
    joinGuestRoom,
    newParticipant,
    resetEmulators,
    screenshot
} from "./helpers.js";

test.describe("Watch Party Voice V2 E2E", () => {
    test("owner and guest use isolated contexts, one peer each, fake mic tracks, and no renegotiation on toggles", async ({ browser }) => {
        await resetEmulators();
        const owner = await newParticipant(browser, "voice-v2-owner");
        const guest = await newParticipant(browser, "voice-v2-guest");
        try {
            await installFakeMicrophone(owner.page);
            await installFakeMicrophone(guest.page);
            const roomCode = await createOwnerRoom(owner.page, "Voice Owner");
            await joinGuestRoom(guest.page, roomCode, "Voice Guest");
            await expect(owner.page.locator("#participants").getByTestId("participant-guest")).toContainText(/./, { timeout: 15_000 });

            await expect(owner.page.getByTestId("voice-status")).toBeVisible();
            await expect(guest.page.getByTestId("voice-status")).toBeVisible();

            await waitForVoiceStarted(owner.page);
            await waitForVoiceStarted(guest.page);
            await waitForVoicePeer(owner.page);
            await waitForVoicePeer(guest.page);

            const ownerBefore = await voiceDiagnostics(owner.page);
            const guestBefore = await voiceDiagnostics(guest.page);
            expect(ownerBefore.peerCount).toBe(1);
            expect(guestBefore.peerCount).toBe(1);
            expect(ownerBefore.transceiverCount).toBe(1);
            expect(guestBefore.transceiverCount).toBe(1);
            expect(ownerBefore.senderCount).toBe(1);
            expect(guestBefore.senderCount).toBe(1);
            expect(ownerBefore.offerCount).toBe(1);
            expect(guestBefore.offerCount).toBe(0);
            expect(guestBefore.answerCount).toBe(1);

            await guest.page.locator("#mic-button").click();
            await owner.page.waitForFunction(async () => {
                const diagnostics = await window.__watchPartyTest?.voiceV2Diagnostics?.();
                return diagnostics?.remoteReceivedTrackCount >= 1;
            }, null, { timeout: 20_000 });

            await owner.page.locator("#mic-button").click();
            await guest.page.waitForFunction(async () => {
                const diagnostics = await window.__watchPartyTest?.voiceV2Diagnostics?.();
                return diagnostics?.remoteReceivedTrackCount >= 1;
            }, null, { timeout: 20_000 });

            await screenshot(owner.page, "voice-connected-owner");
            await screenshot(guest.page, "voice-connected-guest");

            await guest.page.locator("#mic-button").click();
            await owner.page.locator("#mic-button").click();
            await guest.page.locator("#mic-button").click();
            await owner.page.locator("#mic-button").click();

            const ownerAfter = await voiceDiagnostics(owner.page);
            const guestAfter = await voiceDiagnostics(guest.page);
            expect(ownerAfter.peerCount).toBe(1);
            expect(guestAfter.peerCount).toBe(1);
            expect(ownerAfter.peerCreateCount).toBe(1);
            expect(guestAfter.peerCreateCount).toBe(1);
            expect(ownerAfter.transceiverCount).toBe(1);
            expect(guestAfter.transceiverCount).toBe(1);
            expect(ownerAfter.offerCount).toBe(ownerBefore.offerCount);
            expect(guestAfter.answerCount).toBe(guestBefore.answerCount);
            expect(ownerAfter.replaceTrackCount).toBeGreaterThanOrEqual(3);
            expect(guestAfter.replaceTrackCount).toBeGreaterThanOrEqual(3);

            await expect(owner.page.locator(".toast", { hasText: "در حال بازیابی" })).toHaveCount(0);
            await expect(guest.page.locator(".toast", { hasText: "در حال بازیابی" })).toHaveCount(0);
            await expect(owner.page.getByTestId("voice-status")).toHaveCount(1);
            await expect(guest.page.getByTestId("voice-status")).toHaveCount(1);

            assertCleanParticipant(owner);
            assertCleanParticipant(guest);
        } finally {
            await closeParticipants(owner, guest);
        }
    });
});

async function installFakeMicrophone(page) {
    const install = () => {
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                async getUserMedia(constraints) {
                    if (!constraints?.audio) throw new DOMException("audio required", "NotFoundError");
                    const context = new AudioContext();
                    const oscillator = context.createOscillator();
                    oscillator.frequency.value = 440;
                    const destination = context.createMediaStreamDestination();
                    oscillator.connect(destination);
                    oscillator.start();
                    const [track] = destination.stream.getAudioTracks();
                    const originalStop = track.stop.bind(track);
                    track.stop = () => {
                        oscillator.stop();
                        context.close();
                        originalStop();
                    };
                    return destination.stream;
                }
            }
        });
    };
    await page.addInitScript(install);
    await page.evaluate(install);
}

async function waitForVoiceStarted(page) {
    await page.waitForFunction(() => Boolean(window.__watchPartyTest?.voiceStarted), null, { timeout: 15_000 });
}

async function waitForVoicePeer(page) {
    await page.waitForFunction(async () => {
        const diagnostics = await window.__watchPartyTest?.voiceV2Diagnostics?.();
        return diagnostics?.peerCount === 1 && diagnostics?.transceiverCount === 1 && diagnostics?.senderCount === 1;
    }, null, { timeout: 20_000 });
}

async function voiceDiagnostics(page) {
    return page.evaluate(() => window.__watchPartyTest.voiceV2Diagnostics());
}
