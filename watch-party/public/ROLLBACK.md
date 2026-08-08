# Public Cinema Rooms V4 Rollback Plan

Rollback must preserve the private two-person Watch Party and must not require a database migration rollback.

## Fast Frontend Kill Switch

Set runtime config:

```js
publicRooms: {
  enabled: false,
  creationEnabled: false,
  maintenance: false
}
```

Expected result:

- `/watch-party/public/` shows an unavailable state.
- no public-room Firebase listeners start.
- no public-room callable Functions are invoked.
- private `/watch-party/` remains available.

## Maintenance Mode

For a softer pause:

```js
publicRooms: {
  enabled: true,
  creationEnabled: false,
  maintenance: true
}
```

Expected result:

- users see the maintenance message.
- create and join controls are hidden.
- no destructive global room deletion is triggered by the frontend.

## Existing Active Rooms

Do not use a destructive global shutdown unless the owner has decided to end active rooms. The V4 config includes `forceDisableActiveRooms` as an explicit future kill-switch field, but the safe default is `false`.

Server cleanup remains responsible for stale/expired public rooms.

## Functions Rollback Compatibility

Functions should tolerate at least one previous public client version where practical:

- duplicate creates return the existing host room when possible.
- duplicate joins from an existing member are safe.
- duplicate leave/kick/end requests are safe.
- unknown or stale room states return normalized public errors.

Do not remove callable names while an older frontend artifact can still call them.

## Database Cleanup

Rollback does not require deleting data manually. Scheduled cleanup removes:

```text
publicRooms/{roomId}
publicRoomDirectory/{roomId}
publicRoomHostIndex/{uid}
publicRoomMemberNotices/{roomId}
publicRoomEphemeral/{roomId}
expired publicRoomRateLimits
```

Manual cleanup, if ever needed by the owner, should use a verified Admin SDK script and must not copy chat, media URLs, UIDs, bans, or reactions into logs or archives.

## Verification After Rollback

Check:

- private Watch Party still loads.
- `/watch-party/public/` does not start public Firebase work when disabled.
- production config does not include local emulator endpoints.
- no public room creation button is visible.
- no public route asks for microphone permission.
- scheduled cleanup still runs if Functions remain deployed.
