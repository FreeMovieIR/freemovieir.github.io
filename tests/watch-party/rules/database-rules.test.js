import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { equalTo, get, orderByChild, push, query, ref, remove, set, update } from "firebase/database";

const PROJECT_ID = "demo-freemovieir";
const ROOM = "ABCDEFGH";
const PUBLIC_ROOM = "ABCDEFGHJKL";
const MEDIA_GATEWAY_JOB = "a".repeat(64);
const GENERATION = "owner-voice-generation";
const VOICE_V2_SESSION = "v2-owner-session";
const now = Date.now();

let testEnv;

function roomData(ownerUid = "owner") {
    return {
        schemaVersion: 1,
        ownerUid,
        guestUid: null,
        status: "open",
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
        deleteAt: now + 60 * 60 * 1000,
        settings: {
            allowBothControls: true,
            autoPauseOnBuffer: true
        },
        media: {
            url: "https://example.com/movie.mp4",
            type: "direct",
            audioTrackId: null,
            updatedAt: now,
            updatedBy: ownerUid
        },
        subtitle: {
            mode: "none",
            updatedAt: now,
            updatedBy: ownerUid
        },
        playback: {
            paused: true,
            pauseReason: "manual",
            currentTime: 0,
            playbackRate: 1,
            revision: 1,
            action: "create",
            updatedAt: now,
            updatedBy: ownerUid
        },
        participants: {
            [ownerUid]: participant(ownerUid, "owner")
        }
    };
}

function participant(uid, role) {
    return {
        displayName: uid,
        role,
        online: true,
        ready: false,
        buffering: false,
        micEnabled: false,
        chatReadAt: now,
        joinedAt: now,
        lastSeen: now,
        connectionState: "متصل"
    };
}

function db(uid) {
    return uid ? testEnv.authenticatedContext(uid).database() : testEnv.unauthenticatedContext().database();
}

async function seedRoom(code = ROOM) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), `rooms/${code}`), roomData("owner"));
    });
}

async function seedPublicDirectory() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.database();
        await set(ref(adminDb, `publicRooms/${PUBLIC_ROOM}`), {
            schemaVersion: 1,
            hostUid: "host",
            roomName: "Cinema",
            movieTitle: "Movie",
            language: "fa",
            capacity: 7,
            createdAt: now,
            expiresAt: now + 12 * 60 * 60 * 1000,
            deleteAt: now + 12 * 60 * 60 * 1000,
            status: "open",
            settings: {
                chatEnabled: false,
                reactionsEnabled: false,
                slowModeMs: 0
            },
            media: {
                url: "https://example.com/movie.mp4",
                type: "direct",
                updatedAt: now,
                updatedBy: "host"
            },
            playback: {
                paused: true,
                currentTime: 0,
                playbackRate: 1,
                revision: 1,
                action: "create",
                updatedAt: now,
                updatedBy: "host"
            },
            members: {
                host: {
                    displayName: "Host",
                    role: "host",
                    online: true,
                    joinedAt: now,
                    lastSeen: now
                }
            }
        });
        await set(ref(adminDb, `publicRoomDirectory/${PUBLIC_ROOM}`), {
            schemaVersion: 1,
            roomName: "Cinema",
            movieTitle: "Movie",
            hostDisplayName: "Host",
            memberCount: 1,
            capacity: 7,
            createdAt: now,
            status: "open",
            language: "fa",
            joinable: true,
            chatEnabled: false,
            reactionsEnabled: false,
            playbackPaused: true,
            deleteAt: now + 12 * 60 * 60 * 1000
        });
    });
}

async function seedMediaGatewayJobs() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.database();
        await set(ref(adminDb, `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`), mediaGatewayJob({
            requestedBy: "viewer",
            requesters: {
                viewer: { uid: "viewer", createdAt: now, lastSeenAt: now },
                partner: { uid: "partner", createdAt: now, lastSeenAt: now }
            }
        }));
        await set(ref(adminDb, `mediaGatewayJobs/${"b".repeat(64)}`), mediaGatewayJob({
            requestedBy: "other",
            requesters: {
                other: { uid: "other", createdAt: now, lastSeenAt: now }
            },
            expiresAt: now + 2 * 60 * 60 * 1000
        }));
    });
}

