import { clampChatMessage, isAllowedReaction, rateLimit, validateChatMessage } from "./utils.js";

export class ChatController extends EventTarget {
    constructor(roomService, config) {
        super();
        this.roomService = roomService;
        this.config = config;
        this.canSendMessage = rateLimit(900);
        this.canReact = rateLimit(650);
        this.unsubscribeChat = null;
        this.unsubscribeChatChanged = null;
        this.unsubscribeReactions = null;
        this.messages = new Map();
        this.lastMarkedReadAt = 0;
        this.readTimer = null;
    }

    listen() {
        const { db } = this.roomService.firebase;
        const chatQuery = db.query(
            db.child(this.roomService.roomRef(), "chat"),
            db.orderByChild("createdAt"),
            db.limitToLast(this.config.maxChatMessages || 75)
        );
        const emitMessages = () => {
            const messages = Array.from(this.messages.values())
                .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
                .slice(-(this.config.maxChatMessages || 75));
            this.dispatchEvent(new CustomEvent("messages", { detail: messages }));
        };
        const upsertMessage = (snap) => {
            this.messages.set(snap.key, { id: snap.key, ...snap.val() });
            emitMessages();
        };
        this.unsubscribeChat = db.onChildAdded(chatQuery, upsertMessage);
        this.unsubscribeChatChanged = db.onChildChanged(chatQuery, upsertMessage);

        const reactionQuery = db.query(
            db.child(this.roomService.roomRef(), "reactions"),
            db.orderByChild("createdAt"),
            db.limitToLast(20)
        );
        this.unsubscribeReactions = db.onChildAdded(reactionQuery, (snap) => {
            this.dispatchEvent(new CustomEvent("reaction", { detail: { id: snap.key, ...snap.val() } }));
        });
    }

    async send(text, displayName) {
        const limit = this.config.chatLengthLimit || 500;
        if (!validateChatMessage(text, limit) || !this.canSendMessage()) return false;
        const clean = clampChatMessage(text, limit);
        const { db } = this.roomService.firebase;
        await db.push(db.child(this.roomService.roomRef(), "chat"), {
            uid: this.roomService.uid,
            displayName,
            text: clean,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
        return true;
    }

    async react(emoji) {
        if (!isAllowedReaction(emoji) || !this.canReact()) return false;
        const { db } = this.roomService.firebase;
        await db.push(db.child(this.roomService.roomRef(), "reactions"), {
            uid: this.roomService.uid,
            emoji,
            createdAt: this.roomService.firebase.serverTimestamp()
        });
        return true;
    }

    async markRead(createdAt) {
        const nextReadAt = Number(createdAt || 0);
        if (!Number.isFinite(nextReadAt) || nextReadAt <= this.lastMarkedReadAt) return false;
        clearTimeout(this.readTimer);
        return new Promise((resolve) => {
            this.readTimer = setTimeout(async () => {
                try {
                    await this.roomService.updateParticipant({ chatReadAt: nextReadAt });
                    this.lastMarkedReadAt = nextReadAt;
                    resolve(true);
                } catch {
                    resolve(false);
                }
            }, Number(this.config.chatReadDebounceMs || 700));
        });
    }

    destroy() {
        this.unsubscribeChat?.();
        this.unsubscribeChatChanged?.();
        this.unsubscribeReactions?.();
        clearTimeout(this.readTimer);
        this.messages.clear();
        this.lastMarkedReadAt = 0;
    }
}
