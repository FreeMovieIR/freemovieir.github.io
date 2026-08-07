import test from "node:test";
import assert from "node:assert/strict";
import { MICROPHONE_STATES, MicrophoneStateMachine } from "../../watch-party/js/microphone-state-machine.js";

test("microphone state machine accepts only valid transitions", () => {
    const machine = new MicrophoneStateMachine();
    assert.equal(machine.state, MICROPHONE_STATES.OFF);
    assert.equal(machine.transition(MICROPHONE_STATES.ON), false);
    assert.equal(machine.transition(MICROPHONE_STATES.REQUESTING_PERMISSION), true);
    assert.equal(machine.transition(MICROPHONE_STATES.STARTING), true);
    assert.equal(machine.transition(MICROPHONE_STATES.NEGOTIATING), true);
    assert.equal(machine.transition(MICROPHONE_STATES.ON), true);
    assert.equal(machine.transition(MICROPHONE_STATES.MUTED), true);
    assert.equal(machine.transition(MICROPHONE_STATES.ON), true);
});

test("rapid operations are serialized to one active operation", async () => {
    const machine = new MicrophoneStateMachine();
    let runs = 0;
    let release;
    const first = machine.run(async () => {
        runs += 1;
        await new Promise((resolve) => { release = resolve; });
        return "done";
    });
    const second = machine.run(async () => {
        runs += 1;
        return "second";
    });
    assert.equal(first, second);
    assert.equal(runs, 0);
    await Promise.resolve();
    assert.equal(runs, 1);
    release();
    assert.equal(await second, "done");
    assert.equal(runs, 1);
});

test("cancel invalidates an active operation generation", async () => {
    const machine = new MicrophoneStateMachine();
    let currentDuringRun;
    const operation = machine.run(async ({ isCurrent }) => {
        machine.cancel();
        currentDuringRun = isCurrent();
    });
    await operation;
    assert.equal(currentDuringRun, false);
    assert.equal(machine.busy, false);
});
