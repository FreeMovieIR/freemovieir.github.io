# Media Gateway V2 Real-Device Mobile Test Checklist

Playwright cannot prove native Safari HLS compatibility. Complete this checklist before enabling `WATCH_PARTY_MEDIA_GATEWAY_ENABLED` in production.

## Devices

- iPhone Safari
- iPhone Chrome
- Android Chrome

Use legally owned short test clips only.

## Direct Playback Baseline

- MP4 H.264/AAC plays without Gateway.
- HLS `.m3u8` behavior is unchanged.
- Fullscreen works.
- Pause, seek, resume, and room sync still work.

## Gateway MKV Cases

- MKV H.264/AAC creates or reuses one Gateway job.
- MKV H.264 with incompatible audio copies video and converts audio to AAC.
- HEVC source follows the selected policy for the device profile.
- A second browser requesting the same source/profile reuses the same job.
- Playback starts from signed HLS access without custom segment request headers.
- Signed playback can be refreshed without starting a new conversion.

## Watch Party Sync

- Desktop direct source and mobile Gateway HLS stay synchronized.
- Host play/pause/seek updates the mobile client.
- Media replacement cancels old client polling and does not attach stale Gateway output.
- Leaving the room aborts client polling and clears the media controller state.

## Failure UX

- Expired source link returns a safe Persian message.
- Blocked/private source link is rejected safely.
- Gateway disabled shows compatibility text without network requests to the Gateway.
- Gateway timeout does not cause an infinite spinner or retry loop.

## Audio/Voice Boundary

- Public Voice remains disabled.
- Private Voice V2 behavior is unchanged.
- No microphone permission prompt appears because of Gateway playback.
