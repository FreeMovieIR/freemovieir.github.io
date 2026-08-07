# Watch Party Local Emulator Testing

All commands run locally from the repository root. Do not deploy to Firebase for these tests.

```powershell
cd "E:\Coding\New folder\freemovieir.github.io"
```

## One-Time Setup

```powershell
.\scripts\watch-party-local-setup.ps1 -Install
```

If PowerShell policy blocks scripts, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\watch-party-local-setup.ps1 -Install
```

Playwright is installed as a local dev dependency. On machines with enough disk space, this command installs the bundled Chromium browser:

```powershell
npx playwright install chromium
```

The local E2E configuration can also use installed Chrome or Edge on Windows.

## Manual Services

Generate the local emulator runtime config:

```powershell
npm run watch-party:build:test
```

Recommended combined local launcher:

```powershell
npm run watch-party:dev
```

Manual two-terminal mode:

Terminal 1:

```powershell
npm run watch-party:emulators
```

Terminal 2:

```powershell
npm run watch-party:serve
```

Browser URL:

```text
http://127.0.0.1:8080/watch-party/
```

Emulator UI:

```text
http://127.0.0.1:4000
```

The local endpoints are:

```text
Auth emulator: http://127.0.0.1:9099
Realtime Database emulator: http://127.0.0.1:9000
Static frontend: http://127.0.0.1:8080
```

## Anonymous Auth Diagnostics

If anonymous sign-in fails, the app now shows a safe Persian message and one temporary diagnostic code instead of the raw Firebase error:

```text
AUTH-NETWORK
AUTH-TIMEOUT
AUTH-DISABLED
AUTH-CONFIG
AUTH-RATE
AUTH-UNKNOWN
```

The Retry button only retries authentication and keeps the current role, room code, display name, and form values. The optional endpoint probe checks only public Firebase endpoints (`www.gstatic.com` and `identitytoolkit.googleapis.com`) without using the Firebase API key. A failed probe means the endpoint was unreachable from that browser; it does not prove the cause of the network restriction.

## Automated Checks

Unit tests:

```powershell
npm run watch-party:test
```

Firebase Rules tests:

```powershell
npm run watch-party:test:rules
```

Multi-user Playwright E2E tests:

```powershell
npm run watch-party:test:e2e
```

Production artifact build and scan:

```powershell
npm run pages:build
npm run pages:test
npm run pages:smoke
npm run media-gateway:test
```

`pages:build` requires the five production Firebase environment variables. For local dry-runs, use harmless fake values; do not use real credentials unless you are running the GitHub Actions workflow or an owner-controlled production build.
`pages:smoke` starts a temporary server for `dist/`, opens representative pages in Chromium, verifies `/watch-party/runtime-config.js` is requested from the artifact, and confirms source-only paths are not served.

Serve only the generated Pages artifact:

```powershell
npm run pages:preview
```

Difference:

- `watch-party:dev` serves the repository source with Emulator config and development-only diagnostics.
- `pages:preview` serves only `dist/`, the same shape uploaded to GitHub Pages.
- `media-gateway:test` validates the optional server-assisted compatibility gateway without deploying it.

Physical iPhone Safari fullscreen, direct MKV behavior, audible microphone, Bluetooth switching, and restrictive NAT/TURN behavior remain manual tests. Use `watch-party/IOS_TESTING.md`.

Headed and UI modes:

```powershell
npm run watch-party:test:e2e:headed
npm run watch-party:test:e2e:ui
```

The E2E runner starts the Firebase Auth emulator, Realtime Database emulator, and static server, waits for local readiness, runs Playwright, and stops the child processes afterward. It uses isolated browser contexts for owner, guest, and third participant so cookies, storage, IndexedDB, permissions, and Firebase anonymous identities do not overlap.

Screenshots are written locally under:

```text
artifacts/watch-party/
```

Open the generated screenshot index:

```text
artifacts/watch-party/index.md
```

Generated Playwright output is local-only:

```text
playwright-report/
test-results/
artifacts/watch-party/
```

## Service-Unavailable Testing

The app checks local Firebase emulator availability before anonymous auth, create room, and join room. If the Auth or Database emulator is unavailable, it shows a Persian recovery screen with retry/back controls instead of locking the UI.

Manual test:

1. Start only the static server with `npm run watch-party:serve`.
2. Open `http://127.0.0.1:8080/watch-party/`.
3. Select `ساخت اتاق` or `ورود با کد`.
4. Confirm the service-unavailable screen appears and shows how to start the emulators.
5. Start `npm run watch-party:emulators`.
6. Click retry and confirm the selected setup flow continues.

