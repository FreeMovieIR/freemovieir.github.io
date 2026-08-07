/**
 * Provider-neutral TURN endpoint template.
 *
 * Do not deploy this file as-is. Connect it to a TURN provider that issues
 * short-lived credentials, verify the Firebase ID token from the Authorization
 * header, keep provider secrets in the serverless platform's secret store, and
 * return only temporary ICE servers to the frontend.
 */

export default async function handler(request) {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "missing_firebase_id_token" }), { status: 401 });
    }
    // Verify the Firebase ID token server-side before issuing TURN credentials.
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
