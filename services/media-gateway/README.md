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

This repository does not include Firebase Admin credentials. Production verification uses Google SecureToken public certificates and the expected Firebase project ID. Do not ship service-account JSON in this repository.

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

## Production Architecture

Target: Google Cloud Run.

Recommended managed components:

- Cloud Run service for authenticated API and HLS proxy.
- Firebase Authentication ID tokens from Watch Party clients.
- Firestore or RTDB for durable job metadata. In-memory job maps are not sufficient across Cloud Run restarts or multiple instances.
- Cloud Storage bucket for temporary HLS manifests and segments.
- Object lifecycle policy that deletes temporary output after the configured TTL.
- Cloud Tasks or Cloud Run Jobs for durable long-running conversion work if conversion must continue after the HTTP request returns.

The canonical Watch Party room media URL remains the host-owned source. Each browser independently decides direct playback or gateway HLS based on its device profile. The gateway may deduplicate conversion work with a key derived from `sha256(sourceUrl) + conversionProfile`, but raw source URLs must not appear in public job metadata or Public Room directory data.

## FFmpeg Policy

The gateway should avoid unnecessary video transcoding:

- H.264 + AAC in MKV: remux/copy to HLS fMP4.
- H.264 + AC3/EAC3/DTS/MP3 or other audio: copy video, transcode audio to AAC.
- HEVC + AAC: copy only when the target profile explicitly supports HEVC HLS; otherwise transcode video to H.264.
- Other video codecs: transcode video to H.264 and audio to AAC.

For long movies, production should expose `playable` once the manifest and first HLS segments are ready, then continue processing remaining segments. Do not require the whole source to finish before playback when the selected execution model can safely continue.

## Cloud Run Deployment Checklist

Do not deploy from this task. For a future owner-controlled deployment:

1. Enable Cloud Run, Cloud Storage, Cloud Build, Artifact Registry, IAM Credentials, and the metadata APIs required by the runtime.
2. Create a dedicated service account.
3. Grant only the bucket permissions needed for temporary object create/read/delete.
4. Grant only the database permissions needed for gateway job metadata.
5. Configure `FIREBASE_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT`.
6. Configure `MEDIA_GATEWAY_REQUIRE_AUTH=true`.
7. Configure job TTL, max active jobs, CPU, memory, concurrency, max instances, and request timeout.
8. Add a Cloud Storage lifecycle rule for temporary HLS output.
9. Use Cloud Tasks or Cloud Run Jobs for conversion work that must outlive an HTTP request.
10. Set `WATCH_PARTY_MEDIA_GATEWAY_URL` in the Pages build environment only after the service is tested.

Suggested conservative runtime starting point:

```text
CPU: 2
Memory: 2 GiB
Concurrency: 2-4
Max instances: low bounded value
Request timeout: 15-60 minutes only if synchronous conversion remains
Output TTL: about 2 hours
```

Cost controls matter because arbitrary public media conversion can be expensive. Keep rate limits, job size limits, and source URL SSRF protections enabled.

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

Do not deploy until authentication, durable job metadata, temporary Cloud Storage output, rate limits, output hosting/proxying, and operational cleanup are configured.
