# Watch Party Voice Testing

This checklist is for local and production validation of the optional two-person microphone channel. Video synchronization is independent: a voice failure must not stop room creation, playback sync, subtitles, chat, or reactions.

## What Changed

- The voice peer connection starts when a valid user enters the Lobby or Active Room.
- Microphone permission is still requested only after pressing the microphone button.
- Each room voice generation has one `RTCPeerConnection`, one `audio` transceiver, and one sender.
- Mic on/off only calls `sender.replaceTrack(track)` or `sender.replaceTrack(null)`.
- Firebase Realtime Database stores only signaling metadata: `generationId`, SDP offer/answer, and ICE candidates. It never stores microphone audio.
- TURN credentials must come from `rtc.turnCredentialsEndpoint` as short-lived credentials. Do not put TURN usernames or passwords in frontend config.

## Safe Local Diagnostics

On localhost only, use the browser console:

```js
await window.__watchPartyTest.voiceDiagnostics()
```

The diagnostic intentionally excludes SDP, ICE candidate addresses, private IPs, TURN credentials, full Firebase UIDs, media URLs, subtitle text, and chat content.

Useful fields:

- `iceServersEmpty`
- `signalingState`
- `iceGatheringState`
- `iceConnectionState`
- `connectionState`
- `candidatePath`: `direct`, `STUN`, `TURN`, or `unknown`
- `protocol`
- `localCandidateType`
- `remoteCandidateType`
- `packetsReceived`
- `bytesReceived`
- `jitter`
- `packetsLost`
- `roundTripTime`
- `peerCount`
- `peerCreateCount`
- `senderCount`
- `transceiverCount`
- `localLiveAudioTrackCount`
- `remoteReceivedTrackCount`
- `remoteAudio.srcObjectPresent`
- `remoteAudio.playRejected`

## Force Relay Test Mode

On localhost before entering a room:

```js
window.__WATCH_PARTY_TEST__ = {
  voice: {
    forceRelay: true
  }
};
```

Then create and join a room. A successful force-relay test must show:

```js
(await window.__watchPartyTest.voiceDiagnostics()).candidatePath === "TURN"
```

This requires a working `rtc.turnCredentialsEndpoint`. Without TURN credentials, relay-only mode cannot connect.

## TURN Endpoint Contract

Configure:

```js
rtc: {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ],
  turnCredentialsEndpoint: "https://example.com/watch-party/turn",
  connectionTimeoutMs: 10000,
  maxIceRestarts: 2,
  relayFallback: true
}
```

The frontend calls the endpoint with:

```http
Authorization: Bearer <Firebase ID token>
```

The endpoint must return:

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

Rules:

- HTTPS is required in production.
- Loopback HTTP is allowed only for local testing.
- Credentials must be short lived.
- At least one returned server must use `turn:` or `turns:`.
- Do not log usernames, credentials, SDP, or candidates.

## Manual Matrix

Record these fields for every run:

- ICE state
- Selected path: direct / STUN / TURN
- Remote audio unlocked
- First-toggle success
- Audio received
- Reconnect behavior

| Scenario | Expected result |
| --- | --- |
| Chrome ↔ Chrome, same Wi-Fi | Direct or STUN path, first mic toggle works. |
| Chrome ↔ Safari iPhone, same Wi-Fi | Remote audio may require tap-to-hear; voice should connect. |
| Chrome Wi-Fi ↔ iPhone mobile data | STUN may work; TURN may be required on restrictive networks. |
| Safari iPhone ↔ Safari iPhone | Tap-to-hear must unlock remote audio; background/foreground must recover. |
| Force relay mode | Selected candidate path must be TURN. |
| Background/foreground Safari | Connection may reconnect; video sync must remain usable. |
| Lock/unlock iPhone | Voice may reconnect; user should not need to leave the room. |
| Bluetooth headset | Browser should route mic and speaker through selected device where supported. |
| Permission denied | UI shows microphone denial and room remains usable. |
| Mic off/on once | No duplicate peer, sender, transceiver, offer loop, or stale candidate application. |

## Local Commands

```powershell
cd "E:\Coding\New folder\freemovieir.github.io"
npm.cmd run watch-party:build:test
npm.cmd run watch-party:test
npm.cmd run watch-party:test:rules
npm.cmd run watch-party:test:e2e
```

PowerShell may block the `npm.ps1` shim on some machines; `npm.cmd` avoids that local policy issue.
