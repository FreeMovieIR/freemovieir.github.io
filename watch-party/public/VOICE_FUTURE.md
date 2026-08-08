# Public Rooms Voice Future

Voice is not implemented in Public Rooms V1.

The V1 code includes only a no-op provider abstraction so the public app can later integrate a managed group voice system without rewriting room state and permissions.

The no-op provider:

- does not call `navigator.mediaDevices`
- does not call `getUserMedia`
- does not create `RTCPeerConnection`
- does not make network requests
- does not write signaling data
- does not request microphone permission

Future group voice will likely require a managed SFU. Provider selection is intentionally deferred.

Reserved future concepts:

```text
states: DISABLED, CONNECTING, CONNECTED, FAILED
policies: DISABLED, OPEN, REQUEST_TO_SPEAK
```

Only `DISABLED` is active in V1.
