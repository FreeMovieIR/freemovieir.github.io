# Watch Party

Two-person synchronized playback for FreeMovieIR. The feature stays compatible with GitHub Pages: it is a static RTL Persian frontend that uses Firebase Anonymous Auth, Firebase Realtime Database, native HTML5 video, HLS.js, and WebRTC microphone audio.

## Configuration

Production does not use `firebase-config.js`. GitHub Actions generates `watch-party/runtime-config.js` inside the Pages artifact from Repository Variables.

Required production variables:

```text
WATCH_PARTY_FIREBASE_API_KEY
WATCH_PARTY_FIREBASE_AUTH_DOMAIN
WATCH_PARTY_FIREBASE_DATABASE_URL
WATCH_PARTY_FIREBASE_PROJECT_ID
WATCH_PARTY_FIREBASE_APP_ID
```

Optional variables may be empty:

```text
WATCH_PARTY_APP_CHECK_SITE_KEY
WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT
WATCH_PARTY_RTC_ICE_SERVERS
```

Local emulator testing uses an ignored generated `watch-party/runtime-config.js`; see `LOCAL_TESTING.md`.

## Local Run

For Firebase Emulator Suite testing, use `watch-party/LOCAL_TESTING.md`.

Common local checks:

```powershell
npm run watch-party:test
npm run watch-party:test:rules
npm run watch-party:test:e2e
npm run pages:build
npm run pages:test
npm run pages:smoke
npm run media-gateway:test
```

To start the emulators and static server together for manual work:

```powershell
npm run watch-party:dev
```

Or run them manually:

```powershell
npm run watch-party:emulators
npm run watch-party:serve
```

Open:

```text
http://127.0.0.1:8080/watch-party/
```

The E2E suite starts the local emulators and static server automatically, then uses isolated Playwright browser contexts for owner, guest, and a third participant. Screenshots and the generated visual index are written under:

```text
artifacts/watch-party/
```

For microphone and WebRTC, use `localhost`, `127.0.0.1`, or HTTPS because browsers require a secure context for media devices.

## User Flow

The Watch Party UI is role-based and state-driven:

1. `انتخاب نقش`: the user chooses either `ساخت اتاق` or `ورود با کد`.
2. `تنظیمات سازنده`: host enters display name, then video/subtitle settings.
3. `تنظیمات مهمان`: guest enters room code, then display name.
4. `لابی`: room code, invitation actions, participant status, optional microphone setup, and readiness.
5. `شروع مشترک`: both users press `آماده‌ام`, then a 3-2-1 countdown runs.
6. `اتاق فعال`: cinema player plus tabbed room/chat/subtitle/settings side panel.

The video player, chat, microphone controls, subtitle controls, and room details are not shown on the welcome screen or unrelated setup steps.

## Emulator Availability

When the page is local (`localhost` or `127.0.0.1`) or `useEmulators: true` is configured, the app checks the Firebase Auth emulator and Realtime Database emulator before authentication or room operations.

If either service is unavailable, the user sees a recoverable Persian screen instead of a stuck create/join flow. The screen includes retry and back actions plus the local commands needed to start the services. Production GitHub Pages never enables emulator mode automatically.

Create and join operations are guarded by bounded timeouts:

- `serviceCheckTimeoutMs`
- `createRoomTimeoutMs`
- `joinRoomTimeoutMs`
- `replaceMediaTimeoutMs`
- `nativeMetadataTimeoutMs`

These values are documented in `firebase-config.example.js` and can be adjusted for local debugging.

## Room Restoration

After a successful create or join, the browser stores a small namespaced room session at `freemovie.watchParty.roomSession`. It contains only the room code, role, Firebase anonymous UID, last known stage, schema version, and timestamp.

On refresh, the app attempts restoration once. Restoration is bounded by `restoreTimeoutMs` and defaults to 10 seconds. If it takes too long, the user sees a recoverable screen with `تلاش مجدد` and `بازگشت به صفحه اصلی`.

The cancel action:

- Invalidates the active restore attempt so late Firebase responses are ignored.
- Detaches room, presence, chat, reaction, sync, and signaling listeners that were created.
- Stops Watch Party media/audio resources owned by the session.
- Clears only Watch Party room-session keys, including legacy `watchPartySession`.
- Preserves unrelated local settings and the remembered display name.
- Removes stale Watch Party query parameters with `history.replaceState`.

Malformed, expired, wrong-version, or wrong-UID stored sessions are cleared instead of retried forever. Ended, expired, removed, or replaced-room membership states are terminal and do not auto-retry.

## Error UX

