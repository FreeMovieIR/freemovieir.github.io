export class CloudRunJobExecutor {
    constructor({ projectId, region, jobName, fetchImpl = fetch, tokenProvider = null } = {}) {
        if (!projectId) throw new Error("CloudRunJobExecutor requires MEDIA_GATEWAY_PROJECT_ID.");
        if (!region) throw new Error("CloudRunJobExecutor requires MEDIA_GATEWAY_REGION.");
        if (!jobName) throw new Error("CloudRunJobExecutor requires MEDIA_GATEWAY_WORKER_JOB.");
        this.projectId = projectId;
        this.region = region;
        this.jobName = jobName;
        this.fetchImpl = fetchImpl;
        this.tokenProvider = tokenProvider || getMetadataAccessToken;
    }

    async start(jobKey) {
        const token = await this.tokenProvider();
        const endpoint = `https://${this.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${encodeURIComponent(this.projectId)}/jobs/${encodeURIComponent(this.jobName)}:run`;
        const response = await this.fetchImpl(endpoint, {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                overrides: {
                    containerOverrides: [{
                        env: [{ name: "MEDIA_GATEWAY_JOB_KEY", value: jobKey }]
                    }]
                }
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Cloud Run Job execution failed to start.");
        return { executionName: data.metadata?.name || data.name || "" };
    }
}

async function getMetadataAccessToken() {
    const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" } }
    );
    if (!response.ok) throw new Error("Metadata access token unavailable.");
    const data = await response.json();
    return data.access_token;
}
