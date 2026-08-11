import { test, expect } from "@playwright/test";

const HARNESS_URL = "http://127.0.0.1:8080/watch-party/dev/mediabunny-harness.html";

test.describe("Firebase-independent Mediabunny browser playback", () => {
    test("generated Matroska/WebM fixture decodes, renders, plays, pauses, seeks, changes rate, and destroys", async ({ page }) => {
        const monitor = monitorPage(page);
        await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("mkv-load")).toBeVisible();
        const importMapText = await page.locator("script[type='importmap']").evaluate((element) => element.textContent || "");
        expect(importMapText).toContain("../vendor/mediabunny/mediabunny.min.mjs");

        const mediaUrl = await createGeneratedWebmUrl(page, { durationMs: 3200, audio: true });
        await page.getByTestId("mkv-url").fill(mediaUrl);
        await page.getByTestId("mkv-load").click();
        await expect.poll(() => getHarnessDiagnostics(page), { timeout: 20_000 }).toMatchObject({
            event: "ready",
            engine: "mediabunny",
            canvasActive: true,
            videoDecodable: true,
            audioDecodable: true
        });
        await expect.poll(() => getHarnessDiagnostics(page).then((diag) => diag.duration), { timeout: 10_000 }).toBeGreaterThan(2);
        await expect(page.getByTestId("mkv-canvas")).toBeVisible();
        await expect(page.locator("#video")).toBeHidden();
        await expect.poll(() => page.evaluate(() => window.__mediabunnyHarness.canvasPixelSum()), { timeout: 10_000 }).toBeGreaterThan(0);

        await page.getByTestId("mkv-play").click();
        await expect.poll(() => getHarnessDiagnostics(page).then((diag) => diag.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.35);
        await expect.poll(() => getHarnessDiagnostics(page).then((diag) => diag.audioNodesQueued), { timeout: 10_000 }).toBeGreaterThan(0);

        await page.getByTestId("mkv-pause").click();
        const pausedAt = await getCurrentTime(page);
        await page.waitForTimeout(450);
        expect(Math.abs(await getCurrentTime(page) - pausedAt)).toBeLessThan(0.18);
        await expect.poll(() => getHarnessDiagnostics(page).then((diag) => diag.audioNodesQueued)).toBe(0);

        await page.getByTestId("mkv-play").click();
        await assertRateProgress(page, 1.25);
        await assertRateProgress(page, 1.5);
        await assertRateProgress(page, 0.75);

        await page.evaluate(async () => {
            const harness = window.__mediabunnyHarness;
            const operations = [
                harness.seek(1.0),
                harness.seek(2.0),
                harness.seek(0.6)
            ];
            await Promise.allSettled(operations);
        });
        await expect.poll(() => getCurrentTime(page), { timeout: 10_000 }).toBeLessThan(1.35);
        await expect.poll(() => getCurrentTime(page), { timeout: 10_000 }).toBeGreaterThan(0.45);

        await page.evaluate(async () => {
            const harness = window.__mediabunnyHarness;
            await harness.pause();
            await harness.seek(Math.max(0, harness.diagnostics().duration - 0.25));
        });
        await page.getByTestId("mkv-play").click();
        await expect.poll(() => getHarnessDiagnostics(page).then((diag) => diag.event), { timeout: 10_000 }).toBe("ended");

        await page.evaluate(() => window.__mediabunnyHarness.destroy());
        const destroyed = await getHarnessDiagnostics(page);
        expect(destroyed.canvasActive).toBe(false);
        expect(destroyed.audioNodesQueued).toBe(0);
        expect(monitor.errors).toEqual([]);
    });

    test("source access failures are classified distinctly from codec failures", async ({ page }) => {
        const monitor = monitorPage(page, { allowUnsafePort: true });
        await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded" });
        const result = await page.evaluate(async () => {
            try {
                await window.__mediabunnyHarness.load("http://127.0.0.1:9/missing.mkv", 0);
                return { ok: true };
            } catch (error) {
                return { ok: false, category: error?.category || "unknown" };
            }
        });
        expect(result).toEqual({ ok: false, category: "source-access" });
        expect(monitor.errors).toEqual([]);
    });
});

async function assertRateProgress(page, rate) {
    await page.evaluate((nextRate) => window.__mediabunnyHarness.setPlaybackRate(nextRate), rate);
    const before = await getCurrentTime(page);
    await page.waitForTimeout(450);
    const after = await getCurrentTime(page);
    const delta = after - before;
    expect(delta).toBeGreaterThan(0.22 * rate);
    expect(delta).toBeLessThan(0.8 * rate + 0.4);
}

function monitorPage(page, { allowUnsafePort = false } = {}) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "error" && !(allowUnsafePort && /ERR_UNSAFE_PORT/i.test(text))) errors.push(text);
    });
    page.on("requestfailed", (request) => {
        const url = request.url();
        if (!url.startsWith("http://127.0.0.1:9/")) errors.push(`${url} ${request.failure()?.errorText || ""}`.trim());
    });
    return { errors };
}

async function getCurrentTime(page) {
    return page.evaluate(() => window.__mediabunnyHarness.diagnostics().currentTime);
}

async function getHarnessDiagnostics(page) {
    return page.evaluate(() => window.__mediabunnyHarness.diagnostics());
}

async function createGeneratedWebmUrl(page, { durationMs, audio }) {
    return page.evaluate(async ({ durationMs, audio }) => {
        if (!window.MediaRecorder) throw new Error("MediaRecorder is unavailable in this browser.");
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext("2d");
        const stream = canvas.captureStream(24);
        let audioContext = null;
        let oscillator = null;
        if (audio) {
            audioContext = new AudioContext();
            await audioContext.resume().catch(() => {});
            const destination = audioContext.createMediaStreamDestination();
            oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            gain.gain.value = 0.035;
            oscillator.frequency.value = 330;
            oscillator.connect(gain);
            gain.connect(destination);
            oscillator.start();
            for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
        }
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
            ? "video/webm;codecs=vp8,opus"
            : "video/webm";
        const chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 300_000, audioBitsPerSecond: 48_000 });
        recorder.addEventListener("dataavailable", (event) => {
            if (event.data?.size) chunks.push(event.data);
        });
        const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
        let frame = 0;
        const draw = () => {
            const hue = (frame * 17) % 360;
            context.fillStyle = `hsl(${hue}, 90%, 44%)`;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = "#ffffff";
            context.fillRect((frame * 9) % canvas.width, 42, 72, 72);
            context.fillStyle = "#020617";
            context.font = "32px sans-serif";
            context.fillText(String(frame), 24, 48);
            frame += 1;
        };
        draw();
        const timer = setInterval(draw, 33);
        recorder.start(100);
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        clearInterval(timer);
        recorder.stop();
        await stopped;
        oscillator?.stop();
        for (const track of stream.getTracks()) track.stop();
        await audioContext?.close().catch(() => {});
        if (!chunks.length) throw new Error("Generated WebM fixture is empty.");
        return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    }, { durationMs, audio });
}
