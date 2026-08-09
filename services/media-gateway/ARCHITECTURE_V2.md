# Media Gateway V2 Architecture

## Old

- API state lived in `new Map()` inside the Cloud Run service process.
- The API wrote HLS output to a local service filesystem directory.
- The API returned HTTP `202` and then continued conversion in an in-memory promise.
- Playback URLs pointed back at process-local output assumptions.
- A Cloud Run restart, second instance, or request timeout could lose authoritative state.

## New

- The Cloud Run API service is stateless and lightweight.
- Firebase ID tokens are verified server-side; clients never choose UID or role in the request body.
- Durable job metadata lives under the server-only RTDB namespace `mediaGatewayJobs/{jobKey}`.
- `jobKey` is a SHA-256 dedup key derived from normalized source URL, sanitized device profile, and policy version.
- The API uses RTDB transactions to create or reuse jobs and then starts one predefined Cloud Run Job.
- The worker Cloud Run Job loads the job by key, acquires a lease, revalidates the source, probes with ffprobe, chooses policy, produces HLS, uploads output to Cloud Storage, and marks the job playable/ready.
- Cloud Storage is authoritative playback storage. Local worker disk is only temporary workspace.
- Playback access is short-lived. The signed manifest strategy signs segment access too, which is required for native Safari HLS.
- Cleanup removes expired RTDB metadata and Storage prefixes. Bucket lifecycle is still recommended as a safety net.

## Removed

- No authoritative production `Map`.
- No production playback from Cloud Run local filesystem.
- No production conversion that relies on an API-process background promise after HTTP `202`.
- No raw source URL in public API responses, Public Room directory, playback response, or object names.
- No downloaded service-account private key requirement; production should use managed service identities and Application Default Credentials.

## V2 Flow

```text
Client
  -> POST /v2/jobs with Firebase ID token
API service
  -> validate token, source, rate limits
  -> create/reuse mediaGatewayJobs/{jobKey}
  -> execute predefined Cloud Run Job with MEDIA_GATEWAY_JOB_KEY
Worker job
  -> acquire RTDB lease
  -> ffprobe
  -> remux/transcode to HLS
  -> upload manifest/segments to Cloud Storage
  -> mark playable/ready
Client
  -> GET /v2/jobs/{jobKey}
  -> GET /v2/jobs/{jobKey}/playback for signed HLS access
```
