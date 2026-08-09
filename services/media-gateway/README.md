# FreeMovieIR Media Gateway V2

Optional serverless compatibility pipeline for browser-hostile media, especially MKV on iPhone Safari and iPhone Chrome.

The Gateway is not deployed by GitHub Pages and remains disabled in frontend production config unless explicitly enabled by repository variables.

## API

Authenticated V2 endpoints:

- `POST /v2/probe`
- `POST /v2/jobs`
- `GET /v2/jobs/:jobId`
- `GET /v2/jobs/:jobId/playback`
- `DELETE /v2/jobs/:jobId`

All production requests require:

```text
Authorization: Bearer <Firebase ID token>
```

Responses expose only safe job state: job id, status, stage, progress, playback availability, expiry, and safe error codes. They never return source URLs, signed source links, service account details, Cloud Run execution internals, or bucket paths.

## Production Shape

- Cloud Run service: lightweight API only.
- Cloud Run Job: FFmpeg/ffprobe worker.
- Realtime Database: server-only durable job state under `mediaGatewayJobs/{jobKey}`.
- Cloud Storage: private temporary HLS output.
- Signed playback access: manifest and segments must both be temporarily accessible for native Safari.

Read:

- `ARCHITECTURE_V2.md`
- `PRODUCTION_DEPLOYMENT_V2.md`
- `PRODUCTION_MOBILE_TEST.md`

## Local Tests

```powershell
cd "E:\Coding\New folder\freemovieir.github.io"
npm run media-gateway:test
```

The tests use explicit fake/memory adapters and synthetic media. They do not require Google Cloud credentials, Firebase production access, Cloud Storage, Cloud Run, or paid services.

## Local API Mode

```powershell
cd "E:\Coding\New folder\freemovieir.github.io\services\media-gateway"
$env:MEDIA_GATEWAY_REQUIRE_AUTH="false"
$env:MEDIA_GATEWAY_LOCAL_MODE="true"
npm start
```

Local mode is for development only. Production config validation rejects it.

## Security Defaults

- Firebase ID token verification is required in production.
- Source URLs must be public HTTP/HTTPS URLs.
- URL credentials are rejected.
- Loopback, RFC1918, link-local, carrier-grade NAT, metadata, and local IPv6 ranges are blocked.
- FFmpeg and ffprobe use argument arrays with `shell: false`.
- Raw source URLs are stored only in server-owned temporary job metadata and cleared after worker completion/failure or cleanup.
- Public Room directory and client-visible job responses never receive raw source URLs.

## Frontend Rollout Flags

Default production state:

```text
WATCH_PARTY_MEDIA_GATEWAY_ENABLED=false
WATCH_PARTY_MEDIA_GATEWAY_BASE_URL=
```

Enabled production builds require an HTTPS base URL. Do not enable until the production API, worker job, IAM, Storage lifecycle, signed playback, and real-device mobile tests are complete.
