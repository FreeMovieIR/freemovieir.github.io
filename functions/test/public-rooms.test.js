import assert from "node:assert/strict";
import { test } from "node:test";
import {
    PUBLIC_CHAT_BURST_MAX,
    PUBLIC_CHAT_BURST_WINDOW_MS,
    PUBLIC_CHAT_MAX_MESSAGES,
    PUBLIC_CREATE_RATE_LIMIT_MAX,
    PUBLIC_CREATE_RATE_LIMIT_WINDOW_MS,
    PUBLIC_JOIN_RATE_LIMIT_MAX,
    PUBLIC_REACTION_MAX_ITEMS,
    PUBLIC_REACTION_RETENTION_MS,
    buildPublicDirectoryEntry,
    cleanupPublicRooms,
    reconcilePublicRoomMemberCount,
    makePublicRoomHandlers,
    PublicRoomCommandError,
    safePublicRoomLog
} from "../src/public-room-core.js";

test("createPublicRoom creates private room, safe directory, first host member, and host index", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    const result = await handlers.createPublicRoom({
        displayName: "Host",
        roomName: "Cinema",
        movieTitle: "Movie",
        mediaUrl: "http://127.0.0.1:8080/test-assets/sample.mp4",
        capacity: 7,
        language: "فارسی"
    }, { uid: "host" });
    assert.equal(result.roomId, "ABCDEFGHJKL");
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.hostUid, "host");
    assert.equal(Object.keys(db.data.publicRooms.ABCDEFGHJKL.members).length, 1);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 1);
    assert.equal("media" in db.data.publicRoomDirectory.ABCDEFGHJKL, false);
    assert.equal(db.data.publicRoomHostIndex.host.roomId, "ABCDEFGHJKL");
    const duplicate = await handlers.createPublicRoom({
        displayName: "Host",
        roomName: "Second",
        movieTitle: "Movie",
        mediaUrl: "http://127.0.0.1:8080/test-assets/sample.mp4",
        capacity: 7,
        language: "فارسی"
    }, { uid: "host" });
    assert.deepEqual(duplicate, { roomId: "ABCDEFGHJKL", reused: true });
    assert.equal(Object.keys(db.data.publicRooms).length, 1);
});

test("createPublicRoom validates capacity and production media URLs", async () => {
    const handlers = makePublicRoomHandlers({ db: new FakeDb(), now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: true });
    await assert.rejects(() => handlers.createPublicRoom(validCreate({ capacity: 8 }), { uid: "host" }), PublicRoomCommandError);
    await assert.rejects(() => handlers.createPublicRoom(validCreate({ mediaUrl: "http://example.com/movie.mp4" }), { uid: "host" }), PublicRoomCommandError);
});

test("host can replace public room movie while guest cannot and directory remains safe", async () => {
    let clock = 1000;
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => clock, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ movieTitle: "Movie One" }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    await assert.rejects(() => handlers.updatePublicRoomMedia({
        roomId: "ABCDEFGHJKL",
        movieTitle: "Guest Movie",
        mediaUrl: "http://127.0.0.1:8080/test-assets/guest.mp4"
    }, { uid: "guest1" }), /PUBLIC-ROOM-NOT-AUTHORIZED/);
    clock = 2000;
    const result = await handlers.updatePublicRoomMedia({
        roomId: "ABCDEFGHJKL",
        movieTitle: "Movie Two",
        mediaUrl: "http://127.0.0.1:8080/test-assets/second.mp4"
    }, { uid: "host" });
    assert.deepEqual(result, { updated: true, movieTitle: "Movie Two" });
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.movieTitle, "Movie Two");
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.media.url, "http://127.0.0.1:8080/test-assets/second.mp4");
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.playback.paused, true);
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.playback.currentTime, 0);
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.playback.action, "media");
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.movieTitle, "Movie Two");
    assert.equal("media" in db.data.publicRoomDirectory.ABCDEFGHJKL, false);
});

test("joinPublicRoom increments count, enforces capacity, lock, ban, and concurrent joins", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 2 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 2);
    await assert.rejects(() => handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest 2" }, { uid: "guest2" }), /PUBLIC-ROOM-FULL/);

    await handlers.endPublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "host" });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await Promise.all(Array.from({ length: 8 }, (_, index) => (
        handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: `Guest ${index}` }, { uid: `guest${index}` }).catch((error) => error)
    )));
    assert.equal(Object.keys(db.data.publicRooms.ABCDEFGHJKL.members).length, 7);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 7);

    await handlers.setPublicRoomLock({ roomId: "ABCDEFGHJKL", locked: true }, { uid: "host" });
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.joinable, false);
    await assert.rejects(() => handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Late" }, { uid: "late" }), /PUBLIC-ROOM-LOCKED|PUBLIC-ROOM-FULL/);
});