function mediaGatewayJob(overrides = {}) {
    return {
        schemaVersion: 2,
        jobKey: MEDIA_GATEWAY_JOB,
        jobId: MEDIA_GATEWAY_JOB,
        sourceHash: "source-hash",
        profileHash: "profile-hash",
        status: "queued",
        stage: "queued",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 60 * 60 * 1000,
        requestedBy: "viewer",
        requesters: {
            viewer: { uid: "viewer", createdAt: now, lastSeenAt: now }
        },
        executionName: "",
        outputPrefix: `jobs/${MEDIA_GATEWAY_JOB}/`,
        source: { encryptedOrPrivateUrl: "https://example.com/movie.mkv" },
        deviceProfile: { browserFamily: "safari" },
        probe: null,
        conversion: { policy: null, progress: null },
        playback: { available: false, manifestObject: "" },
        lease: null,
        error: null,
        ...overrides
    };
}

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: {
            host: "127.0.0.1",
            port: 9000,
            rules: readFileSync("firebase/database.rules.json", "utf8")
        }
    });
});

beforeEach(async () => {
    await testEnv.clearDatabase();
});

after(async () => {
    await testEnv.cleanup();
});

test("unauthenticated users cannot read or write room data", async () => {
    await seedRoom();
    await assertFails(get(ref(db(), `rooms/${ROOM}`)));
    await assertFails(set(ref(db(), `rooms/${ROOM}`), roomData("anon")));
});

test("only Media Gateway service override UIDs can access mediaGatewayJobs", async () => {
    const job = {
        status: "queued",
        stage: "queued",
        expiresAt: now + 60 * 60 * 1000,
        requestedBy: "viewer"
    };
    await assertFails(get(ref(db(), "mediaGatewayJobs")));
    await assertFails(set(ref(db(), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`), job));
    await assertFails(get(ref(db("viewer"), "mediaGatewayJobs")));
    await assertFails(set(ref(db("viewer"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`), job));
    await assertSucceeds(set(ref(db("media-gateway-api"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`), job));
    await assertSucceeds(get(ref(db("media-gateway-api"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`)));
    await assertSucceeds(update(ref(db("media-gateway-worker"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`), {
        status: "processing",
        updatedAt: now
    }));
    await assertSucceeds(get(ref(db("media-gateway-worker"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`)));
    await assertFails(set(ref(db("media-gateway-api"), "mediaGatewayJobs/not-a-valid-key"), job));
});

test("Media Gateway service UIDs can direct-read jobs while normal users cannot", async () => {
    await seedMediaGatewayJobs();
    await assertSucceeds(get(ref(db("media-gateway-api"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`)));
    await assertSucceeds(get(ref(db("media-gateway-worker"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`)));
    await assertFails(get(ref(db("viewer"), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`)));
    await assertFails(get(ref(db(), `mediaGatewayJobs/${MEDIA_GATEWAY_JOB}`)));
});

test("Media Gateway API UID can perform supported production rate-limit collection queries", async () => {
    await seedMediaGatewayJobs();
    const apiDb = db("media-gateway-api");
    await assert.rejects(() => get(query(
        ref(apiDb, "mediaGatewayJobs"),
        orderByChild("requesters/viewer/uid"),
        equalTo("viewer")
    )), /Index not defined/);
    await assertSucceeds(get(query(
        ref(apiDb, "mediaGatewayJobs"),
        orderByChild("requestedBy"),
        equalTo("viewer")
    )));
    await assertSucceeds(get(ref(apiDb, "mediaGatewayJobs")));
});

test("Media Gateway worker UID can read collection data required for worker cleanup only", async () => {
    await seedMediaGatewayJobs();
    const workerDb = db("media-gateway-worker");
    await assertSucceeds(get(ref(workerDb, "mediaGatewayJobs")));
    await assertSucceeds(get(query(
        ref(workerDb, "mediaGatewayJobs"),
        orderByChild("expiresAt"),
        equalTo(now + 60 * 60 * 1000)
    )));
    await assertFails(get(ref(db("viewer"), "mediaGatewayJobs")));
});

test("Media Gateway service UIDs cannot access private or public Watch Party namespaces", async () => {
    await seedRoom();
    await seedPublicDirectory();
    for (const uid of ["media-gateway-api", "media-gateway-worker"]) {
        await assertFails(get(ref(db(uid), `rooms/${ROOM}`)));
        await assertFails(get(ref(db(uid), `rooms/${ROOM}/ownerUid`)));
        await assertFails(get(ref(db(uid), `rooms/${ROOM}/status`)));
        await assertFails(update(ref(db(uid), `rooms/${ROOM}/playback`), {
            paused: false,
            currentTime: 1,
            playbackRate: 1,
            revision: 2,
            action: "play",
            updatedAt: now,
            updatedBy: uid
        }));
        await assertFails(get(ref(db(uid), `publicRooms/${PUBLIC_ROOM}`)));
        await assertFails(get(ref(db(uid), `publicRoomDirectory/${PUBLIC_ROOM}`)));
    }
});

test("authenticated owner can create a valid room and owner UID cannot change", async () => {
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}`), roomData("owner")));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}`), { ownerUid: "other" }));
});

test("valid guest can claim empty slot, but second guest cannot overwrite it", async () => {
    await seedRoom();
    await assertSucceeds(set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1"));
    await assertFails(set(ref(db("guest2"), `rooms/${ROOM}/guestUid`), "guest2"));
});

test("third participant cannot enter and guest cannot become owner", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await assertSucceeds(set(ref(db("guest1"), `rooms/${ROOM}/participants/guest1`), participant("guest1", "guest")));
    await assertFails(set(ref(db("third"), `rooms/${ROOM}/participants/third`), participant("third", "guest")));
    await assertFails(update(ref(db("guest1"), `rooms/${ROOM}`), { ownerUid: "guest1" }));
});

test("participants can update only their own presence state", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await set(ref(db("guest1"), `rooms/${ROOM}/participants/guest1`), participant("guest1", "guest"));
    await assertSucceeds(update(ref(db("guest1"), `rooms/${ROOM}/participants/guest1`), { online: false, lastSeen: now + 1 }));
    await assertFails(update(ref(db("guest1"), `rooms/${ROOM}/participants/owner`), { online: false, lastSeen: now + 1 }));
});

test("participants can update only their own chat read watermark", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await set(ref(db("guest1"), `rooms/${ROOM}/participants/guest1`), participant("guest1", "guest"));
    await assertSucceeds(update(ref(db("guest1"), `rooms/${ROOM}/participants/guest1`), { chatReadAt: now + 5, lastSeen: now + 5 }));
    await assertFails(update(ref(db("guest1"), `rooms/${ROOM}/participants/owner`), { chatReadAt: now + 6, lastSeen: now + 6 }));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/participants/guest1`), { chatReadAt: now + 7, ready: false, buffering: false, lastSeen: now + 7 }));
});

