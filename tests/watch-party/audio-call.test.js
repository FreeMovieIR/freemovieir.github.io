import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { AudioCall, isValidIceServer, validateTurnResponse } from "../../watch-party/js/audio-call.js";

class FakeTrack {
    constructor(id = "track") {
        this.id = id;
        this.kind = "audio";
        this.readyState = "live";
        this.enabled = true;
        this.stopCount = 0;
    }

    stop() {
        this.stopCount += 1;
        this.readyState = "ended";
    }
}

class FakeStream {
    constructor(tracks = []) {
        this.tracks = tracks;
    }

    getAudioTracks() {
        return this.tracks.filter((track) => track.kind === "audio");
    }

    getTracks() {
        return [...this.tracks];
    }
}

class FakeSender {
    constructor() {
        this.track = null;
        this.replacements = [];
    }

    async replaceTrack(track) {
        this.track = track || null;
        this.replacements.push(track || null);
    }
}

class FakePeerConnection {
    static instances = [];

    constructor(config) {
        this.config = config;
        this.connectionState = "new";
        this.iceConnectionState = "new";
        this.iceGatheringState = "new";
        this.signalingState = "stable";
        this.remoteDescription = null;
        this.localDescription = null;
        this.transceivers = [];
        this.senders = [];
        this.addedCandidates = [];
        this.closed = false;
        this.restartCount = 0;
        FakePeerConnection.instances.push(this);
    }

    addTransceiver(kind, options) {
        const sender = new FakeSender();
        const transceiver = { kind, direction: options?.direction, sender };
        this.transceivers.push(transceiver);
        this.senders.push(sender);
        return transceiver;
    }

    getSenders() {
        return this.senders;
    }

    getTransceivers() {
        return this.transceivers;
    }

    async createOffer() {
        return { type: "offer", sdp: "v=0\no=fake-offer" };
    }

    async createAnswer() {
        return { type: "answer", sdp: "v=0\no=fake-answer" };
    }

    async setLocalDescription(description) {
        this.localDescription = description;
        this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
    }

    async setRemoteDescription(description) {
        this.remoteDescription = description;
        this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
    }

    async addIceCandidate(candidate) {
        this.addedCandidates.push(candidate);
    }

    restartIce() {
        this.restartCount += 1;
    }

    close() {
        this.closed = true;
        this.connectionState = "closed";
        this.iceConnectionState = "closed";
    }

    async getStats() {
        return new Map([
            ["pair", { id: "pair", type: "candidate-pair", selected: true, localCandidateId: "local", remoteCandidateId: "remote", currentRoundTripTime: 0.04 }],
            ["local", { id: "local", type: "local-candidate", candidateType: "relay", protocol: "udp" }],
            ["remote", { id: "remote", type: "remote-candidate", candidateType: "relay", protocol: "udp" }],
            ["inbound", { id: "inbound", type: "inbound-rtp", kind: "audio", packetsReceived: 12, bytesReceived: 1024, jitter: 0.002, packetsLost: 0 }]
        ]);
    }
}

class FakeIceCandidate {
    constructor(init) {
        Object.assign(this, init);
    }
}

class FakeSessionDescription {
    constructor(init) {
        Object.assign(this, init);
    }
}

function makeDb(values = {}) {
    const writes = [];
    const childAdded = new Map();
    return {
        writes,
        child(parent, path) { return `${parent}/${path}`; },
        async set(path, value) {
            writes.push({ type: "set", path, value });
            values[path] = value;
        },
        async remove(path) {
            writes.push({ type: "remove", path });
            delete values[path];
        },
        push(path, value) {
            writes.push({ type: "push", path, value });
            return Promise.resolve({ key: `key-${writes.length}` });
        },
        async get(path) {
            return {
                val: () => values[path] ?? null,
                exists: () => values[path] !== undefined && values[path] !== null
            };
        },
        onValue() {
            return () => {};
        },
        onChildAdded(path, callback) {
            const callbacks = childAdded.get(path) || [];
            callbacks.push(callback);
            childAdded.set(path, callbacks);
            return () => childAdded.set(path, callbacks.filter((item) => item !== callback));
        },
        emitChild(path, value) {
            for (const callback of childAdded.get(path) || []) {
                callback({ val: () => value });
            }
        }
    };
}