The Playwright regression suite also forces this state with a localhost-only test hook. That hook is ignored on production hosts.

## Local Media URLs

Subtitle URLs:

```text
http://127.0.0.1:8080/test-assets/sample.srt
http://127.0.0.1:8080/test-assets/sample.vtt
```

Main MP4 fixture:

```text
http://127.0.0.1:8080/test-assets/sample.mp4
```

Additional synthetic fixtures may exist under:

```text
test-assets/media/h264-aac.mp4
test-assets/media/vp9-opus.webm
test-assets/media/h264-aac.mkv
test-assets/media/vp9-opus.mkv
test-assets/media/mkv-h264-aac.mkv
test-assets/media/mkv-vp9-opus.mkv
test-assets/media/mkv-h264-ac3.mkv
test-assets/media/mkv-h264-eac3.mkv
test-assets/media/mkv-multi-audio.mkv
test-assets/media/mkv-dts-unsupported.mkv
```

The local setup prefers a system `ffmpeg`. If it is unavailable, the repository uses the local dev dependency `ffmpeg-static` for fixture generation where practical. Do not commit generated test media.

## Native Playback And CORS

Watch Party and `/player/` both use a native-first `<video>` path for normal MP4/WebM/OGG URLs. This means ordinary browser-playable media should not be rejected just because JavaScript cannot fetch the file with CORS.

CORS is still required for:

- Subtitle URL fetches.
- HLS.js playlist and segment requests.
- Any JavaScript byte-level container probing.

If native playback fails, the app reports the browser's real media error category: network, decode, unsupported source, expired/inaccessible URL, or timeout.

## MKV Compatibility Checks

MKV is not guaranteed browser media. The app no longer rejects `.mkv` by extension alone, but it only treats an MKV as usable if the browser can load the visible track and, where possible, the Mediabunny audio companion can inspect and prepare the embedded audio track.

Expected outcomes:

- H.264/AAC, VP9/Opus, AC-3, and E-AC-3 synthetic fixtures should expose track metadata.
- The `mkv-multi-audio.mkv` fixture should expose more than one selectable audio track.
- The `mkv-dts-unsupported.mkv` fixture should show the unsupported-DTS Persian message instead of silently playing without sound.
- HEVC, DTS-HD, TrueHD, ASS/SSA subtitle tracks, uncommon Matroska features, browsers without WebCodecs, missing CORS, or missing HTTP Range support should show compatibility errors.
- Full audible-output verification remains manual because headless browsers cannot prove that a human hears local speaker output.

Manual MKV audio checklist:

1. Start `npm run watch-party:dev`.
2. Create a room with `http://127.0.0.1:8080/test-assets/media/mkv-h264-aac.mkv`.
3. Press ready and start playback with a user gesture.
4. Confirm `صدا آماده است` appears.
5. Pause, seek, and change playback rate.
6. Repeat with Opus, AC-3, E-AC-3, multi-audio, and DTS-unsupported fixtures.

## Role-Based Flow

The local UI should move through these stages:

```text
انتخاب نقش
تنظیمات سازنده یا مهمان
لابی
شروع مشترک
اتاق فعال
```

The welcome screen must show only the two role cards: `ساخت اتاق` and `ورود با کد`. The player, chat, room code, participant list, microphone controls, and subtitle settings must remain hidden until the relevant stage.

## Two-Browser Manual Testing

