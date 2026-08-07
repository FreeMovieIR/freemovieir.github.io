export const MICROPHONE_STATES = Object.freeze({
    OFF: "off",
    REQUESTING_PERMISSION: "requesting-permission",
    STARTING: "starting",
    NEGOTIATING: "negotiating",
    ON: "on",
    MUTED: "muted",
    STOPPING: "stopping",
    RECONNECTING: "reconnecting",
    PERMISSION_DENIED: "permission-denied",
    NO_DEVICE: "no-device",
    FAILED: "failed"
});

const VALID_TRANSITIONS = new Map([
    [MICROPHONE_STATES.OFF, new Set([MICROPHONE_STATES.REQUESTING_PERMISSION, MICROPHONE_STATES.STARTING, MICROPHONE_STATES.FAILED])],
    [MICROPHONE_STATES.REQUESTING_PERMISSION, new Set([MICROPHONE_STATES.STARTING, MICROPHONE_STATES.PERMISSION_DENIED, MICROPHONE_STATES.NO_DEVICE, MICROPHONE_STATES.FAILED, MICROPHONE_STATES.OFF])],
    [MICROPHONE_STATES.STARTING, new Set([MICROPHONE_STATES.NEGOTIATING, MICROPHONE_STATES.ON, MICROPHONE_STATES.FAILED, MICROPHONE_STATES.STOPPING])],
    [MICROPHONE_STATES.NEGOTIATING, new Set([MICROPHONE_STATES.ON, MICROPHONE_STATES.RECONNECTING, MICROPHONE_STATES.FAILED, MICROPHONE_STATES.STOPPING])],
    [MICROPHONE_STATES.ON, new Set([MICROPHONE_STATES.MUTED, MICROPHONE_STATES.STOPPING, MICROPHONE_STATES.RECONNECTING, MICROPHONE_STATES.FAILED])],
    [MICROPHONE_STATES.MUTED, new Set([MICROPHONE_STATES.ON, MICROPHONE_STATES.STOPPING, MICROPHONE_STATES.RECONNECTING, MICROPHONE_STATES.FAILED])],
    [MICROPHONE_STATES.STOPPING, new Set([MICROPHONE_STATES.OFF, MICROPHONE_STATES.FAILED])],
    [MICROPHONE_STATES.RECONNECTING, new Set([MICROPHONE_STATES.ON, MICROPHONE_STATES.FAILED, MICROPHONE_STATES.STOPPING])],
    [MICROPHONE_STATES.PERMISSION_DENIED, new Set([MICROPHONE_STATES.REQUESTING_PERMISSION, MICROPHONE_STATES.OFF])],
    [MICROPHONE_STATES.NO_DEVICE, new Set([MICROPHONE_STATES.REQUESTING_PERMISSION, MICROPHONE_STATES.OFF])],
    [MICROPHONE_STATES.FAILED, new Set([MICROPHONE_STATES.REQUESTING_PERMISSION, MICROPHONE_STATES.OFF, MICROPHONE_STATES.RECONNECTING])]
]);

export class MicrophoneStateMachine extends EventTarget {
    constructor(initial = MICROPHONE_STATES.OFF) {
        super();
        this.state = initial;
        this.operation = Promise.resolve();
        this.busy = false;
        this.generation = 0;
    }

    transition(next, detail = {}) {
        if (next === this.state) return true;
        const allowed = VALID_TRANSITIONS.get(this.state);
        if (!allowed?.has(next)) return false;
        const previous = this.state;
        this.state = next;
        this.dispatchEvent(new CustomEvent("state", { detail: { previous, state: next, ...detail } }));
        return true;
    }

    run(operation) {
        if (this.busy) return this.operation;
        const generation = ++this.generation;
        this.busy = true;
        this.operation = Promise.resolve()
            .then(() => operation({ generation, isCurrent: () => generation === this.generation }))
            .finally(() => {
                if (generation === this.generation) this.busy = false;
            });
        return this.operation;
    }

    cancel() {
        this.generation += 1;
        this.busy = false;
    }
}
