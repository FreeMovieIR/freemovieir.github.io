import { authorizeRequest } from "../auth.js";
import { gatewayError } from "./errors.js";
import { SAFE_ERROR } from "./constants.js";

export class FirebaseAdminTokenVerifier {
    constructor({ projectId = "", adminAuth = null } = {}) {
        this.projectId = projectId;
        this.adminAuth = adminAuth;
    }

    async verifyRequest(request) {
        const token = extractToken(request);
        if (!token) throw gatewayError(401, SAFE_ERROR.AUTH_REQUIRED, "Firebase ID token is required.");
        try {
            const auth = this.adminAuth || await getAdminAuth();
            const decoded = await auth.verifyIdToken(token, true);
            if (this.projectId && decoded.aud && decoded.aud !== this.projectId) {
                throw gatewayError(403, SAFE_ERROR.AUTH_INVALID, "Firebase ID token project mismatch.");
            }
            return { uid: decoded.uid || decoded.sub, projectId: this.projectId };
        } catch (error) {
            if (error?.safeCode) throw error;
            throw gatewayError(403, SAFE_ERROR.AUTH_INVALID, "Firebase ID token is invalid.");
        }
    }
}

export class PublicCertTokenVerifier {
    constructor({ projectId, fetchImpl = fetch } = {}) {
        this.projectId = projectId;
        this.fetchImpl = fetchImpl;
    }

    async verifyRequest(request) {
        try {
            return await authorizeRequest(request, {
                requireAuth: true,
                projectId: this.projectId,
                fetchImpl: this.fetchImpl
            });
        } catch {
            throw gatewayError(403, SAFE_ERROR.AUTH_INVALID, "Firebase ID token is invalid.");
        }
    }
}

export class StaticTokenVerifier {
    constructor(uid = "local-dev") {
        this.uid = uid;
    }

    async verifyRequest() {
        return { uid: this.uid, projectId: "local" };
    }
}

function extractToken(request) {
    const header = request.headers?.authorization || "";
    const match = String(header).match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
}

async function getAdminAuth() {
    const [{ getApps, initializeApp }, { getAuth }] = await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth")
    ]);
    if (!getApps().length) initializeApp();
    return getAuth();
}