test("leave, kick, ban, and end update membership and hard-delete ephemeral state", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    await assert.rejects(() => handlers.leavePublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "host" }), /host-cannot-leave/);
    await handlers.leavePublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "guest1" });
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 1);
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    await assert.rejects(() => handlers.kickPublicRoomMember({ roomId: "ABCDEFGHJKL", uid: "host" }, { uid: "host" }), /host-cannot-kick-self/);
    await handlers.kickPublicRoomMember({ roomId: "ABCDEFGHJKL", uid: "guest1" }, { uid: "host" });
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.bans.guest1, true);
    assert.equal(db.data.publicRoomMemberNotices.ABCDEFGHJKL.guest1.type, "kicked");
    await assert.rejects(() => handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" }), /PUBLIC-ROOM-BANNED/);
    await assert.rejects(() => handlers.endPublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "guest2" }), /PUBLIC-ROOM-NOT-AUTHORIZED/);
    await handlers.endPublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "host" });
    assert.equal(db.data.publicRooms?.ABCDEFGHJKL, undefined);
    assert.equal(db.data.publicRoomDirectory?.ABCDEFGHJKL, undefined);
    assert.equal(db.data.publicRoomHostIndex?.host, undefined);
    assert.equal(db.data.publicRoomMemberNotices?.ABCDEFGHJKL, undefined);
});

test("cleanup deletes expired or stale-host rooms and removes stale guests", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    db.data.publicRooms.ABCDEFGHJKL.members.guest1.online = false;
    db.data.publicRooms.ABCDEFGHJKL.members.guest1.lastSeen = 1;
    await cleanupPublicRooms({ db, now: 3 * 60 * 1000 });
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.members.guest1, undefined);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 1);
    db.data.publicRooms.ABCDEFGHJKL.members.host.online = false;
    db.data.publicRooms.ABCDEFGHJKL.members.host.lastSeen = 1;
    db.data.publicRoomMemberNotices = { ABCDEFGHJKL: { guest1: { type: "kicked", createdAt: 1000 } } };
    await cleanupPublicRooms({ db, now: 3 * 60 * 1000 });
    assert.equal(db.data.publicRooms?.ABCDEFGHJKL, undefined);
    assert.equal(db.data.publicRoomMemberNotices?.ABCDEFGHJKL, undefined);
});

test("public chat is server-authoritative, member-only, capped, and slow-mode protected", async () => {
    let clock = 1000;
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => clock, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    const first = await handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "hello", displayName: "Spoofed" }, { uid: "guest1" });
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.chat[first.messageId].displayName, "Guest");
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.chat[first.messageId].text, "hello");
    await assert.rejects(() => handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "too soon" }, { uid: "guest1" }), /PUBLIC-CHAT-SLOW-MODE/);
    await assert.rejects(() => handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "x" }, { uid: "outsider" }), /PUBLIC-ROOM-NOT-AUTHORIZED/);
    await assert.rejects(() => handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "x".repeat(501) }, { uid: "guest1" }), /PUBLIC-CHAT-TOO-LONG/);

    await handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", slowModeMs: 0 }, { uid: "host" });
    for (let index = 0; index < PUBLIC_CHAT_MAX_MESSAGES + 5; index += 1) {
        clock += PUBLIC_CHAT_BURST_WINDOW_MS;
        await handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: `message ${index}` }, { uid: "guest1" });
    }
    assert.equal(Object.keys(db.data.publicRooms.ABCDEFGHJKL.chat).length, PUBLIC_CHAT_MAX_MESSAGES);

    await handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", chatEnabled: false }, { uid: "host" });
    await assert.rejects(() => handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "blocked" }, { uid: "guest1" }), /PUBLIC-CHAT-DISABLED/);
});

test("host moderation deletes messages and guest moderation is rejected", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    await handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", slowModeMs: 0 }, { uid: "host" });
    const { messageId } = await handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "remove me" }, { uid: "guest1" });
    await assert.rejects(() => handlers.deletePublicRoomMessage({ roomId: "ABCDEFGHJKL", messageId }, { uid: "guest1" }), /PUBLIC-ROOM-NOT-AUTHORIZED/);
    await handlers.deletePublicRoomMessage({ roomId: "ABCDEFGHJKL", messageId }, { uid: "host" });
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.chat?.[messageId], undefined);
});

