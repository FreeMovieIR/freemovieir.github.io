# Media Gateway V2 Rollback

This runbook is for the controlled Media Gateway rollout. It intentionally keeps rollback focused on stopping new user traffic first, then reducing infrastructure exposure.

## Fastest Rollback

Keep or restore the GitHub Pages rollout variables to:

```text
WATCH_PARTY_MEDIA_GATEWAY_ENABLED=false
WATCH_PARTY_MEDIA_GATEWAY_BASE_URL=
```

When the frontend flag is off, Private Watch Party and Public Cinema continue to use direct browser playback for MP4/WebM/HLS. Unsupported mobile MKV should show the compatibility message instead of contacting the Gateway.

## Current Dark Infrastructure State

If Gateway infrastructure exists but the frontend remains disabled, no Pages rollback is required. Do not enable repository variables until API, worker, IAM, storage cleanup, signed playback, and real-device tests have passed.

## Incident Response

1. Confirm the frontend flag is disabled.
2. Reduce the API Cloud Run service max instances to a conservative value or zero traffic if needed.
3. Stop launching new worker jobs by removing the API service account's permission to execute the worker job, or by disabling traffic to the API service.
4. Leave the temporary bucket, RTDB metadata, and worker job in place long enough to inspect logs and preserve incident evidence.
5. Run cleanup only for Media Gateway test/job prefixes. Do not delete unrelated Firebase, RTDB, Public Room, or Watch Party data.

## Do Not Do During First Response

- Do not delete the temporary bucket unless storage exposure requires immediate removal.
- Do not delete Cloud Run services before collecting logs needed for diagnosis.
- Do not grant broad IAM roles to recover service behavior.
- Do not deploy frontend variables that enable the Gateway while diagnosing.

## Post-Rollback Checks

- Production runtime config has `mediaGateway.enabled=false`.
- Production runtime config has `mediaGateway.baseUrl=""`.
- Direct MP4 playback still works.
- HLS behavior is unchanged.
- Unsupported mobile MKV shows a safe Persian compatibility message.
- Cloud logs do not contain Firebase tokens, Authorization headers, raw source URLs, signed playback URLs, or service-account credentials.
