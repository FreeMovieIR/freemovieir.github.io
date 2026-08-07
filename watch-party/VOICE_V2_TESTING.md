# Watch Party Voice Engine V2 Testing

Voice Engine V2 replaces the legacy `AudioCall` runtime. It uses `rooms/{roomCode}/voiceV2` for WebRTC signaling only. Firebase never receives microphone audio.

## Local Checklist

1. Start local services:
   ```powershell
   npm run watch-party:emulators
   npm run watch-party:serve
   ```
2. Open two isolated browser contexts at:
   ```text
   http://127.0.0.1:8080/watch-party/
   ```
3. Create a room as owner and join as guest.
4. Confirm the voice status shows one compact status line, not repeated toasts.
5. Turn guest microphone on, then owner microphone on.
6. Turn both microphones off and on again.
7. Confirm playback sync, chat, subtitles, and room UI continue to work if voice fails.

## Expected V2 Behavior

- Owner creates the voice session and exactly one offer.
- Guest answers and never creates an offer.
- Each participant has one `RTCPeerConnection`, one audio transceiver, and one sender per voice session.
- Microphone on/off uses only `sender.replaceTrack(track)` or `sender.replaceTrack(null)`.
- Toggling microphone does not create another offer or answer.
- Remote audio uses the existing stable `<audio id="remote-audio" autoplay playsinline>`.
- If autoplay is blocked, the UI shows `فعال‌کردن صدای همراه`; clicking it calls `remoteAudio.play()` from the user gesture.
- Automatic recovery performs at most one ICE restart. Further recovery requires `اتصال دوباره صدا`.

## Local Diagnostics

On localhost with the test bridge enabled:

```javascript
await window.__watchPartyTest.voiceV2Diagnostics()
```

Diagnostics are sanitized. They must not expose SDP, raw ICE candidates, IP addresses, TURN credentials, or Firebase UIDs.

## Real Device Matrix

These checks require physical devices and must not be marked as passed unless they are actually tested:

- Chrome laptop ↔ Chrome laptop on the same Wi-Fi
- Chrome laptop ↔ Safari iPhone on the same Wi-Fi
- Chrome laptop on Wi-Fi ↔ Safari iPhone on mobile data
- Safari iPhone ↔ Safari iPhone

For each pair, test:

- First microphone click
- Audible remote audio
- Remote audio unlock on iPhone/Safari
- Microphone off/on once
- Browser background/foreground
- iPhone screen lock/unlock
- Manual voice reconnect

## TURN Status

V2 does not require TURN for local tests. Production cross-network reliability may require a managed TURN service. Configure short-lived TURN credentials through `rtc.turnCredentialsEndpoint`; do not commit permanent TURN usernames or passwords.

The default ICE policy is `all`. Local tests may inject force-relay behavior through the localhost-only test bridge, but production does not force relay unless explicitly configured.

## Legacy V1

The old implementation is archived at:

```text
watch-party/dev/legacy/audio-call-v1.js
```

It is excluded from the production Pages artifact and should not be imported by production runtime code.
