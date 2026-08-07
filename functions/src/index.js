import admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { cleanupExpiredRooms } from "./cleanup-watch-party.js";

admin.initializeApp();

export const cleanupExpiredWatchPartyRooms = onSchedule("every 30 minutes", async () => {
    await cleanupExpiredRooms({
        db: admin.database(),
        now: Date.now(),
        batchSize: 100
    });
});
