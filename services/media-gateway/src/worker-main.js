import { createGatewayDependencies } from "./v2/factory.js";
import { runMediaWorker } from "./v2/worker.js";

const jobKey = process.env.MEDIA_GATEWAY_JOB_KEY || "";
const dependencies = await createGatewayDependencies(process.env);
const result = await runMediaWorker({ jobKey, ...dependencies });

if (result.failed || result.acquired === false) {
    process.exitCode = result.acquired === false ? 0 : 1;
}
