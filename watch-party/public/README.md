# Public Cinema Rooms V3

Public Rooms are separate from the private two-person Watch Party at `/watch-party/`.

The public route is:

```text
/watch-party/public/
```

Production remains feature-flagged off by default:

```js
publicRooms: {
  enabled: false,
  creationEnabled: false,
  maintenance: false,
  forceDisableActiveRooms: false,
  functionTimeoutMs: 10000
}
```

Local generated config enables the flag for emulator testing. Do not enable production until the owner deploys the matching Firebase Functions and reviews the Realtime Database rules.

## Architecture

- Static Persian RTL frontend on GitHub Pages.
- Firebase Anonymous Authentication.
- Firebase Realtime Database for directory, room state, presence, host playback, chat, and reactions.
- Firebase Functions callable commands for lifecycle, membership, chat, reactions, moderation, and social settings.
- No custom WebSocket server.
- No video proxying, downloading, caching, retransmission, or hosting.
- Public voice remains disabled and no-op.

Private Watch Party and Public Rooms use separate data roots and separate client modules.

## Data Roots

```text
publicRooms/{roomId}
publicRoomDirectory/{roomId}
publicRoomHostIndex/{uid}
publicRoomMemberNotices/{roomId}/{uid}
publicRoomRateLimits/{scope}/{uid}
publicRoomEphemeral/{roomId}
```

The directory contains only safe discovery metadata: room name, movie title, host display-name snapshot, member count, capacity, status, language, joinability, chat/reaction enabled flags, playback paused flag, and deletion deadline.

The directory never contains media URLs, subtitle text, chat messages, reaction details, UID values, bans, signaling data, or voice data.

V3 builds directory entries through `buildPublicDirectoryEntry(room)` only. `memberCount` is treated as derived cached state and can be reconciled server-side from `publicRooms/{roomId}/members`.

## Roles

Host:

- creates the room
- controls playback
- locks and unlocks the room
- kicks guests
- deletes chat messages
- changes chat/reaction settings and slow mode
- ends and deletes the room

Guest:

- can discover and join rooms
- can watch after membership is accepted
- can send chat and controlled reactions when enabled
- can update only their own presence
- cannot control shared playback, media, capacity, status, social settings, moderation, or room deletion

Capacity remains 2 to 7, including the host.

## Group Chat

Public chat is room-scoped and temporary:

```text
publicRooms/{roomId}/chat/{messageId}
```

Messages contain only:

```js
{ uid, displayName, text, createdAt }
```

The client sends only `roomId` and `text`. `sendPublicRoomMessage` verifies authentication, current membership, room state, ban state, `chatEnabled`, message length, and slow mode. It resolves `displayName` from `publicRooms/{roomId}/members/{uid}/displayName`, so clients cannot spoof names.

Chat is plain text only. The UI renders message bodies with `textContent`; no HTML, Markdown, image attachments, or link HTML are generated.

At most 300 messages are retained per public room. Old messages are hard-deleted; there is no archive, analytics copy, tombstone history, localStorage chat, or IndexedDB chat.

## Slow Mode

`settings.slowModeMs` is host-controlled and server-enforced.

Allowed values:

```text
0
3000
5000
10000
30000
```

The default is `3000`. The server stores only minimal room-member timing fields such as `lastMessageAt` and rejects rapid sends with `PUBLIC-CHAT-SLOW-MODE`.

V3 adds a separate transient burst limiter under `publicRoomEphemeral/{roomId}/chatBurst/{uid}`. This protects rooms even when host slow mode is set to `0`.

## Moderation

The host can hard-delete any public-room message through `deletePublicRoomMessage`. Normal guests cannot delete other users' messages in V2. Deleted messages are removed from the room node and are not copied elsewhere.

## Reactions

Allowed V2 reactions:

```text
❤️ 😂 😱 😢 🍿 👏 🔥
```

`sendPublicRoomReaction` validates authentication, current membership, room state, ban state, `reactionsEnabled`, allowed emoji, and per-member rate limit. Reactions store:

```js
{ uid, emoji, createdAt }
```

They do not duplicate display names. The UI resolves names from current members and falls back to `کاربر`; the local user is shown as `شما`.

Reactions animate over the video for a few seconds and are removed from the DOM. RTDB retains only a small transient set, capped at 50 and pruned by age.

## Discovery UX

The public discovery page is a “Live Cinema Lobby” with:

- search over safe directory metadata
- filters for all, joinable, playing, and waiting rooms
- language filter
- newest and most-active sorting
- live room cards with member count, language, host, room age, status, chat, and reaction indicators
- dedicated empty and no-result states
- responsive cards from 320px through desktop widths

Search/filter/sort operate on the bounded loaded directory list and do not introduce recommendations or tracking.

## Voice

Public voice remains completely disabled:

- no `getUserMedia`
- no `RTCPeerConnection`
- no Cloudflare or RealtimeKit
- no TURN
- no public voice signaling
- no microphone UI or permission prompt

The no-op voice provider remains only as a disabled scaffold for future work.

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
endPublicRoom
```

All commands require Firebase Auth. Admin SDK writes are used only inside Functions. No service-account JSON belongs in this repository.

V3 production hardening:

- duplicate create by the same host reuses the active host room instead of creating another one
- duplicate join by the same member is idempotent and does not increment count
- duplicate leave, kick, lock, and end requests are safe
- new join requests are rate-limited without blocking legitimate member rejoin
- create requests are rate-limited and limited to one active host room
- callable requests have bounded client-side timeout behavior
- callable errors are normalized before display
- public logs use only privacy-safe operation/category/duration buckets

## Cleanup And Reconciliation

Scheduled cleanup handles expired rooms, stale host deletion, stale guest removal, reaction pruning, expired rate-limit deletion, orphan directory deletion, missing directory rebuild, orphan host-index deletion, and directory `memberCount` repair.

One logical public-room delete removes:

```text
publicRooms/{roomId}
publicRoomDirectory/{roomId}
publicRoomHostIndex/{hostUid}
publicRoomMemberNotices/{roomId}
publicRoomEphemeral/{roomId}
```

Global UID-scoped rate-limit state remains only until its own `expiresAt`.

## Feature Flags And Maintenance

Production launch is intentionally staged:

- `enabled=false`: public route is unavailable and no public Firebase work starts.
- `enabled=true, creationEnabled=false`: discovery can be tested before users can create rooms.
- `maintenance=true`: route shows a maintenance state and hides create/join.

See `PRODUCTION_DEPLOYMENT.md` and `ROLLBACK.md`.

## Rules

Realtime Database rules require authenticated reads and restrict sensitive room data to current members. Public chat and reactions are client-readable only through room membership and direct client writes are denied; Functions own those mutations.

Guests cannot alter social settings. Host-only settings are validated with the allowed slow-mode set.

## Local Tests

Run:

```powershell
npm run watch-party:test
npm run functions:test
npm run watch-party:test:rules
npm run watch-party:test:e2e -- --project=chromium-desktop tests/watch-party/e2e/watch-party-public-rooms.spec.js
npm run watch-party:test:public-load
```

Public V2/V3 screenshots and indexes are generated under:

```text
artifacts/watch-party/public-v2/
artifacts/watch-party/public-v3/
```
