import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";

const PROJECT_ID = "demo-freemovieir-public-rules";
const ROOM = "ABCDEFGHJKL";
const now = Date.now();
let testEnv;

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

test("public directory is authenticated-readable, client-write denied, and contains no media URL", async () => {
    await seedPublicRoom();
    const snap = await assertSucceeds(get(ref(db("viewer"), `publicRoomDirectory/${ROOM}`)));
    assert.equal("media" in snap.val(), false);
    await assertFails(get(ref(db(), `publicRoomDirectory/${ROOM}`)));
    await assertFails(set(ref(db("viewer"), `publicRoomDirectory/${ROOM}/memberCount`), 2));
});

test("public sensitive room data is member-only", async () => {
    await seedPublicRoom();
    await assertFails(get(ref(db(), `publicRooms/${ROOM}`)));
    await assertFails(get(ref(db("outsider"), `publicRooms/${ROOM}`)));
    await assertSucceeds(get(ref(db("host"), `publicRooms/${ROOM}`)));
    await assertSucceeds(get(ref(db("guest1"), `publicRooms/${ROOM}`)));
});

test("public host controls playback, media and settings; guest cannot", async () => {
    await seedPublicRoom();
    await assertSucceeds(update(ref(db("host"), `publicRooms/${ROOM}/playback`), {
        paused: false,
        currentTime: 12,
        playbackRate: 1,
        revision: 2,
        action: "play",
        updatedAt: now,
        updatedBy: "host"
    }));
    await assertFails(update(ref(db("guest1"), `publicRooms/${ROOM}/playback`), {
        paused: true,
        currentTime: 12,
        playbackRate: 1,
        revision: 3,
        action: "pause",
        updatedAt: now,
        updatedBy: "guest1"
    }));
    await assertSucceeds(update(ref(db("host"), `publicRooms/${ROOM}/media`), {
        url: "https://example.com/next.mp4",
        type: "direct",
        updatedAt: now,
        updatedBy: "host"
    }));
    await assertFails(update(ref(db("guest1"), `publicRooms/${ROOM}/media`), {
        url: "https://example.com/guest.mp4",
        type: "direct",
        updatedAt: now,
        updatedBy: "guest1"
    }));
    await assertSucceeds(update(ref(db("host"), `publicRooms/${ROOM}/settings`), { chatEnabled: false, reactionsEnabled: false, slowModeMs: 5000 }));
    await assertFails(update(ref(db("host"), `publicRooms/${ROOM}/settings`), { slowModeMs: 7000 }));
    await assertFails(update(ref(db("guest1"), `publicRooms/${ROOM}/settings`), { slowModeMs: 0 }));
});

test("public guest can update only own presence fields", async () => {
    await seedPublicRoom();
    await assertSucceeds(update(ref(db("guest1"), `publicRooms/${ROOM}/members/guest1`), {
        displayName: "Guest",
        role: "guest",
        online: false,
        joinedAt: now,
        lastSeen: now + 1
    }));
    await assertFails(update(ref(db("guest1"), `publicRooms/${ROOM}/members/host`), {
        displayName: "Host",
        role: "host",
        online: false,
        joinedAt: now,
        lastSeen: now + 1
    }));
    await assertFails(update(ref(db("guest1"), `publicRooms/${ROOM}/members/guest1`), { role: "host" }));
});

test("public clients cannot write lifecycle, bans, chat, reactions, host index, or undefined paths", async () => {
    await seedPublicRoom();
    await assertFails(update(ref(db("host"), `publicRooms/${ROOM}`), { status: "locked" }));
    await assertFails(set(ref(db("host"), `publicRooms/${ROOM}/bans/guest1`), true));
    await assertFails(set(ref(db("guest1"), `publicRooms/${ROOM}/chat/message1`), { text: "hello" }));
    await assertFails(set(ref(db("guest1"), `publicRooms/${ROOM}/reactions/reaction1`), { uid: "guest1", emoji: "🍿", createdAt: now }));
    await assertFails(get(ref(db("host"), `publicRoomHostIndex/host`)));
    await assertFails(set(ref(db("host"), "publicRoomRateLimits/create/host"), { count: 1, expiresAt: now + 1000 }));
    await assertFails(set(ref(db("host"), `publicRoomEphemeral/${ROOM}/chatBurst/host`), { count: 1, expiresAt: now + 1000 }));
    await assertFails(set(ref(db("host"), `publicRooms/${ROOM}/voice/signaling`), true));
});

test("public member notices are readable only by the targeted user and never client-writable", async () => {
    await seedPublicRoom();
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), `publicRoomMemberNotices/${ROOM}/guest1`), {
            type: "kicked",
            createdAt: now
        });
    });
    await assertSucceeds(get(ref(db("guest1"), `publicRoomMemberNotices/${ROOM}/guest1`)));
    await assertFails(get(ref(db("guest2"), `publicRoomMemberNotices/${ROOM}/guest1`)));
    await assertFails(set(ref(db("guest1"), `publicRoomMemberNotices/${ROOM}/guest1`), {
        type: "kicked",
        createdAt: now
    }));
});


function db(uid) {
    return uid ? testEnv.authenticatedContext(uid).database() : testEnv.unauthenticatedContext().database();
}

async function seedPublicRoom() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.database();
        await set(ref(adminDb, `publicRooms/${ROOM}`), {
            schemaVersion: 1,
            hostUid: "host",
            roomName: "Cinema",
            movieTitle: "Movie",
            language: "فارسی",
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
                host: member("Host", "host"),
                guest1: member("Guest", "guest")
            },
            bans: null,
            chat: null,
            reactions: null
        });
        await set(ref(adminDb, `publicRoomDirectory/${ROOM}`), {
            schemaVersion: 1,
            roomName: "Cinema",
            movieTitle: "Movie",
            hostDisplayName: "Host",
            memberCount: 2,
            capacity: 7,
            createdAt: now,
            status: "open",
            language: "فارسی",
            joinable: true,
            chatEnabled: false,
            reactionsEnabled: false,
            playbackPaused: true,
            deleteAt: now + 12 * 60 * 60 * 1000
        });
        await set(ref(adminDb, "publicRoomHostIndex/host"), {
            roomId: ROOM,
            createdAt: now,
            deleteAt: now + 12 * 60 * 60 * 1000
        });
    });
}

function member(displayName, role) {
    return {
        displayName,
        role,
        online: true,
        joinedAt: now,
        lastSeen: now
    };
}
