# Watch Party iPhone Safari Checklist

Automated Playwright WebKit is not a physical iPhone Safari test. Use this checklist on a real iPhone before claiming iPhone production support.

## Fullscreen

- Open a room with an MP4 H.264/AAC URL.
- Tap the Watch Party fullscreen button.
- Verify native iPhone video fullscreen opens.
- Exit fullscreen.
- Confirm playback time is preserved.
- Confirm shared sync continues after exit.
- Repeat in portrait.
- Rotate to landscape and repeat.
- Test HLS H.264/AAC.
- Test Cinema Mode fallback if native fullscreen is unavailable.

## Media

- MP4 H.264/AAC direct playback.
- HLS H.264/AAC direct playback.
- WebM if supported by the installed iOS version.
- Direct MKV result: confirm the UI does not promise universal direct support.
- Gateway-converted MKV result after a gateway is deployed and `WATCH_PARTY_MEDIA_GATEWAY_URL` is configured.
- HEVC source.
- DTS source converted to AAC through gateway.
- Subtitle URL and uploaded subtitle.
- Audio-track selection where available.

## Microphone

- Microphone is off on load.
- First toggle requests permission once.
- Permission accepted.
- Permission denied.
- Off and on once.
- Rapid taps do not create duplicate prompts or repeated offers.
- Remote voice is audible.
- If Safari blocks remote audio, tap the on-page continue/listen action.
- Test speaker.
- Test wired headphones.
- Test Bluetooth headphones.
- Wi-Fi to Wi-Fi.
- Wi-Fi to mobile data.
- Background the tab and return.
- Lock screen and return.

## UI

- Welcome.
- Host setup.
- Guest setup.
- Lobby.
- QR invite.
- Device compatibility preflight.
- Active room.
- Chat keyboard.
- Safe areas and Dynamic Island.
- Portrait.
- Landscape.
- Leave/end dialogs.
- Bottom controls.
