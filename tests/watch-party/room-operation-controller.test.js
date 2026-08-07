import assert from "node:assert/strict";
import { test } from "node:test";
import {
    RoomOperationCancelledError,
    RoomOperationController,
    RoomOperationTimeoutError
} from "../../watch-party/js/room-operation-controller.js";

test("room operation timeout rejects and clears active state", async () => {
    const controller = new RoomOperationController({ create: 20 });
    await assert.rejects(
        controller.run("create", () => new Promise((resolve) => setTimeout(resolve, 80))),
        RoomOperationTimeoutError
    );
    assert.equal(controller.isActive("create"), false);
});

test("manual cancellation invalidates late success", async () => {
    const controller = new RoomOperationController({ create: 200 });
    let release;
    const pending = controller.run("create", async (generation) => {
        await new Promise((resolve) => { release = resolve; });
        if (!controller.isCurrent("create", generation)) throw new RoomOperationCancelledError("create");
        return "late-room";
    });
    controller.cancel("create");
    release();
    await assert.rejects(pending, RoomOperationCancelledError);
});

test("retry starts one fresh generation", async () => {
    const controller = new RoomOperationController({ create: 200 });
    const first = controller.begin("create");
    const second = controller.begin("create");
    assert.equal(controller.isCurrent("create", first.generation), false);
    assert.equal(controller.isCurrent("create", second.generation), true);
    controller.finish("create", second.generation);
    assert.equal(controller.isActive("create"), false);
});
