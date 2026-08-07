# FreeMovieIR Media Compatibility Gateway

Optional FFmpeg-based fallback for Watch Party media that cannot play directly in a browser, especially MKV and legacy containers on iPhone Safari.

This service is not deployed by GitHub Pages and is intentionally excluded from `dist/`.

## API

- `POST /v1/probe`
- `POST /v1/jobs`
- `GET /v1/jobs/:id`
- `DELETE /v1/jobs/:id`

All production requests must include a Firebase ID token:

```text
Authorization: Bearer <firebase-id-token>
```

This repository does not include Firebase Admin credentials. Production deployment should verify ID tokens with a securely configured server-side identity layer.

## Security Defaults

- HTTP/HTTPS source URLs only.
- URL credentials are rejected.
- Loopback, private, link-local, and metadata endpoints are blocked.
- DNS is resolved before processing to reduce SSRF risk.
- FFmpeg and ffprobe are spawned with argument arrays.
- No arbitrary client headers or cookies are accepted.
- Jobs are temporary and expire.
- Output names are random job IDs.
- Logs should use redacted URLs only.
- No movie bytes or microphone audio are stored in Firebase.

## Local Run

```powershell
cd "E:\Coding\New folder\freemovieir.github.io"
npm run media-gateway:test
cd services/media-gateway
$env:MEDIA_GATEWAY_REQUIRE_AUTH="false"
$env:MEDIA_GATEWAY_FAKE_PROBE="true"
npm start
```

The test suite includes a generated synthetic clip that is converted to HLS with the same FFmpeg argument policy used by the gateway. It uses the pinned root `ffmpeg-static` dev dependency and does not download media.

## Docker

```powershell
docker build -t freemovieir-media-gateway:local services/media-gateway
```

Docker Desktop or another compatible Docker daemon must be running for this command to work.

Do not deploy until authentication, temporary storage, rate limits, output hosting, and operational cleanup are configured.