function makeRoomService({ role = "owner", uid = role, db = makeDb() } = {}) {
    const updates = [];
    return {
        role,
        uid,
        updates,
        firebase: {
            db,
            auth: { currentUser: { getIdToken: async () => "firebase-id-token" } },
            serverTimestamp: () => 12345
        },
        roomRef(code = "ABCDEFGH") {
            return `rooms/${code}`;
        },
        async updateParticipant(patch) {
            updates.push(patch);
        }
    };
}

function makeAudio(roomService, config = {}) {
    const remoteAudio = {
        srcObject: null,
        paused: true,
        muted: false,
        volume: 1,
        playCalls: 0,
        async play() {
            this.playCalls += 1;
            this.paused = false;
        }
    };
    const audio = new AudioCall(roomService, {
        rtc: {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            connectionTimeoutMs: 1000,
            maxIceRestarts: 2,
            relayFallback: true,
            ...config.rtc
        },
        ...config
    }, remoteAudio);
    audioInstances.push(audio);
    return audio;
}

let originalGlobals;
let audioInstances = [];

beforeEach(() => {
    originalGlobals = {
        RTCPeerConnection: globalThis.RTCPeerConnection,
        RTCIceCandidate: globalThis.RTCIceCandidate,
        RTCSessionDescription: globalThis.RTCSessionDescription,
        MediaStream: globalThis.MediaStream,
        navigator: globalThis.navigator,
        location: globalThis.location,
        window: globalThis.window,
        localStorage: globalThis.localStorage,
        isSecureContext: globalThis.isSecureContext,
        fetch: globalThis.fetch
    };
    FakePeerConnection.instances = [];
    Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: FakePeerConnection });
    Object.defineProperty(globalThis, "RTCIceCandidate", { configurable: true, value: FakeIceCandidate });
    Object.defineProperty(globalThis, "RTCSessionDescription", { configurable: true, value: FakeSessionDescription });
    Object.defineProperty(globalThis, "MediaStream", { configurable: true, value: FakeStream });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: "127.0.0.1", href: "http://127.0.0.1:8080/watch-party/" } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { __WATCH_PARTY_TEST__: { voice: {} } } });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => {} } });
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { mediaDevices: { getUserMedia: async () => new FakeStream([new FakeTrack("mic")]) } }
    });
});

afterEach(() => {
    audioInstances.splice(0).forEach((audio) => audio.destroy());
    for (const [key, value] of Object.entries(originalGlobals)) {
        Object.defineProperty(globalThis, key, { configurable: true, value });
    }
});

test("room entry creates one peer, one audio transceiver, and one sender before microphone toggle", async () => {
    const db = makeDb();
    const roomService = makeRoomService({ role: "owner", uid: "owner", db });
    const audio = makeAudio(roomService);

    await audio.start();

    assert.equal(FakePeerConnection.instances.length, 1);
    assert.equal(audio.peerCreateCount, 1);
    assert.equal(audio.peer.getTransceivers().length, 1);
    assert.equal(audio.peer.getSenders().length, 1);
    assert.equal(audio.peer.getSenders()[0].track, null);
    assert.equal(db.writes.filter((write) => write.path.endsWith("/signaling/offer")).length, 1);
});

test("delayed negotiationneeded after initial owner offer does not create a duplicate offer", async () => {
    const db = makeDb();
    const roomService = makeRoomService({ role: "owner", uid: "owner", db });
    const audio = makeAudio(roomService);

    await audio.start();
    await audio.peer.onnegotiationneeded();

    assert.equal(db.writes.filter((write) => write.path.endsWith("/signaling/offer")).length, 1);
    assert.equal(audio.peerCreateCount, 1);
});