test("public reactions validate emoji, rate-limit members, omit display names, and prune transient data", async () => {
    let clock = 1000;
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => clock, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    const first = await handlers.sendPublicRoomReaction({ roomId: "ABCDEFGHJKL", emoji: "🍿" }, { uid: "guest1" });
    assert.equal("displayName" in db.data.publicRooms.ABCDEFGHJKL.reactions[first.reactionId], false);
    await assert.rejects(() => handlers.sendPublicRoomReaction({ roomId: "ABCDEFGHJKL", emoji: "🚀" }, { uid: "guest1" }), /PUBLIC-REACTION-INVALID/);
    await assert.rejects(() => handlers.sendPublicRoomReaction({ roomId: "ABCDEFGHJKL", emoji: "🍿" }, { uid: "guest1" }), /PUBLIC-REACTION-RATE-LIMIT/);
    await assert.rejects(() => handlers.sendPublicRoomReaction({ roomId: "ABCDEFGHJKL", emoji: "🍿" }, { uid: "outsider" }), /PUBLIC-ROOM-NOT-AUTHORIZED/);
    clock += 1000;
    for (let index = 0; index < PUBLIC_REACTION_MAX_ITEMS + 5; index += 1) {
        clock += 1000;
        await handlers.sendPublicRoomReaction({ roomId: "ABCDEFGHJKL", emoji: "😂" }, { uid: "guest1" });
    }
    assert.equal(Object.keys(db.data.publicRooms.ABCDEFGHJKL.reactions).length, PUBLIC_REACTION_MAX_ITEMS);
    await handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", reactionsEnabled: false }, { uid: "host" });
    clock += 1000;
    await assert.rejects(() => handlers.sendPublicRoomReaction({ roomId: "ABCDEFGHJKL", emoji: "🍿" }, { uid: "guest1" }), /PUBLIC-REACTIONS-DISABLED/);
});

test("host-only social settings validate slow mode and update safe directory flags", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    await assert.rejects(() => handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", chatEnabled: false }, { uid: "guest1" }), /PUBLIC-ROOM-NOT-AUTHORIZED/);
    await assert.rejects(() => handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", slowModeMs: 7000 }, { uid: "host" }), /slow-mode-invalid/);
    await handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", chatEnabled: false, reactionsEnabled: false, slowModeMs: 10000 }, { uid: "host" });
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.settings.chatEnabled, false);
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.settings.reactionsEnabled, false);
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.settings.slowModeMs, 10000);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.chatEnabled, false);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.reactionsEnabled, false);
});

test("cleanup prunes old transient reactions without deleting active rooms", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    db.data.publicRooms.ABCDEFGHJKL.reactions = {
        stale: { uid: "host", emoji: "🍿", createdAt: 1000 },
        fresh: { uid: "host", emoji: "🍿", createdAt: 1000 + PUBLIC_REACTION_RETENTION_MS }
    };
    await cleanupPublicRooms({ db, now: 1000 + PUBLIC_REACTION_RETENTION_MS + 1 });
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.reactions.stale, undefined);
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.reactions.fresh.emoji, "🍿");
});

test("public lifecycle commands are idempotent and keep member count derived", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest Again" }, { uid: "guest1" });
    assert.equal(Object.keys(db.data.publicRooms.ABCDEFGHJKL.members).length, 2);
    assert.equal(db.data.publicRooms.ABCDEFGHJKL.members.guest1.joinedAt, 1000);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 2);
    await handlers.setPublicRoomLock({ roomId: "ABCDEFGHJKL", locked: true }, { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest Locked Rejoin" }, { uid: "guest1" });
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 2);
    await handlers.setPublicRoomLock({ roomId: "ABCDEFGHJKL", locked: false }, { uid: "host" });
    await handlers.leavePublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "guest1" });
    await handlers.leavePublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "guest1" });
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 1);
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest2" });
    await handlers.kickPublicRoomMember({ roomId: "ABCDEFGHJKL", uid: "guest2" }, { uid: "host" });
    const secondKick = await handlers.kickPublicRoomMember({ roomId: "ABCDEFGHJKL", uid: "guest2" }, { uid: "host" });
    assert.equal(secondKick.kicked, false);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 1);
    await handlers.endPublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "host" });
    await handlers.endPublicRoom({ roomId: "ABCDEFGHJKL" }, { uid: "host" });
    assert.equal(db.data.publicRooms?.ABCDEFGHJKL, undefined);
});

