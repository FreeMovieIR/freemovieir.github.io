# Firebase setup for Watch Party

The public site stays on GitHub Pages. Firebase is used only for anonymous auth, Realtime Database room state, chat, subtitles, presence, and WebRTC signaling. It must not receive video bytes or microphone audio.

## Create and configure Firebase

1. Create a Firebase project in the Firebase console.
2. Add a Web app and copy the Web SDK configuration.
3. Enable Authentication > Sign-in method > Anonymous.
4. Create a Realtime Database. Use a region close to most users.
5. Deploy `firebase/database.rules.json` to Realtime Database rules.
6. Copy `watch-party/firebase-config.example.js` to `watch-party/firebase-config.js`.
7. Fill in `firebase`, `databaseURL`, room limits, and ICE configuration.
8. Do not commit private service accounts, permanent TURN passwords, or backend-only credentials.

## Deploy rules

With Firebase CLI:

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase database:set / --data '{}'
firebase deploy --only database
```

If the project does not already have `firebase.json`, deploy rules from the Firebase console or create a local Firebase CLI config that points `database.rules.json` at this file.

## Emulator testing

This repository includes local-only emulator configuration:

```powershell
npm run watch-party:emulators
```

The emulator loads `firebase/database.rules.json` through the root `firebase.json`. The Emulator UI is available at `http://127.0.0.1:4000`.

For deeper rules tests, create authenticated test contexts for owner, guest, and third user, then assert:

- Owner can create a room.
- Guest can claim an empty `guestUid`.
- Third user cannot read or write the room.
- Guest cannot replace an existing guest UID.
- Only owner can end the room.
- Participants can only write their own participant record.
- Signaling paths only accept the correct role.

## Cleanup of expired rooms

Rooms expire client-side after the configured lifetime and cannot be joined once expired. For abandoned data, schedule cleanup with a Firebase function, Cloud Scheduler job, or a trusted admin script that deletes:

```text
rooms/{roomCode}
```

where `expiresAt < Date.now()` or `status` is `ended` older than the retention window. This cleanup must use Admin SDK credentials outside the public repository.
