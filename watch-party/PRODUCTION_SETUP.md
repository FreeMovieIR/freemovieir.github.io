# Watch Party Production Setup

This page documents the production architecture. Do not place real private credentials in this repository.

## Architecture

- GitHub Pages serves static HTML, CSS, JavaScript, and assets.
- Firebase Authentication provides anonymous identities.
- Firebase Realtime Database stores rooms, presence, playback state, chat, reactions, subtitle metadata/content, participant status, capability summaries, and WebRTC signaling.
- WebRTC carries microphone audio directly between browsers when possible.
- Optional TURN relays voice traffic on restrictive networks.
- Movie files are never uploaded, proxied, cached, or retransmitted by FreeMovieIR.

## Firebase Owner Steps

1. Create a Firebase project.
2. Register a Web App.
3. Create a Realtime Database.
4. Choose the database region.
5. Enable Anonymous Authentication.
6. Add `freemovieir.github.io` to Authentication Authorized Domains.
7. Deploy `firebase/database.rules.json` with Firebase CLI from an owner machine.
8. Add these GitHub repository variables:
   - `WATCH_PARTY_FIREBASE_API_KEY`
   - `WATCH_PARTY_FIREBASE_AUTH_DOMAIN`
   - `WATCH_PARTY_FIREBASE_DATABASE_URL`
   - `WATCH_PARTY_FIREBASE_PROJECT_ID`
   - `WATCH_PARTY_FIREBASE_APP_ID`
9. Optional repository variables may be omitted for the first deployment:
   - `WATCH_PARTY_APP_CHECK_SITE_KEY`
   - `WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT`
   - `WATCH_PARTY_RTC_ICE_SERVERS`
   - `WATCH_PARTY_MEDIA_GATEWAY_URL`
10. Register Firebase App Check with reCAPTCHA Enterprise when ready.
11. Add `WATCH_PARTY_APP_CHECK_SITE_KEY` only after registration.
12. Start App Check in monitoring mode.
13. Enable App Check enforcement only after metrics show legitimate traffic is healthy.
14. Configure optional TURN with `WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT`.
15. Configure optional Media Gateway with `WATCH_PARTY_MEDIA_GATEWAY_URL` only after deploying and securing `services/media-gateway/`.
16. Run production smoke tests.
17. Roll back by disabling the workflow deployment or restoring the previous Pages artifact.

## Runtime Config Generation

Production config is generated into the Pages artifact by:

```powershell
node scripts/generate-watch-party-config.mjs --mode=production --output=dist/watch-party/runtime-config.js
```

The source repository should not contain production `runtime-config.js`. The generated file exists in:

```text
dist/watch-party/runtime-config.js
```

`runtime-config.js` is generated and should not contain service-account keys, permanent TURN secrets, or private backend credentials.

Production loads only `watch-party/runtime-config.js` from the artifact. It does not request `watch-party/firebase-config.js`, does not fall back to local config files, and does not contain emulator addresses.

## App Check

Production supports reCAPTCHA Enterprise App Check. Use monitoring first, then enforce after observing legitimate traffic. Local development may use App Check debug mode only with explicit local configuration. Never commit debug tokens.

## TURN Endpoint Contract

The optional TURN endpoint must be HTTPS and return short-lived credentials:

```json
{
  "iceServers": [
    {
      "urls": ["turn:turn.example.com:3478"],
      "username": "temporary-user",
      "credential": "temporary-password"
    }
  ],
  "expiresAt": 1790000000000
}
```

The frontend caches credentials only until expiry. Do not place permanent TURN usernames/passwords in frontend code.

## Room Cleanup

Minimum beta mode:

- Rooms include `expiresAt`.
- Expired rooms cannot be joined.
- Owner ending marks the room ended.
- Guest leave releases `guestUid`.
- Chat, reactions, subtitles, and signaling are bounded by rules and client cleanup.

Optional automated cleanup:

- Use a separate scheduled workflow or function with Firebase Admin credentials stored only in GitHub Secrets.
- Delete rooms where `expiresAt < Date.now()` or old ended rooms exceed the retention period.
- Do not expose Admin credentials in the frontend artifact.

## Production Smoke Tests

Before first deployment:

1. Generate runtime config with production variables.
2. Run `npm run watch-party:test`.
3. Run `npm run pages:build`.
4. Run `npm run pages:test`.
5. Run `npm run pages:smoke`.
6. Verify no localhost URLs appear in the artifact.
7. Verify `/watch-party/` loads under GitHub Pages paths.
8. Verify Firebase Auth anonymous sign-in.
9. Create and join a two-person room.
10. Test MP4, WebM, HLS, subtitles, chat, restoration, and room ending.
11. Test microphone on HTTPS.
12. Test voice on two different networks and add TURN if direct WebRTC fails.
13. Run `watch-party/IOS_TESTING.md` on a physical iPhone before claiming iPhone Safari support.

## Limitations

- Voice may fail without TURN on restrictive NATs.
- Direct MKV playback depends on browser support, WebCodecs availability, CORS, HTTP Range behavior, container support, codec support, and device memory. Reliable iPhone MKV support requires the optional Media Gateway fallback.
- DTS, DTS-HD, TrueHD, HEVC, and uncommon Matroska features are not guaranteed.
- Subtitle URLs require CORS because the browser fetches subtitle text.
