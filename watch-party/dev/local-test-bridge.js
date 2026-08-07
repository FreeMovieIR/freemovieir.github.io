export function installLocalTestBridge(context = {}) {
    const controls = ensureControlObject();
    const hook = makeHook(context);
    Object.defineProperty(window, "__watchPartyTest", {
        configurable: true,
        value: hook
    });
    return {
        controls,
        getRestoreTimeoutOverride() {
            return controls.restoreTimeoutMs;
        },
        getForcedServiceStatus() {
            return controls.forceServiceStatus || null;
        },
        async beforeRestoreRead(makeError) {
            if (controls.forceRestoreFailure) throw makeError(controls.forceRestoreFailure);
            const delayMs = Number(controls.delayRestoreMs || 0);
            if (Number.isFinite(delayMs) && delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        },
        getVoiceOptions() {
            return {
                forceRelay: Boolean(controls.voice?.forceRelay)
            };
        }
    };
}

function ensureControlObject() {
    if (!window.__WATCH_PARTY_TEST__) {
        Object.defineProperty(window, "__WATCH_PARTY_TEST__", {
            configurable: true,
            writable: true,
            value: {}
        });
    }
    return window.__WATCH_PARTY_TEST__;
}

function makeHook(context) {
    return {
        get state() { return context.ui?.state || null; },
        get selectedRole() { return context.getSelectedRole?.() || null; },
        get uid() { return context.getFirebase?.()?.user?.uid || null; },
        get roomCode() { return context.getRoomService?.()?.roomCode || null; },
        get roomRole() { return context.getRoomService?.()?.role || null; },
        get room() {
            const room = context.getCurrentRoom?.();
            if (!room) return null;
            return {
                status: room.status,
                ownerUid: room.ownerUid,
                guestUid: room.guestUid,
                participantUids: Object.keys(room.participants || {})
            };
        },
        get videoElementToken() {
            const video = context.ui?.els?.video;
            if (!video) return null;
            if (!video.dataset.e2eToken) {
                video.dataset.e2eToken = crypto.randomUUID?.() || String(Date.now());
            }
            return video.dataset.e2eToken;
        },
        get mediaDiagnostics() {
            return context.getMediaController?.()?.diagnostics || globalThis.__watchPartyMediaDiagnostics || null;
        },
        get voicePeerCount() { return context.getAudioCall?.()?.peer ? 1 : 0; },
        get voicePeerCreateCount() { return context.getAudioCall?.()?.peerCreateCount || 0; },
        get voiceGeneration() { return context.getAudioCall?.()?.generationId ? "[set]" : ""; },
        get voiceStarted() { return Boolean(context.getAudioCall?.()?.started); },
        voiceDiagnostics() { return context.getAudioCall?.()?.getDiagnostics?.() || null; },
        voiceV2Diagnostics() { return context.getVoiceCall?.()?.getDiagnostics?.() || context.getAudioCall?.()?.getDiagnostics?.() || null; },
        get operationActive() {
            const operations = context.getOperationController?.();
            return {
                create: Boolean(operations?.isActive("create")),
                join: Boolean(operations?.isActive("join")),
                media: Boolean(operations?.isActive("media"))
            };
        },
        get restoreAttemptCount() { return context.getRestoreCoordinator?.()?.attemptCount || 0; },
        get restoreActive() { return Boolean(context.getRestoreCoordinator?.()?.active); },
        get roomListenerActive() { return Boolean(context.getRoomService?.()?.unsubscribeRoom); },
        get connectionListenerActive() { return Boolean(context.getRoomService?.()?.unsubscribeConnected); }
    };
}