test("guest cannot delete room, owner can hard-delete complete room", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await assertFails(remove(ref(db("guest1"), `rooms/${ROOM}`)));
    await assertFails(update(ref(db("guest1"), `rooms/${ROOM}`), { status: "ended", endedAt: now, endedBy: "guest1" }));
    await assertSucceeds(remove(ref(db("owner"), `rooms/${ROOM}`)));
    const deleted = await get(ref(db("owner"), `rooms/${ROOM}`));
    assert.equal(deleted.exists(), false);
});

test("invalid room status and invalid room code are rejected", async () => {
    await seedRoom();
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}`), { status: "bad" }));
    await assertFails(set(ref(db("owner"), "rooms/ABCDEFGO"), roomData("owner")));
    const farFuture = roomData("owner");
    farFuture.deleteAt = farFuture.createdAt + 43200000 + 60001;
    await assertFails(set(ref(db("owner"), "rooms/BCDEFGHJ"), farFuture));
});

test("oversized display names and chat messages are rejected", async () => {
    await seedRoom();
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/participants/owner`), { displayName: "x".repeat(33) }));
    await assertFails(push(ref(db("owner"), `rooms/${ROOM}/chat`), {
        uid: "owner",
        displayName: "owner",
        text: "x".repeat(501),
        createdAt: now
    }));
});

test("unauthorized users cannot read chat or write chat/signaling data", async () => {
    await seedRoom();
    await assertFails(get(ref(db("third"), `rooms/${ROOM}/chat`)));
    await assertFails(push(ref(db("third"), `rooms/${ROOM}/chat`), {
        uid: "third",
        displayName: "third",
        text: "hello",
        createdAt: now
    }));
    await assertFails(set(ref(db("third"), `rooms/${ROOM}/signaling/offer`), {
        generationId: GENERATION,
        type: "offer",
        sdp: "v=0",
        uid: "third",
        createdAt: now
    }));
});

