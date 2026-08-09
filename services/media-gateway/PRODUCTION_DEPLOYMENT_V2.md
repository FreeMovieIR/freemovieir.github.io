# Media Gateway V2 Production Deployment Plan

Do not run these steps from routine development tasks. This document is a future owner checklist for project `freemovieir-fd57a`.

## Required Managed Services

- Cloud Run API service
- Cloud Run Job named conceptually `freemovieir-media-worker`
- Firebase Authentication
- Firebase Realtime Database
- Cloud Storage private temporary bucket, for example `freemovieir-media-temp`
- Artifact Registry
- Cloud Build
- IAM Credentials API only if signed URLs require managed service-account signing

## Environment Variables

API and worker:

```text
MEDIA_GATEWAY_PROJECT_ID=freemovieir-fd57a
MEDIA_GATEWAY_DATABASE_URL=https://freemovieir-fd57a-default-rtdb.firebaseio.com
MEDIA_GATEWAY_DATABASE_PATH=mediaGatewayJobs
MEDIA_GATEWAY_ALLOWED_ORIGINS=https://freemovieir.github.io
MEDIA_GATEWAY_BUCKET=freemovieir-media-temp
MEDIA_GATEWAY_REGION=us-central1
MEDIA_GATEWAY_WORKER_JOB=freemovieir-media-worker
MEDIA_GATEWAY_JOB_TTL_MS=7200000
MEDIA_GATEWAY_PLAYBACK_TTL_MS=2700000
MEDIA_GATEWAY_LEASE_TTL_MS=600000
MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS=14400000
MEDIA_GATEWAY_FFPROBE_TIMEOUT_MS=60000
MEDIA_GATEWAY_MAX_ACTIVE_PER_UID=2
MEDIA_GATEWAY_MAX_CREATE_PER_HOUR=6
MEDIA_GATEWAY_MAX_GLOBAL_ACTIVE=4
MEDIA_GATEWAY_REQUIRE_AUTH=true
```

Set the downscoped Realtime Database auth override per runtime:

```text
API service:
MEDIA_GATEWAY_DB_AUTH_UID=media-gateway-api

Worker job:
MEDIA_GATEWAY_DB_AUTH_UID=media-gateway-worker
```

Production startup must fail if `MEDIA_GATEWAY_DB_AUTH_UID` is missing or is not one of those two values.

Frontend Pages rollout variables:

```text
WATCH_PARTY_MEDIA_GATEWAY_ENABLED=false
WATCH_PARTY_MEDIA_GATEWAY_BASE_URL=
```

Gateway must remain disabled until the API, worker, IAM, Storage lifecycle, and real-device testing are complete.

## IAM Model

Avoid Owner and Editor roles.

API service identity needs:

- Verify Firebase ID tokens through Firebase Admin SDK / project identity.
- Read/write only `mediaGatewayJobs`.
- Execute the predefined Cloud Run Job.
- Read Storage objects if API signs playback access.
- Sign Blob permission only through managed service-account signing if signed URLs need it.

Worker service identity needs:

- Read/write only `mediaGatewayJobs`.
- Create/read/delete objects under `jobs/*` in the temporary media bucket.
- No Public Room database write permissions beyond the gateway namespace.

No downloaded service-account JSON private key is required or recommended.

## Firebase Admin App Separation

Firebase Authentication token verification uses the `[DEFAULT]` Firebase Admin app with Application Default Credentials. This app must not be initialized with a Realtime Database auth override.

Gateway Realtime Database access uses a separate named Firebase Admin app:

```text
media-gateway-db-media-gateway-api
media-gateway-db-media-gateway-worker
```

Those named apps are initialized with:

```text
databaseAuthVariableOverride.uid=media-gateway-api
```

or:

```text
databaseAuthVariableOverride.uid=media-gateway-worker
```

Firebase Realtime Database Rules grant those override identities access only to `mediaGatewayJobs`. They are denied access to Private Watch Party rooms, Public Cinema room data, and the public room directory.

## CORS And Browser Access

The Cloud Run API service may be publicly reachable at the infrastructure layer because browser JavaScript must be able to call it from GitHub Pages. Application endpoints still require Firebase ID token verification through the `Authorization: Bearer <Firebase ID token>` header.

Production CORS must be configured with exact allowed origins:

```text
MEDIA_GATEWAY_ALLOWED_ORIGINS=https://freemovieir.github.io
```

Do not use `*`. Do not include paths, query strings, fragments, wildcard subdomains, or credentials in this value. Add local development origins only when explicitly testing them, for example `http://127.0.0.1:8080`.

Allowed browser preflights receive:

```text
Access-Control-Allow-Origin: <exact request origin>
Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS
Access-Control-Allow-Headers: Authorization,Content-Type
Access-Control-Max-Age: 600
Vary: Origin
```

Requests from unknown browser origins are rejected before Firebase token verification or job mutation and do not receive `Access-Control-Allow-Origin`. Requests without an `Origin` header are allowed to reach normal Firebase token authentication so controlled server-side smoke tests can still be performed.

CORS is not an authentication boundary. Do not accept `Origin` as identity and do not enable cookie credentials; the browser client uses bearer tokens and `credentials: "omit"`.

## Storage

Bucket:

```text
freemovieir-media-temp
```

Object layout:

```text
jobs/{jobKey}/index.m3u8
jobs/{jobKey}/init.mp4
jobs/{jobKey}/segment...
```

The bucket must not be public or listable. Objects are temporary and should have a lifecycle rule deleting old objects after the selected TTL safety window.

Review Cloud Storage soft-delete retention before production. Soft delete can preserve deleted HLS segments longer than intended; disabling or shortening it improves privacy and cost control but reduces accidental recovery options.

## Build And Runtime Shape

One image can be used with separate entry points:

- API service command: `node src/server.js`
- Worker job command: `node src/worker-main.js`

The worker image must include FFmpeg and ffprobe. The Dockerfile installs Debian FFmpeg and does not download FFmpeg per job.

## Worker Runtime Resources

Initial worker baseline:

```text
CPU: 2
Memory: 2Gi or 4Gi initially
Cloud Run Job task timeout: slightly greater than MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS
Max retries: 0 initially
Tasks: 1
Parallelism: 1
```

`MEDIA_GATEWAY_FFMPEG_TIMEOUT_MS` defaults to 14,400,000 ms (4 hours) and is capped at 21,600,000 ms (6 hours). `MEDIA_GATEWAY_FFPROBE_TIMEOUT_MS` defaults to 60,000 ms and is capped at 300,000 ms.

Cloud Run's normal writable filesystem is memory-backed. Production correctness must not depend on retaining an entire HLS movie in `/tmp`. The worker uploads finalized HLS output incrementally and deletes finalized local media segments after successful Cloud Storage upload. The local workspace should remain bounded to the active segment(s), `index.m3u8`, `init.mp4`, and small metadata. Do not require Preview Ephemeral Disk for normal production operation.

## Rollback

Frontend rollback is safest:

```text
WATCH_PARTY_MEDIA_GATEWAY_ENABLED=false
WATCH_PARTY_MEDIA_GATEWAY_BASE_URL=
```

With Gateway disabled, MP4 and HLS direct playback continue through the existing browser path and mobile MKV receives a compatibility message.
