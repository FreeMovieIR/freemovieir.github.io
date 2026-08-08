import admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { cleanupExpiredRooms } from "./cleanup-watch-party.js";
import { cleanupPublicRooms, makePublicRoomHandlers, PublicRoomCommandError, safePublicRoomLog } from "./public-room-core.js";

admin.initializeApp({
    databaseURL: resolveDatabaseUrl()
});

const publicRoomHandlers = makePublicRoomHandlers({
    db: admin.database(),
    production: process.env.FUNCTIONS_EMULATOR !== "true"
});

function publicCallable(name) {
    return onCall({ region: "us-central1", cors: true }, async (request) => {
        const startedAt = Date.now();
        try {
            const result = await publicRoomHandlers[name](request.data || {}, request.auth);
            console.info("public room callable completed", safePublicRoomLog(name, {
                success: true,
                durationBucket: durationBucket(Date.now() - startedAt),
                functionVersion: "public-v3"
            }));
            return result;
        } catch (error) {
            if (error instanceof PublicRoomCommandError) {
                console.warn("public room callable rejected", safePublicRoomLog(name, {
                    success: false,
                    category: error.code,
                    durationBucket: durationBucket(Date.now() - startedAt),
                    functionVersion: "public-v3"
                }));
                throw new HttpsError(toHttpsCode(error.code), error.message, { code: error.code });
            }
            console.error("public room callable failed", safePublicRoomLog(name, {
                success: false,
                category: "PUBLIC-ROOM-UNKNOWN",
                durationBucket: durationBucket(Date.now() - startedAt),
                functionVersion: "public-v3"
            }));
            throw new HttpsError("internal", "PUBLIC-ROOM-UNKNOWN", { code: "PUBLIC-ROOM-UNKNOWN" });
        }
    });
}

function durationBucket(ms) {
    if (ms < 100) return "lt100ms";
    if (ms < 500) return "lt500ms";
    if (ms < 1000) return "lt1s";
    if (ms < 5000) return "lt5s";
    return "gte5s";
}

function toHttpsCode(code) {
    if (code === "PUBLIC-ROOM-NOT-AUTHORIZED") return "permission-denied";
    if (code === "PUBLIC-ROOM-NOT-FOUND") return "not-found";
    if (code === "PUBLIC-ROOM-VALIDATION" || code === "PUBLIC-CHAT-VALIDATION" || code === "PUBLIC-CHAT-TOO-LONG" || code === "PUBLIC-REACTION-INVALID") return "invalid-argument";
    if (code === "PUBLIC-ROOM-RATE-LIMIT" || code === "PUBLIC-CHAT-SLOW-MODE" || code === "PUBLIC-REACTION-RATE-LIMIT") return "resource-exhausted";
    if (
        code === "PUBLIC-ROOM-FULL"
        || code === "PUBLIC-ROOM-LOCKED"
        || code === "PUBLIC-ROOM-BANNED"
        || code === "PUBLIC-ROOM-ENDED"
        || code === "PUBLIC-CHAT-DISABLED"
        || code === "PUBLIC-REACTIONS-DISABLED"
    ) return "failed-precondition";
    return "unknown";
}

function resolveDatabaseUrl() {
    const firebaseConfig = parseFirebaseConfig();
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || firebaseConfig?.projectId || "demo-freemovieir";
        const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
        return `http://${host}?ns=${projectId}-default-rtdb`;
    }
    if (firebaseConfig?.databaseURL) return firebaseConfig.databaseURL;
    return undefined;
}

function parseFirebaseConfig() {
    try {
        return process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
    } catch {
        return null;
    }
}

export const createPublicRoom = publicCallable("createPublicRoom");
export const joinPublicRoom = publicCallable("joinPublicRoom");
export const leavePublicRoom = publicCallable("leavePublicRoom");
export const kickPublicRoomMember = publicCallable("kickPublicRoomMember");
export const setPublicRoomLock = publicCallable("setPublicRoomLock");
export const updatePublicRoomMedia = publicCallable("updatePublicRoomMedia");
export const sendPublicRoomMessage = publicCallable("sendPublicRoomMessage");
export const deletePublicRoomMessage = publicCallable("deletePublicRoomMessage");
export const sendPublicRoomReaction = publicCallable("sendPublicRoomReaction");
export const updatePublicRoomSocialSettings = publicCallable("updatePublicRoomSocialSettings");
export const endPublicRoom = publicCallable("endPublicRoom");

export const cleanupExpiredWatchPartyRooms = onSchedule("every 30 minutes", async () => {
    await cleanupExpiredRooms({
        db: admin.database(),
        now: Date.now(),
        batchSize: 100
    });
    await cleanupPublicRooms({
        db: admin.database(),
        now: Date.now()
    });
});
