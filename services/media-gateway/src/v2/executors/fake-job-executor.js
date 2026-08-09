export class FakeJobExecutor {
    constructor({ onStart = null } = {}) {
        this.starts = [];
        this.onStart = onStart;
    }

    async start(jobKey) {
        const executionName = `local-${jobKey.slice(0, 12)}-${this.starts.length + 1}`;
        this.starts.push({ jobKey, executionName });
        if (this.onStart) await this.onStart(jobKey, executionName);
        return { executionName };
    }
}
