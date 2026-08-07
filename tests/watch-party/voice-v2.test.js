import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceCall, isValidIceServer, validateTurnResponse } from "../../watch-party/js/voice/voice-call.js";
import { VOICE_STATES } from "../../watch-party/js/voice/voice-state.js";

let pairCounter = 0;

if (!globalThis.CustomEvent) {
    globalThis.CustomEvent = class CustomEvent extends Event {
        constructor(type, init = {}) {
            super(type);
            this.detail = init.detail;
        }
    };
}

globalThis.location ||= { hostname: "127.0.0.1", href: "http://127.0.0.1:8080/watch-party/" };
globalThis.document ||= new EventTarget();
globalThis.document.visibilityState ||= "visible";
globalThis.addEventListener ||= () => {};
globalThis.removeEventListener ||= () => {};

test("Voice V2 deterministic owner/guest flow creates one peer, one offer, and one answer", async () => {
    const env = makeVoicePair();
    await env.owner.start();
    await env.guest.start();
    await env.owner.updateRoom(twoParticipantRoom());
    await tick();

    assert.equal(env.owner.peerCreateCount, 1);
    assert.equal(env.guest.peerCreateCount, 1);
    assert.equal(env.owner.offerCount, 1);
    assert.equal(env.guest.offerCount, 0);
    assert.equal(env.guest.answerCount, 1);
    assert.equal(env.owner.peer.transceivers.length, 1);
    assert.equal(env.guest.peer.transceivers.length, 1);
    assert.equal(env.owner.peer.getSenders().length, 1);
    assert.equal(env.guest.peer.getSenders().length, 1);
    assert.equal(env.db.writes.filter((write) => write.path.endsWith("/voiceV2/offer")).length, 1);
    assert.equal(env.db.writes.filter((write) => write.path.endsWith("/voiceV2/answer")).length, 1);
    assert.equal(env.db.writes.some((write) => write.path.includes("/signaling/")), false);
    env.destroy();
});

test("Voice V2 microphone toggles replace tracks without renegotiation", async () => {
    const env = makeVoicePair();
    await env.owner.start();
    await env.guest.start();
    await env.owner.updateRoom(twoParticipantRoom());
    await tick();
    const ownerOfferCount = env.owner.offerCount;
    const guestAnswerCount = env.guest.answerCount;

    assert.equal(await env.guest.enableMicrophone(), true);
    assert.equal(await env.owner.enableMicrophone(), true);
    await Promise.all([env.guest.disableMicrophone(), env.owner.disableMicrophone()]);
    assert.equal(await env.guest.enableMicrophone(), true);
    assert.equal(await env.owner.enableMicrophone(), true);

    assert.equal(env.owner.offerCount, ownerOfferCount);
    assert.equal(env.guest.answerCount, guestAnswerCount);
    assert.equal(env.owner.peerCreateCount, 1);
    assert.equal(env.guest.peerCreateCount, 1);
    assert.ok(env.owner.replaceTrackCount >= 3);
    assert.ok(env.guest.replaceTrackCount >= 3);
    assert.equal(env.owner.peer.transceivers.length, 1);
    assert.equal(env.guest.peer.transceivers.length, 1);
    env.destroy();
});

test("Voice V2 remote track, autoplay block, and unlock use the stable audio element", async () => {
    const env = makeVoicePair({ ownerAudio: makeAudioElement({ rejectOnce: true }) });
    await env.owner.start();
    await env.owner.createPeer("v2-session");
    const track = makeTrack();
    env.owner.peer.ontrack({ track, streams: [] });
    await tick();
    let diagnostics = await env.owner.getDiagnostics();
    assert.equal(diagnostics.remoteReceivedTrackCount, 1);
    assert.equal(diagnostics.remoteAudioBlocked, true);
    assert.equal(env.ownerAudio.playCalls, 1);

    await env.owner.unlockRemoteAudio();
    diagnostics = await env.owner.getDiagnostics();
    assert.equal(diagnostics.remoteAudioBlocked, false);
    assert.equal(env.ownerAudio.playCalls, 2);
    assert.equal(env.ownerAudio.srcObject.getTracks()[0], track);
    env.destroy();
});

