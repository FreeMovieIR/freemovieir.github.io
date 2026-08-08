# Public Cinema Rooms V4 Production Deployment Contract

Public Cinema Rooms are still disabled for production by default. This document is a rollout contract for the repository owner; it is not a deployment log.

Do not enable `publicRooms.enabled` or `publicRooms.creationEnabled` until the matching Functions, Realtime Database rules, and frontend artifact are all verified in an owner-controlled Firebase project.

## Required Order

1. Deploy Firebase Functions that include the Public Rooms callable commands and scheduled cleanup.
2. Publish the matching Realtime Database rules from `firebase/database.rules.json`.
3. Verify callable Functions in a staging or owner-controlled environment.
4. Build and publish the GitHub Pages frontend with `publicRooms.enabled = false` and `publicRooms.creationEnabled = false`.
5. Smoke test `/watch-party/public/` and confirm it shows an unavailable state without Firebase listeners or callable requests.
6. Enable discovery only with `publicRooms.enabled = true` and `publicRooms.creationEnabled = false`.
7. After discovery and maintenance controls are verified, enable creation with `publicRooms.creationEnabled = true`.

This order prevents old clients from writing directly to server-owned public-room roots and prevents the UI from creating rooms before callable lifecycle enforcement is live.

## Runtime Flags

```js
publicRooms: {
  enabled: false,
  creationEnabled: false,
  maintenance: false,
  forceDisableActiveRooms: false,
  functionTimeoutMs: 10000
}
```

Flag meanings:

- `enabled: false`: public route shows a disabled/unavailable state and does not start public Firebase listeners or callable requests.
- `enabled: true, creationEnabled: false`: discovery can be shown, but new public rooms cannot be created.
- `maintenance: true`: public route shows a maintenance state. Create and join are hidden.
- `forceDisableActiveRooms: true`: reserved for a future hard shutdown path. Do not set casually.
- `functionTimeoutMs`: client-side callable timeout. Timeout is recoverable and does not prove the server operation failed.

## Functions

Callable commands:

```text
createPublicRoom
joinPublicRoom
leavePublicRoom
kickPublicRoomMember
setPublicRoomLock
sendPublicRoomMessage
deletePublicRoomMessage
sendPublicRoomReaction
updatePublicRoomSocialSettings
updatePublicRoomMedia
endPublicRoom
```

Scheduled cleanup:

```text
cleanupExpiredWatchPartyRooms
```

The scheduler also runs public-room cleanup. The implementation uses Firebase Admin default credentials at runtime. Do not add service-account JSON files, private keys, permanent TURN credentials, or production secrets to this repository.

Owner verification before rollout:

- Confirm Node runtime supported by the Firebase project.
- Confirm region `us-central1` is acceptable for the audience.
- Confirm memory, timeout, scheduler, and required Firebase APIs in the owner project.
- Confirm the project billing/API requirements in Firebase documentation for the selected Functions generation and schedule frequency.

## Server Invariants

Public Rooms V4 enforces:

- one active public room per host UID
- idempotent duplicate create for the same active host room
- idempotent rejoin for the same member UID
- idempotent leave, kick, lock, and end flows
- server-side capacity enforcement for 2 to 7 members
- create rate limit of 3 attempts per UID per hour
- join rate limit of 10 new join attempts per UID per minute
- chat burst limit independent from slow mode
- reaction rate limiting
- server-owned public directory entries
- derived member count reconciliation
- hard delete cascade for room, directory, host index, member notices, and room-scoped ephemeral metadata

Guests are never promoted to host and ownership is never transferred.

## Cleanup

Cleanup is server-authoritative and retry-safe. It handles:

- public room hard delete at or before the 12-hour retention target
- stale host cleanup after the configured grace period
- stale guest removal after the configured grace period
- reaction pruning
- expired rate-limit record deletion
- orphan directory deletion
- missing directory rebuild for valid active rooms
- orphan host-index deletion
- corrupted directory `memberCount` repair

Cleanup must not archive rooms, chat, media URLs, bans, or reactions.

## Directory Privacy

`buildPublicDirectoryEntry(room)` is the only helper used to construct discovery metadata.

The public directory must never include:

```text
media.url
members
UIDs
bans
chat
reactions
playback internals
private timestamps
voice data
```

## Logging

Use only privacy-safe operational logs:

```js
{
  operation,
  success,
  category,
  durationBucket,
  memberCountBucket,
  functionVersion
}
```

Do not log room names, movie titles, display names, UIDs, media URLs, chat text, bans, reaction sender IDs, SDP, IPs, TURN credentials, API keys, tokens, stack traces, or raw database paths.

## Listener And Load Audit

Discovery:

- one bounded directory listener/query, capped by the client route.
- client-side search/filter/sort on the bounded directory snapshot.

Active public room:

- room membership and settings are read from room-scoped listeners.
- chat and reactions use bounded queries.
- no one-listener-per-member design.
- no high-frequency playback time mirroring into directory.

High-write risks:

- presence and last-seen writes
- host playback sync
- chat and reactions
- directory status/member count updates

Mitigations:

- heartbeat intervals are bounded.
- chat has slow mode and burst protection.
- reactions have rate limiting and retention pruning.
- directory writes happen on discrete state changes, not every frame.

## Voice

Public voice is disabled for this launch.

The public route must not call:

```text
getUserMedia
RTCPeerConnection
RTCIceCandidate
RTCSessionDescription
```

It must not add Cloudflare, RealtimeKit, TURN, SFU, microphone controls, microphone permission prompts, or public voice signaling.

## Local Verification

Run locally before any owner-controlled rollout:

```powershell
npm run watch-party:test
npm run watch-party:test:rules
npm run watch-party:test:e2e
npm run functions:test
npm run watch-party:test:public-load
npm run pages:build
npm run pages:test
npm run pages:smoke
```

Run static scans for open rules, unsafe HTML, voice APIs in the public route, directory leaks, and Taste Skill leakage before producing a production artifact.