test("owner and guest signaling writes are restricted to expected roles", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/signaling/generationId`), GENERATION));
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/signaling/offer`), {
        generationId: GENERATION,
        type: "offer",
        sdp: "v=0",
        uid: "owner",
        createdAt: now
    }));
    await assertFails(set(ref(db("guest1"), `rooms/${ROOM}/signaling/offer`), {
        generationId: GENERATION,
        type: "offer",
        sdp: "v=0",
        uid: "guest1",
        createdAt: now
    }));
    await assertSucceeds(set(ref(db("guest1"), `rooms/${ROOM}/signaling/answer`), {
        generationId: GENERATION,
        type: "answer",
        sdp: "v=0",
        uid: "guest1",
        createdAt: now
    }));
    await assertFails(push(ref(db("owner"), `rooms/${ROOM}/signaling/guestCandidates`), {
        generationId: GENERATION,
        candidate: "candidate",
        uid: "owner",
        createdAt: now
    }));
    await assertSucceeds(push(ref(db("owner"), `rooms/${ROOM}/signaling/hostCandidates`), {
        generationId: GENERATION,
        candidate: "candidate",
        sdpMid: "0",
        sdpMLineIndex: 0,
        uid: "owner",
        createdAt: now
    }));
    await assertFails(set(ref(db("guest1"), `rooms/${ROOM}/signaling/answer`), {
        generationId: "stale-generation",
        type: "answer",
        sdp: "v=0",
        uid: "guest1",
        createdAt: now
    }));
    await assertFails(push(ref(db("guest1"), `rooms/${ROOM}/signaling/guestCandidates`), {
        generationId: "stale-generation",
        candidate: "candidate",
        uid: "guest1",
        createdAt: now
    }));
});

test("owner and guest voiceV2 signaling writes are restricted to expected roles", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/sessionId`), VOICE_V2_SESSION));
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/createdAt`), now));
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/offer`), {
        sessionId: VOICE_V2_SESSION,
        type: "offer",
        sdp: "v=0",
        uid: "owner",
        createdAt: now
    }));
    await assertFails(set(ref(db("guest1"), `rooms/${ROOM}/voiceV2/offer`), {
        sessionId: VOICE_V2_SESSION,
        type: "offer",
        sdp: "v=0",
        uid: "guest1",
        createdAt: now
    }));
    await assertSucceeds(set(ref(db("guest1"), `rooms/${ROOM}/voiceV2/answer`), {
        sessionId: VOICE_V2_SESSION,
        type: "answer",
        sdp: "v=0",
        uid: "guest1",
        createdAt: now
    }));
    await assertFails(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/answer`), {
        sessionId: VOICE_V2_SESSION,
        type: "answer",
        sdp: "v=0",
        uid: "owner",
        createdAt: now
    }));
    await assertSucceeds(push(ref(db("owner"), `rooms/${ROOM}/voiceV2/hostCandidates`), {
        sessionId: VOICE_V2_SESSION,
        candidate: "candidate",
        sdpMid: "0",
        sdpMLineIndex: 0,
        uid: "owner",
        createdAt: now
    }));
    await assertSucceeds(push(ref(db("guest1"), `rooms/${ROOM}/voiceV2/guestCandidates`), {
        sessionId: VOICE_V2_SESSION,
        candidate: "candidate",
        sdpMid: "0",
        sdpMLineIndex: 0,
        uid: "guest1",
        createdAt: now
    }));
    await assertFails(push(ref(db("guest1"), `rooms/${ROOM}/voiceV2/hostCandidates`), {
        sessionId: VOICE_V2_SESSION,
        candidate: "candidate",
        uid: "guest1",
        createdAt: now
    }));
    await assertFails(push(ref(db("owner"), `rooms/${ROOM}/voiceV2/guestCandidates`), {
        sessionId: VOICE_V2_SESSION,
        candidate: "candidate",
        uid: "owner",
        createdAt: now
    }));
});