test("Voice V2 queues ICE before remote description, flushes once, deduplicates, and ignores old sessions", async () => {
    const env = makeVoicePair();
    await env.guest.start();
    await env.guest.createPeer("new-session");
    const candidate = {
        sessionId: "new-session",
        uid: "owner",
        candidate: "candidate:1 1 udp 1 127.0.0.1 1 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0
    };
    await env.guest.handleRemoteCandidate(candidate);
    await env.guest.handleRemoteCandidate(candidate);
    await env.guest.handleRemoteCandidate({ ...candidate, sessionId: "old-session", candidate: "candidate:old" });
    assert.equal(env.guest.pendingCandidates.length, 1);
    assert.equal(env.guest.ignoredOldSessionCount, 1);

    await env.guest.peer.setRemoteDescription({ type: "offer", sdp: "v=0" });
    env.guest.remoteDescriptionReady = true;
    await env.guest.flushCandidates();
    assert.equal(env.guest.pendingCandidates.length, 0);
    assert.equal(env.guest.peer.addedCandidates.length, 1);
    env.destroy();
});

test("Voice V2 performs only one automatic ICE restart, then stops until manual reconnect", async () => {
    const env = makeVoicePair();
    await env.owner.start();
    await env.owner.updateRoom(twoParticipantRoom());
    await tick();
    env.owner.peer.signalingState = "stable";
    env.owner.peer.connectionState = "failed";
    env.owner.handleConnectionState(env.owner.peerGeneration);
    await tick();
    assert.equal(env.owner.restartOfferCount, 1);
    env.owner.peer.connectionState = "failed";
    env.owner.handleConnectionState(env.owner.peerGeneration);
    await tick();
    assert.equal(env.owner.restartOfferCount, 1);
    assert.equal(env.owner.stateMachine.connectionState, VOICE_STATES.FAILED);

    const oldSession = env.owner.sessionId;
    await env.owner.reconnect();
    assert.notEqual(env.owner.sessionId, oldSession);
    assert.equal(env.owner.offerCount, 3);
    env.destroy();
});

test("Voice V2 partner mic-off does not mark the connection failed and diagnostics are safe", async () => {
    const env = makeVoicePair();
    await env.owner.start();
    await env.owner.createPeer("safe-session");
    env.owner.peer.connectionState = "connected";
    env.owner.handleConnectionState(env.owner.peerGeneration);
    env.owner.setPartnerMicEnabled(false);
    const diagnostics = await env.owner.getDiagnostics();
    assert.equal(env.owner.stateMachine.connectionState, VOICE_STATES.CONNECTED);
    assert.equal(diagnostics.peerCount, 1);
    assert.equal(JSON.stringify(diagnostics).includes("127.0.0.1"), false);
    assert.equal(JSON.stringify(diagnostics).includes("v=0"), false);
    env.destroy();
});

test("Voice V2 validates ICE and TURN configuration without credentials", () => {
    assert.equal(isValidIceServer({ urls: "stun:stun.l.google.com:19302" }), true);
    assert.equal(isValidIceServer({ urls: "turn:turn.example.com" }), false);
    assert.throws(() => validateTurnResponse({ expiresAt: Date.now() + 1000, iceServers: [] }));
    const parsed = validateTurnResponse({
        expiresAt: Date.now() + 60_000,
        iceServers: [{ urls: "turn:turn.example.com", username: "short", credential: "short" }]
    });
    assert.equal(parsed.iceServers.length, 1);
});

function makeVoicePair(options = {}) {
    globalThis.RTCPeerConnection = FakePeerConnection;
    pairCounter += 1;
    const roomCode = `ROOM${String(pairCounter).padStart(4, "0")}`;
    const db = new FakeDb();
    const ownerService = makeRoomService({ role: "owner", uid: `owner-${pairCounter}`, db, roomCode });
    const guestService = makeRoomService({ role: "guest", uid: `guest-${pairCounter}`, db, roomCode });
    const ownerAudio = options.ownerAudio || makeAudioElement();
    const guestAudio = options.guestAudio || makeAudioElement();
    const owner = new VoiceCall(ownerService, { environment: "test", rtc: { iceServers: [{ urls: "stun:local" }], disconnectedGraceMs: 1 } }, ownerAudio, fakeOptions());
    const guest = new VoiceCall(guestService, { environment: "test", rtc: { iceServers: [{ urls: "stun:local" }], disconnectedGraceMs: 1 } }, guestAudio, fakeOptions());
    return {
        db,
        owner,
        guest,
        ownerAudio,
        guestAudio,
        destroy() {
            owner.destroy();
            guest.destroy();
        }
    };
}

function fakeOptions() {
    return {
        RTCPeerConnection: FakePeerConnection,
        RTCSessionDescription: class RTCSessionDescription {
            constructor(description) { Object.assign(this, description); }
        },
        RTCIceCandidate: class RTCIceCandidate {
            constructor(candidate) { Object.assign(this, candidate); }
        },
        MediaStream: FakeMediaStream,
        getUserMedia: async () => new FakeMediaStream([makeTrack()])
    };
}

