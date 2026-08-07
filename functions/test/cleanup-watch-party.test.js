import assert from "node:assert/strict";
import test from "node:test";
import { cleanupExpiredRooms, selectExpiredRooms, shouldDeleteRoom } from "../src/cleanup-watch-party.js";

const now = 1_800_000_000_000;

test("selects rooms whose deletion deadline has passed", () => {
    const rooms = {
        ABCDEFGH: { createdAt: now - 1000, deleteAt: now - 1, media: { url: "https://private.example/movie.mp4" }, chat: { a: { text: "private" } } },
        BCDEFGHJ: { createdAt: now - 1000, deleteAt: now + 60_000 },
        BAD_CODE: { createdAt: now - 1000, deleteAt: now - 1 }
    };
    assert.equal(shouldDeleteRoom(rooms.ABCDEFGH, now), true);
    assert.deepEqual(selectExpiredRooms(rooms, now), ["ABCDEFGH"]);
});

test("falls back to twelve-hour retention for older rooms missing deleteAt", () => {
    assert.equal(shouldDeleteRoom({ createdAt: now - 12 * 60 * 60 * 1000 - 1 }, now), true);
    assert.equal(shouldDeleteRoom({ createdAt: now - 60_000 }, now), false);
});

test("cleanup deletes complete room nodes and logs only counts", async () => {
    const removed = [];
    const logs = [];
    const db = {
        ref(path) {
            if (path === "rooms") {
                return {
                    orderByChild(field) {
                        assert.equal(field, "deleteAt");
                        return this;
                    },
                    endAt(value) {
                        assert.equal(value, now);
                        return this;
                    },
                    limitToFirst(value) {
                        assert.equal(value, 100);
                        return this;
                    },
                    async once(event) {
                        assert.equal(event, "value");
                        return {
                            val: () => ({
                                ABCDEFGH: { createdAt: now - 1000, deleteAt: now - 1, chat: { m: { text: "do-not-log" } } },
                                BCDEFGHJ: { createdAt: now - 1000, deleteAt: now + 1 }
                            })
                        };
                    }
                };
            }
            return {
                async remove() {
                    removed.push(path);
                }
            };
        }
    };
    const result = await cleanupExpiredRooms({
        db,
        now,
        logger: { info: (message, data) => logs.push({ message, data }) }
    });
    assert.deepEqual(removed, ["rooms/ABCDEFGH"]);
    assert.deepEqual(result, { deletedCount: 1 });
    assert.equal(JSON.stringify(logs).includes("do-not-log"), false);
    assert.equal(JSON.stringify(logs).includes("private.example"), false);
});
