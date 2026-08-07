import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { get, push, ref, remove, set, update } from "firebase/database";

const PROJECT_ID = "demo-freemovieir";
const ROOM = "ABCDEFGH";
const GENERATION = "owner-voice-generation";
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

test("guest cannot delete or end room, owner can end room", async () => {
    await seedRoom();
    await set(ref(db("guest1"), `rooms/${ROOM}/guestUid`), "guest1");
    await assertFails(remove(ref(db("guest1"), `rooms/${ROOM}`)));
    await assertFails(update(ref(db("guest1"), `rooms/${ROOM}`), { status: "ended", endedAt: now, endedBy: "guest1" }));
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/status`), "ended"));
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/endedAt`), now));
    await assertSucceeds(set(ref(db("owner"), `rooms/${ROOM}/endedBy`), "owner"));
});

test("invalid room status and invalid room code are rejected", async () => {
    await seedRoom();
    await assertFails(update(ref(db("owner"), `rooms/${ROOM}`), { status: "bad" }));
    await assertFails(set(ref(db("owner"), "rooms/ABCDEFGO"), roomData("owner")));
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