Authentication and SDK failures are mapped through `watch-party/js/user-errors.js` before they reach the UI. The main message is natural Persian text, while technical codes such as `AUTH-NETWORK`, `AUTH-TIMEOUT`, `AUTH-DISABLED`, `AUTH-CONFIG`, `AUTH-RATE`, `AUTH-UNKNOWN`, `FIREBASE-SDK-NETWORK`, `FIREBASE-SDK-LOAD`, and `FIREBASE-CONFIG-LOAD` appear only inside the collapsible `جزئیات عیب‌یابی` section.

The safe copy report includes only the diagnostic code, build ID, browser family, online/offline state, and public endpoint reachability. It never includes Firebase API keys, tokens, UID, room code, media URLs, chat text, SDP, ICE candidates, or stack traces. Network and timeout messages include optional VPN guidance for users who may be affected by network restrictions, but a country/network restriction cannot be proven from a generic Firebase error alone.

## Privacy And Retention

Watch Party room data is designed to be ephemeral. The host `پایان اتاق` action hard-deletes the full `rooms/{roomCode}` node, including room metadata, participants, media URL, subtitles, playback state, chat, reactions, read receipts, Voice V2 signaling, legacy signaling, and presence data. Guests who are already inside the room and receive a null room snapshot see the room-ended state instead of a misleading “room not found” message.

New rooms include `deleteAt`, capped at no more than 12 hours after creation. The included Cloud Functions source in `functions/` implements `cleanupExpiredWatchPartyRooms`, a scheduled cleanup that queries by `deleteAt` and removes whole room nodes without archiving or logging private content. It is implemented and tested locally, but it is not deployed by this repository task.

Owner deployment outline:

```powershell
cd functions
npm install
firebase deploy --only functions:cleanupExpiredWatchPartyRooms
```

Deploy only from an owner-controlled Firebase project after reviewing the function and Realtime Database rules.

## Chat And Reactions

Chat remains room-scoped and is not written to localStorage, IndexedDB, Cache Storage, analytics, or any archive path. The UI groups nearby messages from the same sender, separates local and partner bubbles, preserves text with `textContent`, and shows subtle `ارسال شد` / `دیده شد` receipts only for the sender’s own messages.

Read receipts use a single participant watermark at `participants/{uid}/chatReadAt`; the app updates it only when the Chat tab is visible, the browser tab is visible, messages are rendered, and the message list is at the latest message. Writes are debounced. Reactions still store only `uid`, `emoji`, and `createdAt`; the overlay resolves the sender name from `participants/{uid}.displayName` and shows `شما` for the local user.

## Active Room Settings

The active room Settings tab now separates movie, subtitle, display/audio, shared settings, and privacy notes. Only the room owner sees `تغییر لینک فیلم`. The change uses the existing `RoomService.updateMedia(url)` path, keeps the same room, preserves chat and Voice V2, resets playback to the beginning, and clears readiness/buffering for participants. Firebase Rules enforce owner-only primary media URL changes while keeping shared playback controls available to both participants.

## Supported Media

- MP4, WebM, and OGG through the browser's native HTML5 video pipeline.
- HLS `.m3u8` through native HLS where available, otherwise HLS.js `1.5.13`.
- HTTPS direct URLs only in production.
- Local HTTP media is accepted only for `localhost` and `127.0.0.1`.

The Watch Party player now follows the same native-first behavior as `/player/`: it does not require CORS for ordinary browser-playable MP4/WebM/OGG files. The browser loads the URL directly into `<video>` and reports the real media error if loading fails.

CORS is still required when JavaScript must fetch bytes or text, including subtitle URLs, HLS.js playlist/segment fetching, and future advanced container probing. Native HLS in Safari may not need the same CORS path because the browser owns the request.

The app does not proxy, cache, download, host, or retransmit videos. Both browsers independently load the same direct URL.

## MKV And Other Containers

MKV support is best-effort and truthful:

- `.mkv` is no longer rejected just because the extension is MKV.
- The video element still attempts the browser's native Matroska path first.
- For MKV audio, the player has a separate Mediabunny `1.52.3` companion path and registers `@mediabunny/ac3` `1.52.3`.
- The companion inspects embedded audio tracks, reports codec/language/channel metadata, and can schedule supported decoded audio through Web Audio when the browser, codec, CORS, and Range requests allow it.
- Unsupported codecs such as DTS, DTS-HD, TrueHD, and many HEVC/Matroska variants show a Persian compatibility message instead of silently continuing without sound.
- The selected embedded audio track is stored as room state so both participants use the same track identifier.