test("memberCount reconciliation repairs corrupted directory state", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount = 7;
    db.data.publicRoomDirectory.ABCDEFGHJKL.joinable = false;
    const result = await reconcilePublicRoomMemberCount({ db, roomId: "ABCDEFGHJKL" });
    assert.equal(result.memberCount, 2);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 2);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.joinable, true);
});

test("concurrent join stress never oversubscribes capacity", async () => {
    for (const capacity of [2, 3, 7]) {
        const db = new FakeDb();
        const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
        await handlers.createPublicRoom(validCreate({ capacity }), { uid: "host" });
        const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (
            handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: `Guest ${index}` }, { uid: `guest${index}` })
                .then(() => "ok")
                .catch(() => "rejected")
        )));
        assert.equal(results.filter((value) => value === "ok").length, capacity - 1);
        assert.equal(Object.keys(db.data.publicRooms.ABCDEFGHJKL.members).length, capacity);
        assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, capacity);
    }
});

test("create rate limit is transient and active-room duplicate create is idempotent", async () => {
    let clock = 1000;
    let sequence = 0;
    const ids = ["ABCDEFGHJKL", "BCDEFGHJKLM", "CDEFGHJKLMN", "DEFGHJKLMNP"];
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => clock, idGenerator: () => ids[sequence++], production: false });
    for (let index = 0; index < PUBLIC_CREATE_RATE_LIMIT_MAX; index += 1) {
        const { roomId } = await handlers.createPublicRoom(validCreate(), { uid: "host" });
        await handlers.endPublicRoom({ roomId }, { uid: "host" });
        clock += 1;
    }
    await assert.rejects(() => handlers.createPublicRoom(validCreate(), { uid: "host" }), /PUBLIC-ROOM-RATE-LIMIT/);
    clock += PUBLIC_CREATE_RATE_LIMIT_WINDOW_MS;
    await handlers.createPublicRoom(validCreate(), { uid: "host" });
});

test("join rate limit blocks new join spam but permits rejoin", async () => {
    let clock = 1000;
    let sequence = 0;
    const ids = ["ABCDEFGHJKL", "BCDEFGHJKLM", "CDEFGHJKLMN", "DEFGHJKLMNP", "EFGHJKLMNPQ", "FGHJKLMNPQR", "GHJKLMNPQRS", "HJKLMNPQRST", "JKLMNPQRSTU", "KLMNPQRSTUV", "LMNPQRSTUVW", "MNPQRSTUVW2"];
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => clock, idGenerator: () => ids[sequence++], production: false });
    const created = [];
    for (let index = 0; index < PUBLIC_JOIN_RATE_LIMIT_MAX + 1; index += 1) {
        await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: `host${index}` });
        created.push(ids[index]);
    }
    for (let index = 0; index < PUBLIC_JOIN_RATE_LIMIT_MAX + 1; index += 1) {
        const promise = handlers.joinPublicRoom({ roomId: created[index], displayName: "Guest" }, { uid: "guest-rate" });
        if (index < PUBLIC_JOIN_RATE_LIMIT_MAX) await promise.catch(() => {});
        else await assert.rejects(() => promise, /PUBLIC-ROOM-RATE-LIMIT/);
        await handlers.leavePublicRoom({ roomId: created[index] }, { uid: "guest-rate" }).catch(() => {});
        clock += 1;
    }
    await handlers.joinPublicRoom({ roomId: created[0], displayName: "Host Rejoin" }, { uid: "host0" });
});

test("chat burst protection is independent of slow mode and expires", async () => {
    let clock = 1000;
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => clock, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    await handlers.joinPublicRoom({ roomId: "ABCDEFGHJKL", displayName: "Guest" }, { uid: "guest1" });
    await handlers.updatePublicRoomSocialSettings({ roomId: "ABCDEFGHJKL", slowModeMs: 0 }, { uid: "host" });
    for (let index = 0; index < PUBLIC_CHAT_BURST_MAX; index += 1) {
        await handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: `burst ${index}` }, { uid: "guest1" });
        clock += 1;
    }
    await assert.rejects(() => handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "blocked" }, { uid: "guest1" }), /PUBLIC-ROOM-RATE-LIMIT/);
    clock += PUBLIC_CHAT_BURST_WINDOW_MS;
    await handlers.sendPublicRoomMessage({ roomId: "ABCDEFGHJKL", text: "allowed" }, { uid: "guest1" });
});

