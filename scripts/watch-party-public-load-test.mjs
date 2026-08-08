import assert from "node:assert/strict";
import {
    PUBLIC_CHAT_BURST_WINDOW_MS,
    PUBLIC_ALLOWED_REACTIONS,
    cleanupPublicRooms,
    makePublicRoomHandlers
} from "../functions/src/public-room-core.js";

const TEST_MEDIA_URL = "http://127.0.0.1:8080/test-assets/sample.mp4";

const results = [];
let clock = 1_000_000;

async function main() {
await scenario("A: 50 sequential room creates with cleanup", async () => {
    const db = new FakeDb();
    for (let index = 0; index < 50; index += 1) {
        const handlers = makeHandlers(db, `ROOM${String(index).padStart(8, "0")}`.slice(0, 12));
        const uid = `host-${index}`;
        const { roomId } = await handlers.createPublicRoom(validCreate({ roomName: `Room ${index}` }), { uid });
        db.data.publicRooms[roomId].deleteAt = clock - 1;
        clock += 1;
    }
    const cleanup = await cleanupPublicRooms({ db, now: clock });
    assert.equal(cleanup.deletedCount, 50);
    assert.equal(Object.keys(db.data.publicRooms || {}).length, 0);
    assert.equal(Object.keys(db.data.publicRoomDirectory || {}).length, 0);
});

for (const capacity of [2, 3, 7]) {
    await scenario(`B: 20 concurrent joins against capacity ${capacity}`, async () => {
        const db = new FakeDb();
        const handlers = makeHandlers(db, `CAP${capacity}ROOM01`);
        const { roomId } = await handlers.createPublicRoom(validCreate({ capacity }), { uid: `host-cap-${capacity}` });
        const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) => (
            handlers.joinPublicRoom({ roomId, displayName: `Guest ${index}` }, { uid: `cap-${capacity}-guest-${index}` })
                .then(() => "joined")
                .catch((error) => error.code || error.message)
        )));
        const joined = attempts.filter((value) => value === "joined").length;
        const rejected = attempts.length - joined;
        assert.equal(joined, capacity - 1, `unexpected join result: ${JSON.stringify(attempts)}`);
        assert.equal(rejected, 20 - (capacity - 1), `unexpected rejection result: ${JSON.stringify(attempts)}`);
        assert.equal(Object.keys(db.data.publicRooms[roomId].members).length, capacity);
        assert.equal(db.data.publicRoomDirectory[roomId].memberCount, capacity);
    });
}

await scenario("C: 7 members send chat within allowed burst windows", async () => {
    const db = new FakeDb();
    const handlers = makeHandlers(db, "CHATROOM0001");
    const { roomId } = await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "chat-host" });
    await handlers.updatePublicRoomSocialSettings({ roomId, slowModeMs: 0 }, { uid: "chat-host" });
    for (let index = 1; index <= 6; index += 1) {
        await handlers.joinPublicRoom({ roomId, displayName: `Guest ${index}` }, { uid: `chat-guest-${index}` });
    }
    for (let round = 0; round < 3; round += 1) {
        clock += PUBLIC_CHAT_BURST_WINDOW_MS + 1;
        await Promise.all(Object.keys(db.data.publicRooms[roomId].members).map((uid) => (
            handlers.sendPublicRoomMessage({ roomId, text: `message ${round} from ${uid}` }, { uid })
        )));
    }
    assert.equal(Object.keys(db.data.publicRooms[roomId].chat).length, 21);
});