test("voiceV2 rejects stale sessions, oversized payloads, unauthorized users, and unknown children", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await set(ref(db("owner"), `rooms/${ROOM}/voiceV2/sessionId`), VOICE_V2_SESSION);
    await set(ref(db("owner"), `rooms/${ROOM}/voiceV2/createdAt`), now);
    await assertFails(set(ref(db("third"), `rooms/${ROOM}/voiceV2/offer`), {
        sessionId: VOICE_V2_SESSION,
        type: "offer",
        sdp: "v=0",
        uid: "third",
        createdAt: now
    }));
    await assertFails(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/sessionId`), "x".repeat(81)));
    await assertFails(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/offer`), {
        sessionId: "old-session",
        type: "offer",
        sdp: "v=0",
        uid: "owner",
        createdAt: now
    }));
    await assertFails(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/offer`), {
        sessionId: VOICE_V2_SESSION,
        type: "offer",
        sdp: "x".repeat(12000),
        uid: "owner",
        createdAt: now
    }));
    await assertFails(push(ref(db("owner"), `rooms/${ROOM}/voiceV2/hostCandidates`), {
        sessionId: VOICE_V2_SESSION,
        candidate: "x".repeat(2000),
        uid: "owner",
        createdAt: now
    }));
    await assertFails(set(ref(db("owner"), `rooms/${ROOM}/voiceV2/debug`), true));
});

test("oversized subtitles and URLs are rejected", async () => {
    await seedRoom();
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/subtitle`), {
        mode: "inline",
        format: "vtt",
        content: `WEBVTT\n${"x".repeat(307201)}`,
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        url: `https://example.com/${"x".repeat(1901)}.mp4`,
        type: "direct",
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/subtitle`), {
        mode: "url",
        format: "vtt",
        url: `https://example.com/${"x".repeat(1901)}.vtt`,
        updatedAt: now,
        updatedBy: "owner"
    }));
});

test("loopback HTTP media and subtitle URLs are allowed for local emulator testing", async () => {
    await seedRoom();
    await assertSucceeds(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        url: "http://127.0.0.1:8080/test-assets/sample.mp4",
        type: "direct",
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertSucceeds(update(ref(db("owner"), `rooms/${ROOM}/subtitle`), {
        mode: "url",
        format: "vtt",
        url: "http://localhost:8080/test-assets/sample.vtt",
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        url: "http://example.com/movie.mp4",
        type: "direct",
        updatedAt: now,
        updatedBy: "owner"
    }));
});

test("primary media URL changes are owner-only while guest playback control remains allowed", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await set(ref(db("guest1"), `rooms/${ROOM}/participants/guest1`), participant("guest1", "guest"));
    await assertFails(update(ref(db("guest1"), `rooms/${ROOM}/media`), {
        url: "https://example.com/guest-change.mp4",
        type: "direct",
        updatedAt: now,
        updatedBy: "guest1"
    }));
    await assertSucceeds(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        url: "https://example.com/owner-change.mp4",
        type: "direct",
        audioTrackId: null,
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertSucceeds(update(ref(db("guest1"), `rooms/${ROOM}/playback`), {
        paused: false,
        pauseReason: "playing",
        currentTime: 4,
        playbackRate: 1,
        revision: 2,
        action: "play",
        updatedAt: now,
        updatedBy: "guest1"
    }));
});

test("shared audio track selection is bounded and participant-only", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await assertSucceeds(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        audioTrackId: "2",
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertSucceeds(update(ref(db("guest1"), `rooms/${ROOM}/media`), {
        audioTrackId: null,
        updatedAt: now,
        updatedBy: "guest1"
    }));
    await assertFails(update(ref(db("third"), `rooms/${ROOM}/media`), {
        audioTrackId: "3",
        updatedAt: now,
        updatedBy: "third"
    }));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        audioTrackId: "x".repeat(65),
        updatedAt: now,
        updatedBy: "owner"
    }));
});

test("media compatibility fields are optional, bounded, and participant-only", async () => {
    await seedRoom();
    await assertSucceeds(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        playbackMode: "gateway-hls",
        compatibilityJobId: "job_ABC123",
        compatibilityManifestUrl: "https://gateway.example.test/jobs/job_ABC123/index.m3u8",
        compatibilityExpiresAt: now + 600000,
        originalContainer: "matroska",
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        playbackMode: "bad-mode",
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}/media`), {
        compatibilityManifestUrl: "http://gateway.example.test/index.m3u8",
        updatedAt: now,
        updatedBy: "owner"
    }));
    await assertFails(update(ref(db("third"), `rooms/${ROOM}/media`), {
        playbackMode: "gateway-hls",
        updatedAt: now,
        updatedBy: "third"
    }));
});

test("undefined paths are denied by default", async () => {
    await seedRoom();
    await assertFails(set(ref(db("owner"), `rooms/${ROOM}/unexpected`), true));
});