test("microphone on and off use replaceTrack without recreating peer or adding senders", async () => {
    const roomService = makeRoomService({ role: "owner", uid: "owner", db: makeDb() });
    const audio = makeAudio(roomService);
    await audio.start();
    const peer = audio.peer;
    const sender = peer.getSenders()[0];

    await audio.enableMicrophone();
    const enabledTrack = sender.track;
    await audio.disableMicrophone();

    assert.equal(audio.peer, peer);
    assert.equal(audio.peerCreateCount, 1);
    assert.equal(peer.getTransceivers().length, 1);
    assert.equal(peer.getSenders().length, 1);
    assert.equal(sender.replacements[0], null);
    assert.equal(sender.replacements.at(-1), null);
    assert.equal(enabledTrack.stopCount, 1);
    assert.equal(enabledTrack.readyState, "ended");
});

test("rapid microphone enable requests are serialized and call getUserMedia once", async () => {
    let getUserMediaCalls = 0;
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { mediaDevices: { getUserMedia: async () => {
            getUserMediaCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return new FakeStream([new FakeTrack(`mic-${getUserMediaCalls}`)]);
        } } }
    });
    const audio = makeAudio(makeRoomService({ role: "owner", uid: "owner", db: makeDb() }));
    await audio.start();

    const [first, second] = await Promise.all([audio.enableMicrophone(), audio.enableMicrophone()]);

    assert.equal(first, true);
    assert.equal(second, true);
    assert.equal(getUserMediaCalls, 1);
    assert.equal(audio.peerCreateCount, 1);
});

test("guest can create peer from owner generation and answer before enabling mic", async () => {
    const db = makeDb({
        "rooms/ABCDEFGH/signaling/generationId": "gen-1",
        "rooms/ABCDEFGH/signaling/offer": { generationId: "gen-1", type: "offer", sdp: "v=0", uid: "owner", createdAt: 1 }
    });
    const roomService = makeRoomService({ role: "guest", uid: "guest", db });
    const audio = makeAudio(roomService);

    await audio.start();

    assert.equal(audio.peerCreateCount, 1);
    assert.equal(audio.peer.remoteDescription.type, "offer");
    assert.equal(audio.peer.getSenders()[0].track, null);
    assert.ok(db.writes.some((write) => write.path.endsWith("/signaling/answer") && write.value.generationId === "gen-1"));
});

test("candidates before remote description are queued, stale and duplicate candidates are ignored", async () => {
    const db = makeDb();
    const roomService = makeRoomService({ role: "owner", uid: "owner", db });
    const audio = makeAudio(roomService);
    await audio.start();
    const candidatePath = "rooms/ABCDEFGH/signaling/guestCandidates";

    db.emitChild(candidatePath, { generationId: "stale", candidate: "candidate:stale", uid: "guest", createdAt: 1 });
    db.emitChild(candidatePath, { generationId: audio.generationId, candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0, uid: "guest", createdAt: 1 });
    db.emitChild(candidatePath, { generationId: audio.generationId, candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0, uid: "guest", createdAt: 1 });

    assert.equal(audio.pendingCandidates.length, 1);
    assert.equal(audio.peer.addedCandidates.length, 0);
    await audio.applyAnswer({ generationId: audio.generationId, type: "answer", sdp: "v=0", uid: "guest", createdAt: 1 });
    assert.equal(audio.pendingCandidates.length, 0);
    assert.equal(audio.peer.addedCandidates.length, 1);
});

test("forceRelay local test mode creates relay-only peer", async () => {
    globalThis.window.__WATCH_PARTY_TEST__.voice.forceRelay = true;
    const audio = makeAudio(makeRoomService({ role: "owner", uid: "owner", db: makeDb() }));

    await audio.start();

    assert.equal(audio.peer.config.iceTransportPolicy, "relay");
});

