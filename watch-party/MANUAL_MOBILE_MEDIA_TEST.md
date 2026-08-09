# Watch Party V5 Mobile Media Checklist

Use this after local automated tests pass. Do not use copyrighted media unless you own the test file.

## Local setup

```powershell
cd "E:\Coding\New folder\freemovieir.github.io"
npm run watch-party:emulators
npm run watch-party:serve
```

Open:

```text
http://127.0.0.1:8080/watch-party/public/
```

Local fixtures:

```text
http://127.0.0.1:8080/test-assets/sample.mp4
http://127.0.0.1:8080/test-assets/sample-h264-aac.mkv
http://127.0.0.1:8080/test-assets/sample-h264-mp3.mkv
```

## iPhone Safari

- Create a Public Room as host with `sample.mp4`.
- Join from another context/device as guest.
- Verify host sees Play/Pause, -10, +10, seek, speed, volume, mute, fullscreen.
- Verify guest sees time, read-only progress, volume, mute, fullscreen only.
- Tap guest fullscreen. Native iOS video fullscreen should open when available.
- Verify guest fullscreen does not change shared playback state.
- Replace media with `sample-h264-aac.mkv`.
- If Media Gateway is configured, verify the Persian preparing state appears, then HLS playback starts.
- If Media Gateway is not configured, verify the MKV incompatibility message is clear.

## iPhone Chrome

Repeat the Safari checklist. Chrome on iOS uses WebKit, so expected fullscreen and MKV behavior should match Safari.

## Android Chrome

- Verify standard element fullscreen includes video, reactions, and custom controls.
- Verify MP4 direct playback still works.
- Test MKV. Direct playback may work on some devices; otherwise gateway fallback should be offered when configured.

## Private Watch Party

- Create a private room with MP4 and verify existing fullscreen still works.
- Test MKV with a mobile device and confirm the same gateway fallback path is used when configured.

## Notes

- Do not claim restrictive NAT, TURN, or real microphone behavior from these media tests.
- Public Voice remains disabled and is not part of this checklist.