This does not bypass DRM, CORS, browser WebCodecs limits, or server Range limitations. If JavaScript cannot fetch/demux the file, the user must choose another source or continue without MKV audio only knowingly.

Synthetic local MKV fixtures are generated under `test-assets/media/` for AAC, Opus, AC-3, E-AC-3, multi-audio, and DTS-unsupported cases. These files are local-only and excluded from git.

## Subtitles

- `.vtt` and `.srt` are supported.
- Local files are limited by `subtitleSizeLimit`, normalized to WebVTT, stored in the room, and loaded as local Blob URLs.
- Subtitle URLs are fetched by the browser. If CORS blocks access, the user should download the file and upload it manually.
- Caption appearance settings are local-only and saved in `localStorage`.

## Voice

Microphone audio is optional and off by default. The browser requests audio permission only after the user presses the microphone button. Audio is sent peer-to-peer with WebRTC and is never recorded or stored in Firebase. Firebase only carries Voice V2 `voiceV2` session-scoped SDP and ICE signaling.

The active room includes local microphone on/off, mute, partner voice volume, and partner voice mute controls. Movie volume and partner voice volume are separate local channels.

Voice Engine V2 uses a deterministic two-person flow: the owner creates one offer and the guest creates one answer. Each active voice session has one `RTCPeerConnection`, one `audio` transceiver, and one sender. Mic on/off only uses `sender.replaceTrack(track)` or `sender.replaceTrack(null)`, so microphone changes do not renegotiate the call.

Pinned STUN servers are included by default. Reliable production connectivity across restrictive NATs may require TURN. Configure `rtc.turnCredentialsEndpoint` to return short-lived TURN credentials generated securely outside this static site. Permanent TURN usernames/passwords must not be committed to frontend configuration. See `watch-party/VOICE_V2_TESTING.md` for safe diagnostics, force-relay testing, and the two-device manual matrix.

The previous `AudioCall` implementation is archived in `watch-party/dev/legacy/audio-call-v1.js` for rollback comparison only and is excluded from the production Pages artifact.

## iPhone and Compatibility

Fullscreen uses capability detection rather than only browser names:

1. Standard element fullscreen where supported.
2. iPhone Safari native `video.webkitEnterFullscreen()` after video metadata is loaded.
3. Local `حالت سینمایی` CSS fallback when true fullscreen is unavailable.

Direct Mode remains the default for MP4, WebM, HLS, and best-effort MKV. iPhone Safari does not provide universal MKV container/codec support, so incompatible MKV sources show a clear compatibility message. The optional Media Compatibility Gateway in `services/media-gateway/` can later remux/transcode public media URLs to Apple-compatible HLS. It is separately deployable and excluded from GitHub Pages.

Real iPhone validation steps are documented in `watch-party/IOS_TESTING.md`.

## Production Build Path

Production config is generated at deploy time into the Pages output directory:

```powershell
node scripts/generate-watch-party-config.mjs --mode=production --output=dist/watch-party/runtime-config.js
```

The generator reads `WATCH_PARTY_*` environment variables, refuses private-key/service-account-looking values, and does not print full config values. See `watch-party/PRODUCTION_SETUP.md` for the GitHub Pages and Firebase owner checklist.

The Pages workflow uploads only `dist/`, not the repository root. Development files such as tests, scripts, Firebase rules, local fixtures, Playwright reports, and config templates remain in source control but are excluded from the visitor-facing artifact.

## Manual Test Checklist

- Create a room, copy invitation link, and join from another browser.
- Join through `/watch-party/?room=ROOMCODE`.
- Confirm a third browser is rejected.
- Play, pause, seek, restart, and change speed from both sides.
- Join late while playback is running.
- Refresh owner and guest and verify reconnection.
- Cancel a delayed restore and verify the Welcome screen remains after waiting longer than the restore timeout.
- Confirm stale or removed guest sessions show a recovery message and can return to Welcome.
- Guest leaves and a different guest can claim the slot.
- Owner ends the room.
- Test MP4, HLS, invalid URL, HTTP URL, SRT file, VTT file, subtitle URL, and CORS-blocked subtitle URL.
- Test an MKV file only as a compatibility check; do not assume all MKV files are supported.
- Accept and deny microphone permissions.
- Mute/unmute and verify peer audio state.
- Simulate buffering and confirm auto-pause behavior when enabled.
- Check mobile viewport for no horizontal overflow.
- Send display name/chat XSS strings and verify they render as text.
- Check console for duplicate listeners, repeated offers, uncaught promise rejections, stale HLS instances, and orphaned media tracks.