test("TURN endpoint uses Firebase ID token and rejects invalid or expired responses", async () => {
    const expiresAt = Date.now() + 5 * 60 * 1000;
    let authHeader = "";
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async (_url, options) => {
            authHeader = options.headers.authorization;
            assert.equal(options.credentials, "omit");
            return {
                ok: true,
                async json() {
                    return { expiresAt, iceServers: [{ urls: "turn:turn.example.com:3478", username: "u", credential: "p" }] };
                }
            };
        }
    });
    const audio = makeAudio(makeRoomService({ role: "owner", uid: "owner", db: makeDb() }), {
        rtc: { turnCredentialsEndpoint: "http://127.0.0.1:9999/turn" }
    });

    const config = await audio.buildRtcConfig();

    assert.equal(authHeader, "Bearer firebase-id-token");
    assert.ok(config.iceServers.some((server) => String(server.urls).startsWith("turn:")));
    assert.throws(() => validateTurnResponse({ expiresAt: Date.now() - 1, iceServers: [{ urls: "turn:x", username: "u", credential: "p" }] }));
    assert.throws(() => validateTurnResponse({ expiresAt, iceServers: [{ urls: "stun:stun.example.com:19302" }] }));
    assert.equal(isValidIceServer({ urls: "turn:turn.example.com:3478" }), false);
});

test("relay fallback is bounded and starts a new owner generation without touching video sync", async () => {
    let fetchCount = 0;
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => {
            fetchCount += 1;
            return {
                ok: true,
                async json() {
                    return {
                        expiresAt: Date.now() + 5 * 60 * 1000,
                        iceServers: [{ urls: "turn:turn.example.com:3478", username: "u", credential: "p" }]
                    };
                }
            };
        }
    });
    const db = makeDb();
    const audio = makeAudio(makeRoomService({ role: "owner", uid: "owner", db }), {
        rtc: { turnCredentialsEndpoint: "http://127.0.0.1:9999/turn" }
    });
    await audio.start();
    const firstPeer = audio.peer;
    const firstGeneration = audio.generationId;

    await audio.handleConnectionTimeout();
    await audio.handleConnectionTimeout();

    assert.equal(fetchCount, 1);
    assert.equal(firstPeer.closed, true);
    assert.notEqual(audio.generationId, firstGeneration);
    assert.equal(audio.peer.config.iceTransportPolicy, "relay");
    assert.equal(audio.peerCreateCount, 2);
});

test("remote autoplay rejection is exposed and user unlock calls audio play directly", async () => {
    const roomService = makeRoomService({ role: "owner", uid: "owner", db: makeDb() });
    const audio = makeAudio(roomService);
    let blockEvents = 0;
    audio.remoteAudio.play = async () => {
        audio.remoteAudio.playCalls += 1;
        throw new DOMException("blocked", "NotAllowedError");
    };
    audio.addEventListener("remoteAudioBlocked", () => { blockEvents += 1; });
    await audio.start();

    audio.peer.ontrack({ track: new FakeTrack("remote"), streams: [new FakeStream([new FakeTrack("remote")])] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(blockEvents, 1);
    assert.equal((await audio.getDiagnostics()).remoteAudio.playRejected, true);
    audio.remoteAudio.play = async () => {
        audio.remoteAudio.playCalls += 1;
        audio.remoteAudio.paused = false;
    };
    await audio.unlockRemoteAudio();
    assert.equal(audio.remoteAudio.paused, false);
});

test("cleanup closes peer, stops local tracks, clears listeners and remote audio", async () => {
    const audio = makeAudio(makeRoomService({ role: "owner", uid: "owner", db: makeDb() }));
    await audio.start();
    await audio.enableMicrophone();
    const track = audio.localStream.getAudioTracks()[0];

    audio.destroy();

    assert.equal(track.readyState, "ended");
    assert.equal(audio.peer, null);
    assert.equal(audio.localSender, null);
    assert.equal(audio.remoteAudio.srcObject, null);
    assert.equal(audio.unsubscribers.length, 0);
});