test("cleanup repairs orphans, rebuilds missing directories, and removes expired rate limits", async () => {
    const db = new FakeDb();
    const handlers = makePublicRoomHandlers({ db, now: () => 1000, idGenerator: () => "ABCDEFGHJKL", production: false });
    await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "host" });
    db.data.publicRoomDirectory.ORPHANROOM1 = buildPublicDirectoryEntry({ ...db.data.publicRooms.ABCDEFGHJKL, roomName: "Orphan" });
    delete db.data.publicRoomDirectory.ABCDEFGHJKL;
    db.data.publicRoomHostIndex.staleHost = { roomId: "MISSINGROOM1", createdAt: 1000, deleteAt: 2000 };
    db.data.publicRoomRateLimits = {
        create: {
            old: { windowStart: 1, count: 1, expiresAt: 2 },
            fresh: { windowStart: 1000, count: 1, expiresAt: 999999 }
        }
    };
    const result = await cleanupPublicRooms({ db, now: 3000, logger: { info() {} } });
    assert.equal(result.orphanDirectoryCount, 1);
    assert.equal(db.data.publicRoomDirectory.ORPHANROOM1, undefined);
    assert.equal(db.data.publicRoomDirectory.ABCDEFGHJKL.memberCount, 1);
    assert.equal(db.data.publicRoomHostIndex.staleHost, undefined);
    assert.equal(db.data.publicRoomRateLimits.create.old, undefined);
    assert.equal(db.data.publicRoomRateLimits.create.fresh.count, 1);
});

test("directory builder and safe logger do not expose private public-room fields", () => {
    const directory = buildPublicDirectoryEntry({
        hostUid: "host-secret",
        roomName: "Room",
        movieTitle: "Movie",
        language: "fa",
        capacity: 7,
        createdAt: 1000,
        deleteAt: 2000,
        status: "open",
        media: { url: "https://private.example/movie.mp4" },
        members: { host: { displayName: "Host", role: "host" } },
        chat: { one: { text: "secret" } },
        reactions: { one: { uid: "host" } },
        bans: { guest: true },
        playback: { paused: true }
    });
    for (const key of ["media", "members", "hostUid", "bans", "chat", "reactions", "playback", "url", "uid"]) {
        assert.equal(Object.hasOwn(directory, key), false);
    }
    const log = safePublicRoomLog("sendPublicRoomMessage", {
        success: false,
        category: "PUBLIC-ROOM-RATE-LIMIT",
        uid: "secret-uid",
        mediaUrl: "https://private.example/movie.mp4",
        text: "secret chat"
    });
    assert.deepEqual(Object.keys(log).sort(), ["category", "operation", "success"]);
    assert.equal(JSON.stringify(log).includes("secret"), false);
});

function validCreate(overrides = {}) {
    return {
        displayName: "Host",
        roomName: "Cinema",
        movieTitle: "Movie",
        mediaUrl: "http://127.0.0.1:8080/test-assets/sample.mp4",
        capacity: 7,
        language: "فارسی",
        ...overrides
    };
}

class FakeSnapshot {
    constructor(value) {
        this.value = clone(value);
    }
    exists() {
        return this.value !== undefined && this.value !== null;
    }
    val() {
        return clone(this.value);
    }
}

class FakeRef {
    constructor(db, path = "") {
        this.db = db;
        this.path = path.replace(/^\/+|\/+$/g, "");
    }
    child(path) {
        return new FakeRef(this.db, joinPath(this.path, path));
    }
    async once() {
        return new FakeSnapshot(getPath(this.db.data, this.path));
    }
    async set(value) {
        setPath(this.db.data, this.path, value);
    }
    async update(updates) {
        for (const [path, value] of Object.entries(updates)) setPath(this.db.data, joinPath(this.path, path), value);
    }
    async transaction(update) {
        const current = getPath(this.db.data, this.path);
        const next = update(clone(current));
        if (next === undefined) return { committed: false, snapshot: new FakeSnapshot(current) };
        setPath(this.db.data, this.path, next);
        return { committed: true, snapshot: new FakeSnapshot(next) };
    }
}

class FakeDb {
    constructor() {
        this.data = {};
    }
    ref(path = "") {
        return new FakeRef(this, path);
    }
}

function joinPath(...parts) {
    return parts.filter(Boolean).join("/");
}

function getPath(root, path) {
    if (!path) return root;
    return path.split("/").reduce((node, part) => node?.[part], root);
}

function setPath(root, path, value) {
    const parts = path.split("/").filter(Boolean);
    const last = parts.pop();
    let node = root;
    for (const part of parts) {
        node[part] ||= {};
        node = node[part];
    }
    if (value === null || value === undefined) delete node[last];
    else node[last] = clone(value);
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
