import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const chromeCandidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
const browserLaunchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
    testDir: "tests/watch-party/e2e",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }]
    ],
    outputDir: "test-results/watch-party",
    use: {
        baseURL: "http://127.0.0.1:8080",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "off",
        ignoreHTTPSErrors: true,
        launchOptions: browserLaunchOptions
    },
    projects: [
        {
            name: "chromium-desktop",
            testMatch: /watch-party-(desktop|media-regressions|voice-v2|chat-composer|public-rooms)\.spec\.js/,
            use: {
                browserName: "chromium",
                viewport: { width: 1365, height: 900 }
            }
        },
        {
            name: "mediabunny-browser",
            testMatch: /watch-party-mediabunny-browser\.spec\.js/,
            use: {
                browserName: "chromium",
                viewport: { width: 960, height: 720 }
            }
        },
        {
            name: "mobile-390",
            testMatch: /watch-party-mobile\.spec\.js/,
            use: {
                ...devices["Desktop Chrome"],
                browserName: "chromium",
                viewport: { width: 390, height: 844 },
                isMobile: true,
                hasTouch: true
            }
        },
        {
            name: "mobile-360",
            testMatch: /watch-party-mobile\.spec\.js/,
            use: {
                ...devices["Desktop Chrome"],
                browserName: "chromium",
                viewport: { width: 360, height: 800 },
                isMobile: true,
                hasTouch: true
            }
        }
    ]
});
