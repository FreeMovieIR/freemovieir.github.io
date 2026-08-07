import assert from "node:assert/strict";
import test from "node:test";
import { ChatController } from "../../watch-party/js/chat-controller.js";

test("chat read watermark is debounced and participant scoped", async () => {
    const writes = [];
    const controller = new ChatController({
        uid: "guest",
        updateParticipant: async (patch) => writes.push(patch),
        firebase: { db: {} },
        roomRef: () => ({})
    }, { chatReadDebounceMs: 1 });

    const first = await controller.markRead(100);
    const stale = await controller.markRead(50);
    assert.equal(first, true);
    assert.equal(stale, false);
    assert.deepEqual(writes, [{ chatReadAt: 100 }]);
    controller.destroy();
});

test("destroy clears pending read watermark timer", async () => {
    const writes = [];
    const controller = new ChatController({
        uid: "guest",
        updateParticipant: async (patch) => writes.push(patch),
        firebase: { db: {} },
        roomRef: () => ({})
    }, { chatReadDebounceMs: 20 });
    controller.markRead(200);
    controller.destroy();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(writes, []);
});