Use separate browser profiles so Firebase Anonymous Auth creates separate users:

- Owner: Chrome normal window.
- Guest: Edge normal window or Chrome Incognito.
- Third participant: another private/incognito window or a different browser profile.

Use headphones for WebRTC microphone tests to avoid feedback.

## Manual Stuck-Restore Test

1. Start the emulators and static server.
2. Create a room and refresh once to confirm normal restoration.
3. Stop the Database Emulator from Terminal 1.
4. Refresh the Watch Party page.
5. Confirm the restoring screen does not show only a spinner.
6. Click `انصراف و بازگشت به صفحه اصلی`.
7. Confirm the URL no longer contains stale Watch Party query parameters.
8. Refresh again and confirm the Welcome screen appears.
9. Start the host flow and guest flow to confirm the stale room session was cleared.

For deterministic automation on localhost, tests may set:

```javascript
window.__WATCH_PARTY_TEST__ = {
  delayRestoreMs: 5000,
  restoreTimeoutMs: 900,
  forceServiceStatus: "auth-unavailable"
};
```

This hook is ignored outside local hosts and must not be used for production behavior.

## Manual Checklist

- Initial screen shows only `ساخت اتاق` and `ورود با کد`.
- Host flow: select `ساخت اتاق`, enter display name, continue to movie setup, enter video URL, create room, and reach the Lobby.
- Guest flow: select `ورود با کد`, enter the room code, then enter display name and join.
- Invitation flow: open `/watch-party/?room=ROOMCODE`; the guest code step opens with the code prefilled, but the user must still confirm joining.
- Third participant is rejected as full.
- Both participants press `آماده‌ام` and see the countdown.
- Guest leaves and releases the slot.
- New guest claims the released slot.
- Owner ends the room.
- Chat sends and receives plain-text messages.
- Emoji reactions animate over the player.
- SRT upload works.
- VTT upload works.
- Subtitle URL works.
- XSS payloads display as text and do not execute:

```html
<img src=x onerror=alert("xss")>
<script>alert("xss")</script>
```

- Buffer state appears when a browser stalls.
- Auto-pause caused by buffering does not resume a manually paused film.
- Connection-loss UI appears when the database emulator is temporarily stopped.
- State resynchronizes after the emulator is restarted.
- Microphone is off by default.
- Microphone permission is requested only after clicking the microphone button.
- Permission accepted attaches the local audio track with `sender.replaceTrack(track)` and must not start a new negotiation.
- Permission denied shows the Persian denial message.
- Mute and unmute toggle local audio tracks.
- Remote audio element receives a stream when WebRTC connects.
- Leaving or ending the room stops local microphone tracks.
- Refresh recreates Voice V2 session-scoped signaling without repeated offers.
- Firebase Emulator UI contains only room state, chat, subtitles, and SDP/ICE signaling. It must not contain media bytes or microphone audio.

### Voice Diagnostics

On localhost, safe voice diagnostics are available from the console:

```js
await window.__watchPartyTest.voiceDiagnostics()
await window.__watchPartyTest.voiceV2Diagnostics()
```

This reports ICE state, selected path, sender/transceiver counts, remote audio playback status, and packet counters without logging SDP, ICE addresses, TURN credentials, full UIDs, media URLs, subtitle text, or chat text.

To test relay-only behavior, set this before entering the room:

```js
window.__WATCH_PARTY_TEST__ = {
  voice: {
    forceRelay: true
  }
};
```

Force-relay success requires a working local or production-safe `rtc.turnCredentialsEndpoint`; otherwise the expected result is a voice failure message while movie synchronization remains usable. The full Voice V2 manual matrix is in `watch-party/VOICE_V2_TESTING.md`.

## Mobile Checks

The Playwright suite verifies 390x844 and 360x800 contexts. For manual review, confirm:

- No horizontal overflow.
- Role cards are readable.
- Host and guest setup forms are usable.
- The active player appears before side panels.
- Chat remains usable.
- Leave/end dialogs fit inside the viewport.
