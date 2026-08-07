/**
 * Provider-neutral TURN endpoint template.
 *
 * Do not deploy this file as-is. Connect it to a TURN provider that issues
 * short-lived credentials, keep provider secrets in the serverless platform's
 * secret store, and return only temporary ICE servers to the frontend.
 */

export default async function handler(_request) {
    return new Response(JSON.stringify({
        iceServers: [],
        expiresAt: Date.now() + 10 * 60 * 1000
    }), {
        status: 200,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store"
        }
    });
}