function makeRoomService({ role, uid, db, roomCode }) {
    return {
        role,
        uid,
        roomCode,
        firebase: {
            db,
            serverTimestamp: () => Date.now(),
            auth: { currentUser: { getIdToken: async () => "token" } }
        },
        roomRef() { return `rooms/${roomCode}`; },
        async updateParticipant(patch) {
            db.participantUpdates.push({ uid, patch });
        }
    };
}

function twoParticipantRoom() {
    return {
        participants: {
            owner: { role: "owner", micEnabled: false },
            guest: { role: "guest", micEnabled: false }
        }
    };
}

class FakeDb {
    constructor() {
        this.data = new Map();
        this.valueListeners = new Map();
        this.childListeners = new Map();
        this.writes = [];
        this.participantUpdates = [];
    }

    child(parent, path) {
        return `${parent}/${path}`;
    }

    async set(path, value) {
        this.writes.push({ op: "set", path, value });
        this.data.set(path, value);
        this.emitValue(path, value);
    }

    async remove(path) {
        this.writes.push({ op: "remove", path });
        for (const key of [...this.data.keys()]) {
            if (key === path || key.startsWith(`${path}/`)) this.data.delete(key);
        }
        this.emitValue(path, null);
    }

    async push(path, value) {
        const childPath = `${path}/${this.writes.length + 1}`;
        this.writes.push({ op: "push", path, childPath, value });
        this.data.set(childPath, value);
        for (const callback of this.childListeners.get(path) || []) callback({ val: () => value });
    }

    onValue(path, callback) {
        const listeners = this.valueListeners.get(path) || new Set();
        listeners.add(callback);
        this.valueListeners.set(path, listeners);
        callback({ val: () => this.data.get(path) ?? null });
        return () => listeners.delete(callback);
    }

    onChildAdded(path, callback) {
        const listeners = this.childListeners.get(path) || new Set();
        listeners.add(callback);
        this.childListeners.set(path, listeners);
        return () => listeners.delete(callback);
    }

    emitValue(path, value) {
        for (const callback of this.valueListeners.get(path) || []) callback({ val: () => value });
    }
}

class FakePeerConnection {
    constructor(config) {
        this.config = config;
        this.connectionState = "new";
        this.iceConnectionState = "new";
        this.iceGatheringState = "new";
        this.signalingState = "stable";
        this.transceivers = [];
        this.localDescription = null;
        this.remoteDescription = null;
        this.addedCandidates = [];
        this.restartIceCount = 0;
    }

    addTransceiver(kind, init) {
        const transceiver = { kind, direction: init.direction, sender: new FakeSender() };
        this.transceivers.push(transceiver);
        return transceiver;
    }

    getSenders() {
        return this.transceivers.map((transceiver) => transceiver.sender);
    }

    getTransceivers() {
        return this.transceivers;
    }

    async createOffer(options = {}) {
        return { type: "offer", sdp: options.iceRestart ? "v=0\r\na=ice-restart" : "v=0" };
    }

    async createAnswer() {
        return { type: "answer", sdp: "v=0" };
    }

    async setLocalDescription(description) {
        this.localDescription = description;
        this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
    }

    async setRemoteDescription(description) {
        this.remoteDescription = description;
        if (description.type === "offer" && !this.transceivers.length) {
            this.addTransceiver("audio", { direction: "sendrecv" });
        }
        this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
    }

    async addIceCandidate(candidate) {
        this.addedCandidates.push(candidate);
    }

    restartIce() {
        this.restartIceCount += 1;
    }

    async getStats() {
        return new Map();
    }

    close() {
        this.connectionState = "closed";
        this.signalingState = "closed";
    }
}

class FakeSender {
    constructor() {
        this.track = null;
        this.replacements = [];
    }

    async replaceTrack(track) {
        this.track = track;
        this.replacements.push(track);
    }
}

class FakeMediaStream {
    constructor(tracks = []) {
        this.tracks = [...tracks];
    }

    getTracks() {
        return this.tracks;
    }

    getAudioTracks() {
        return this.tracks;
    }

    addTrack(track) {
        this.tracks.push(track);
    }
}

function makeTrack() {
    return {
        kind: "audio",
        enabled: true,
        readyState: "live",
        stop() {
            this.readyState = "ended";
        }
    };
}

function makeAudioElement({ rejectOnce = false } = {}) {
    return {
        srcObject: null,
        paused: true,
        muted: false,
        volume: 1,
        playCalls: 0,
        async play() {
            this.playCalls += 1;
            if (rejectOnce && this.playCalls === 1) {
                throw new DOMException("blocked", "NotAllowedError");
            }
            this.paused = false;
        }
    };
}

function tick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