await scenario("D: 7 members react rapidly and remain rate-limited", async () => {
    const db = new FakeDb();
    const handlers = makeHandlers(db, "REACTROOM001");
    const { roomId } = await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "react-host" });
    for (let index = 1; index <= 6; index += 1) {
        await handlers.joinPublicRoom({ roomId, displayName: `Guest ${index}` }, { uid: `react-guest-${index}` });
    }
    const uids = Object.keys(db.data.publicRooms[roomId].members);
    const firstWave = await Promise.all(uids.map((uid, index) => handlers.sendPublicRoomReaction({ roomId, emoji: PUBLIC_ALLOWED_REACTIONS[index % PUBLIC_ALLOWED_REACTIONS.length] }, { uid })));
    assert.equal(firstWave.length, 7);
    const secondWave = await Promise.all(uids.map((uid) => handlers.sendPublicRoomReaction({ roomId, emoji: PUBLIC_ALLOWED_REACTIONS[0] }, { uid }).catch((error) => error.code)));
    assert.equal(secondWave.filter((code) => code === "PUBLIC-REACTION-RATE-LIMIT").length, 7);
});

await scenario("E: 20 discovery listeners observe bounded directory state", async () => {
    const db = new FakeDb();
    for (let index = 0; index < 20; index += 1) {
        const handlers = makeHandlers(db, `DIRROOM${String(index).padStart(5, "0")}`.slice(0, 12));
        await handlers.createPublicRoom(validCreate({ roomName: `Directory ${index}` }), { uid: `dir-host-${index}` });
    }
    const directorySnapshots = Array.from({ length: 20 }, () => Object.values(db.data.publicRoomDirectory || {}).slice(0, 50));
    assert.equal(directorySnapshots.length, 20);
    assert.ok(directorySnapshots.every((snapshot) => snapshot.length === 20));
    assert.ok(directorySnapshots.flat().every((entry) => !("media" in entry) && !("members" in entry) && !("hostUid" in entry)));
});

await scenario("F: host ends room with 7 members and cascades deletes", async () => {
    const db = new FakeDb();
    const handlers = makeHandlers(db, "ENDROOM00001");
    const { roomId } = await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "end-host" });
    for (let index = 1; index <= 6; index += 1) {
        await handlers.joinPublicRoom({ roomId, displayName: `Guest ${index}` }, { uid: `end-guest-${index}` });
    }
    await handlers.endPublicRoom({ roomId }, { uid: "end-host" });
    assert.equal(db.data.publicRooms?.[roomId], undefined);
    assert.equal(db.data.publicRoomDirectory?.[roomId], undefined);
    assert.equal(db.data.publicRoomHostIndex?.["end-host"], undefined);
});

await scenario("G: kick while client is active removes only the target", async () => {
    const db = new FakeDb();
    const handlers = makeHandlers(db, "KICKROOM001");
    const { roomId } = await handlers.createPublicRoom(validCreate({ capacity: 7 }), { uid: "kick-host" });
    await handlers.joinPublicRoom({ roomId, displayName: "Target" }, { uid: "kick-target" });
    await handlers.sendPublicRoomMessage({ roomId, text: "active chat" }, { uid: "kick-target" });
    await handlers.kickPublicRoomMember({ roomId, uid: "kick-target" }, { uid: "kick-host" });
    assert.equal(db.data.publicRooms[roomId].members["kick-target"], undefined);
    assert.equal(db.data.publicRooms[roomId].bans["kick-target"], true);
    assert.equal(db.data.publicRoomDirectory[roomId].memberCount, 1);
    assert.equal(db.data.publicRoomMemberNotices[roomId]["kick-target"].type, "kicked");
});

console.log(JSON.stringify({ ok: true, scenarios: results }, null, 2));
}

async function scenario(name, fn) {
    const started = Date.now();
    try {
        await fn();
        results.push({ name, passed: true, durationMs: Date.now() - started });
    } catch (error) {
        results.push({ name, passed: false, durationMs: Date.now() - started, error: error?.message || String(error) });
        throw error;
    }
}

function makeHandlers(db, roomId) {
    return makePublicRoomHandlers({
        db,
        now: () => clock,
        idGenerator: () => roomId,
        production: false
    });
}

function validCreate(overrides = {}) {
    return {
        displayName: "Host",
        roomName: "Cinema",
        movieTitle: "Movie",
        mediaUrl: TEST_MEDIA_URL,
        capacity: 7,
        language: "Persian",
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

await main();
