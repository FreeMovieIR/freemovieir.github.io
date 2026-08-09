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
MEDIA_GATEWAY_BUCKET=freemovieir-media-temp
MEDIA_GATEWAY_REGION=us-central1
MEDIA_GATEWAY_WORKER_JOB=freemovieir-media-worker
MEDIA_GATEWAY_JOB_TTL_MS=7200000
MEDIA_GATEWAY_PLAYBACK_TTL_MS=2700000
MEDIA_GATEWAY_LEASE_TTL_MS=600000
MEDIA_GATEWAY_MAX_ACTIVE_PER_UID=2
MEDIA_GATEWAY_MAX_CREATE_PER_HOUR=6
MEDIA_GATEWAY_MAX_GLOBAL_ACTIVE=4
MEDIA_GATEWAY_REQUIRE_AUTH=true
```

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

## Rollback

Frontend rollback is safest:

```text
WATCH_PARTY_MEDIA_GATEWAY_ENABLED=false
WATCH_PARTY_MEDIA_GATEWAY_BASE_URL=
```

With Gateway disabled, MP4 and HLS direct playback continue through the existing browser path and mobile MKV receives a compatibility message.
