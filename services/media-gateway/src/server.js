import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDefaultGatewayServer } from "./v2/factory.js";

const PORT = Number(process.env.PORT || 8787);

let server = null;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    server = await createDefaultGatewayServer();
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Media Gateway V2 API listening on ${PORT}`);
    });
}

export { createDefaultGatewayServer, server };
