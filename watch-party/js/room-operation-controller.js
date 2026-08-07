export class RoomOperationTimeoutError extends Error {
    constructor(operationName, timeoutMs) {
        super(`${operationName} timed out after ${timeoutMs}ms`);
        this.name = "RoomOperationTimeoutError";
        this.operationName = operationName;
        this.timeoutMs = timeoutMs;
    }
}

export class RoomOperationCancelledError extends Error {
    constructor(operationName) {
        super(`${operationName} was cancelled`);
        this.name = "RoomOperationCancelledError";
        this.operationName = operationName;
    }
}

export class RoomOperationController {
    constructor(defaultTimeouts = {}) {
        this.defaultTimeouts = {
            create: 10000,
            join: 10000,
            validate: 10000,
            rejoin: 10000,
            media: 10000,
            ...defaultTimeouts
        };
        this.generations = new Map();
        this.active = new Map();
    }

    begin(name, options = {}) {
        const generation = (this.generations.get(name) || 0) + 1;
        const timeoutMs = Number(options.timeoutMs || this.defaultTimeouts[name] || 10000);
        this.cancel(name);
        const record = {
            generation,
            timeoutMs,
            startedAt: Date.now(),
            timedOut: false,
            timer: null
        };
        this.generations.set(name, generation);
        this.active.set(name, record);
        return record;
    }

    async run(name, task, options = {}) {
        const record = this.begin(name, options);
        const timeout = new Promise((_, reject) => {
            record.timer = setTimeout(() => {
                if (!this.isCurrent(name, record.generation)) return;
                record.timedOut = true;
                this.active.delete(name);
                reject(new RoomOperationTimeoutError(name, record.timeoutMs));
            }, record.timeoutMs);
        });
        try {
            const result = await Promise.race([task(record.generation), timeout]);
            if (!this.isCurrent(name, record.generation)) throw new RoomOperationCancelledError(name);
            return result;
        } finally {
            this.finish(name, record.generation);
        }
    }

    isCurrent(name, generation) {
        const active = this.active.get(name);
        return Boolean(active && active.generation === generation && this.generations.get(name) === generation);
    }

    finish(name, generation) {
        const active = this.active.get(name);
        if (!active || active.generation !== generation) return;
        clearTimeout(active.timer);
        this.active.delete(name);
    }

    cancel(name) {
        const active = this.active.get(name);
        if (active) clearTimeout(active.timer);
        this.active.delete(name);
        this.generations.set(name, (this.generations.get(name) || 0) + 1);
    }

    cancelAll() {
        for (const name of Array.from(this.active.keys())) this.cancel(name);
    }

    isActive(name) {
        return this.active.has(name);
    }
}
