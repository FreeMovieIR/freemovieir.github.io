import { loadWatchPartyConfig, createFirebaseClient, ensureFirebaseServicesAvailable, shouldUseEmulators } from "./firebase-client.js";
import { RoomService } from "./room-service.js";
import { MediaController } from "./media-controller.js";
import { SyncController } from "./sync-controller.js";
import { SubtitleController } from "./subtitle-controller.js";
import { VoiceCall } from "./voice/voice-call.js";
import { ChatController } from "./chat-controller.js";
import { WatchPartyUI } from "./ui.js";
import { APP_STATES } from "./ui-state.js";
import { RestoreCoordinator, RestoreError, RESTORE_FAILURES, canRetryRestoreFailure, classifyRestoreFailure, getRestoreFailureMessage } from "./restore-controller.js";
import { clearStoredRoomSession, hasAnyStoredRoomSession, readStoredRoomSession, saveRoomSession } from "./session-storage.js";
import { describeMediaError, isHttpsUrl, isLocalHostname, isValidRoomCode, MESSAGES, normalizeRoomCode, parseUrl, safeLog, sanitizeDisplayName } from "./utils.js";
import { ServiceAvailabilityError, checkFirebaseServices } from "./service-availability.js";
import { RoomOperationCancelledError, RoomOperationController, RoomOperationTimeoutError } from "./room-operation-controller.js";
import {
    AuthInitializationError,
    FirebaseInitializationError,
    getAuthUserMessage,
    getFirebaseInitUserMessage,
    getSafeDiagnostic
} from "./auth-diagnostics.js";

const ui = new WatchPartyUI();

let config;
let firebase;
let roomService;
let mediaController;
let subtitleController;
let syncController;
let voiceCall;
let chatController;
let currentRoom;
let localDisplayName = "مهمان";
let selectedRole = null;
let pendingGuestCode = "";
let prefillData = {};
let micEnabled = false;
let muted = false;
let voiceMuted = false;
let micOperationActive = false;
let mediaSignature = "";
let subtitleSignature = "";
let countdownToken = 0;
let bufferTimer = null;
let roomEventsBound = false;
let createInFlight = false;
let joinInFlight = false;
let videoBufferBound = false;
let restoreCoordinator = null;
let restoreSessionCandidate = null;
let restoreCancelled = false;
let roomEventGeneration = null;
let operationController;
let lastServiceAction = null;
let lastAuthAction = null;
let localTestBridge = null;
let globalRuntimeErrorsBound = false;

init().catch((error) => showFatal(error.message || MESSAGES.missingConfig));

function getRestoreTimeoutMs() {
    const localOverride = Number(localTestBridge?.getRestoreTimeoutOverride?.());
    if (Number.isFinite(localOverride) && localOverride > 0) return localOverride;
    return Number(config?.restoreTimeoutMs || 10000);
}

function getMaxStoredSessionAgeMs() {
    return Number(config?.maxStoredSessionAgeMs || config?.roomLifetimeMs || 6 * 60 * 60 * 1000);
}

async function init() {
    config = await loadWatchPartyConfig();
    prefillData = readPrefill();
    if (new URLSearchParams(location.search).get("resetSession") === "1" && isLocalHostname(location.hostname)) {
        clearSavedSession();
        cleanWatchPartyUrl();
    }
    ui.prefill(prefillData);
    ui.loadRememberedName();
    bindGlobalUi();
    await loadDevelopmentBridge();

    if (config?.missing) {
        if (config.error instanceof FirebaseInitializationError) showAuthFailure(config.error, "config");
        else showFatal(config.productionMissing ? MESSAGES.productionConfigMissing : MESSAGES.missingConfig);
        return;
    }
    operationController = new RoomOperationController({
        create: Number(config.createRoomTimeoutMs || 10000),
        join: Number(config.joinRoomTimeoutMs || 10000),
        media: Number(config.replaceMediaTimeoutMs || 10000)
    });

    const restored = null;
    const roomParam = normalizeRoomCode(new URLSearchParams(location.search).get("room") || "");
    if (!roomParam && beginInitialRestoreIfAvailable()) return;
    if (restored?.roomCode && restored?.role && !roomParam) {
        ui.setState(APP_STATES.RECONNECTING);
        ui.els.authMessage.textContent = "در حال بازیابی اتاق...";
        try {
            await ensureFirebase();
            await restoreSession(restored);
            return;
        } catch (error) {
            clearSavedSession();
            ui.toast("بازیابی اتاق ناموفق بود.");
        }
    }

    if (roomParam) {
        selectedRole = "guest";
        ui.setSelectedRole("guest");
        ui.prefill({ roomCode: roomParam });
        ui.setState(APP_STATES.GUEST_CODE);
        return;
    }

    ui.setState(APP_STATES.WELCOME);
}

async function loadDevelopmentBridge() {
    if (!shouldLoadDevelopmentBridge()) return;
    try {
        const bridge = await import("../dev/local-test-bridge.js");
        localTestBridge = bridge.installLocalTestBridge({
            ui,
            getFirebase: () => firebase,
            getRoomService: () => roomService,
            getCurrentRoom: () => currentRoom,
            getSelectedRole: () => selectedRole,
            getMediaController: () => mediaController,
            getAudioCall: () => voiceCall,
            getVoiceCall: () => voiceCall,
            getOperationController: () => operationController,
            getRestoreCoordinator: () => restoreCoordinator
        });
    } catch (error) {
        safeLog("local test bridge unavailable", { error: error?.message || String(error) });
    }
}

function shouldLoadDevelopmentBridge() {
    if (config?.environment === "production") return false;
    if (!isLocalHostname(location.hostname)) return false;
    return Boolean(config?.useEmulators || config?.environment === "local" || config?.environment === "test");
}

function bindGlobalUi() {
    bindGlobalRuntimeErrors();

    ui.addEventListener("selectRole", async (event) => {
        selectedRole = event.detail;
        ui.setSelectedRole(selectedRole);
        ui.clearFieldErrors();
        ui.setState(APP_STATES.AUTHENTICATING);
        try {
            await ensureFirebase();
            ui.setState(selectedRole === "host" ? APP_STATES.HOST_PROFILE : APP_STATES.GUEST_CODE);
        } catch (error) {
            if (error instanceof ServiceAvailabilityError) {
                lastServiceAction = selectedRole === "host" ? "create" : "join";
                ui.showServiceUnavailable(error.details || {}, { production: !shouldUseEmulators(config) });
            } else if (isFirebaseAuthFailure(error)) {
                showAuthFailure(error, "role");
            } else {
                showFatal(error.message);
            }
        }
    });

    ui.addEventListener("action", async (event) => {
        const action = event.detail;
        if (action === "back-role") {
            if (roomService) {
                const ok = await confirmLeave();
                if (!ok) return;
                cleanup();
                await roomService.leaveRoom();
                clearSavedSession();
            }
            selectedRole = null;
            pendingGuestCode = "";
            ui.clearFieldErrors();
            ui.setSelectedRole(null);
            ui.setState(APP_STATES.WELCOME);
        }
        if (action === "host-prev") ui.setState(APP_STATES.HOST_PROFILE);
        if (action === "guest-prev") ui.setState(APP_STATES.GUEST_CODE);
        if (action === "switch-host") {
            selectedRole = "host";
            ui.setSelectedRole("host");
            ui.setState(APP_STATES.HOST_PROFILE);
        }
    });

    ui.addEventListener("hostProfile", (event) => {
        const data = event.detail;
        const name = sanitizeDisplayName(data.get("displayName"));
        if (!name) {
            ui.setFieldError("hostNameError", "نام نمایشی الزامی است.");
            return;
        }
        localDisplayName = name;
        ui.saveRememberedName(name, data.get("rememberName") === "on");
        ui.setState(APP_STATES.HOST_MEDIA);
    });

    ui.addEventListener("guestCode", (event) => {
        const code = normalizeRoomCode(event.detail.get("roomCode"));
        if (!isValidRoomCode(code)) {
            ui.setFieldError("guestCodeError", "کد اتاق نامعتبر است");
            return;
        }
        pendingGuestCode = code;
        ui.setFieldError("guestCodeError", "");
        ui.els.roomPreview.textContent = "کد دعوت آماده است. برای ورود نامت را وارد کن.";
        ui.setState(APP_STATES.GUEST_PROFILE);
    });

    ui.addEventListener("create", createRoomGuarded);
    ui.addEventListener("join", joinRoomGuarded);
    ui.addEventListener("restoreRetry", () => {
        if (restoreCoordinator?.active) return;
        beginRestoreAttempt({ manual: true });
    });
    ui.addEventListener("restoreCancel", () => cancelRestoreToWelcome());
    ui.addEventListener("authRetry", retryAfterAuthFailure);
    ui.addEventListener("authBack", backAfterAuthFailure);
    ui.addEventListener("serviceRetry", retryAfterServiceUnavailable);
    ui.addEventListener("serviceBack", () => {
        operationController?.cancelAll();
        cleanup();
        selectedRole = null;
        pendingGuestCode = "";
        createInFlight = false;
        joinInFlight = false;
        ui.clearFieldErrors();
        ui.setSelectedRole(null);
        ui.setState(APP_STATES.WELCOME);
    });
}

function bindGlobalRuntimeErrors() {
    if (globalRuntimeErrorsBound || typeof window === "undefined") return;
    globalRuntimeErrorsBound = true;
    window.addEventListener("unhandledrejection", (event) => {
        const reason = classifyRestoreFailure(event.reason);
        if (reason !== RESTORE_FAILURES.PERMISSION_DENIED || !roomService) return;
        event.preventDefault();
        handleRoomAccessLoss(event.reason);
    });
}

function handleRoomAccessLoss(error) {
    safeLog("room access lost", { error: error?.message || String(error || "") });
    cleanup();
    ui.showRestoreFailed({
        message: getRestoreFailureMessage(classifyRestoreFailure(error)),
        canRetry: false
    });
}

async function ensureFirebase() {
    if (firebase) return firebase;
    firebase = await createFirebaseClient(config, getServiceCheckOptions());
    mediaController = new MediaController(ui.els.video, config);
    subtitleController = new SubtitleController(ui.els.video, ui.els.track, config);
    if (firebase.emulatorMode) ui.banner(MESSAGES.emulatorMode, true);
    return firebase;
}

async function verifyServicesOrShow(actionName) {
    if (!shouldUseEmulators(config)) return true;
    try {
        await ensureFirebaseServicesAvailable(config, getServiceCheckOptions());
        return true;
    } catch (error) {
        if (error instanceof ServiceAvailabilityError) {
            lastServiceAction = actionName;
            operationController?.cancel(actionName);
            ui.showServiceUnavailable(error.details || {}, { production: !shouldUseEmulators(config) });
            return false;
        }
        throw error;
    }
}

async function retryAfterServiceUnavailable() {
    const status = await checkFirebaseServices(config, getServiceCheckOptions());
    if (status.status !== "available") {
        ui.showServiceUnavailable(status, { production: !shouldUseEmulators(config) });
        return;
    }
    ui.toast("سرویس لوکال در دسترس است.");
    const action = lastServiceAction;
    lastServiceAction = null;
    if (action === "create") ui.setState(APP_STATES.HOST_MEDIA);
    else if (action === "join") ui.setState(APP_STATES.GUEST_PROFILE);
    else ui.setState(selectedRole === "guest" ? APP_STATES.GUEST_PROFILE : selectedRole === "host" ? APP_STATES.HOST_MEDIA : APP_STATES.WELCOME);
}

async function retryAfterAuthFailure() {
    if (firebase) {
        returnFromAuthFailure();
        return;
    }
    ui.setState(APP_STATES.AUTHENTICATING);
    try {
        await ensureFirebase();
        returnFromAuthFailure();
    } catch (error) {
        if (isFirebaseAuthFailure(error)) showAuthFailure(error, lastAuthAction);
        else if (error instanceof ServiceAvailabilityError) ui.showServiceUnavailable(error.details || {}, { production: !shouldUseEmulators(config) });
        else showFatal(error.message || MESSAGES.authFailed);
    }
}

function backAfterAuthFailure() {
    returnFromAuthFailure({ back: true });
}

function returnFromAuthFailure({ back = false } = {}) {
    const action = lastAuthAction;
    if (back) lastAuthAction = null;
    if (action === "create") ui.setState(APP_STATES.HOST_MEDIA);
    else if (action === "join") ui.setState(APP_STATES.GUEST_PROFILE);
    else if (selectedRole === "host") {
        if (back) {
            selectedRole = null;
            ui.setSelectedRole(null);
            ui.setState(APP_STATES.WELCOME);
        } else {
            ui.setState(APP_STATES.HOST_PROFILE);
        }
    }
    else if (selectedRole === "guest") {
        if (back) {
            selectedRole = null;
            ui.setSelectedRole(null);
            ui.setState(APP_STATES.WELCOME);
        } else {
            ui.setState(APP_STATES.GUEST_CODE);
        }
    }
    else ui.setState(APP_STATES.WELCOME);
}

function showAuthFailure(error, action = null) {
    lastAuthAction = action || lastAuthAction;
    const diagnostic = getSafeDiagnostic(error);
    const message = error instanceof FirebaseInitializationError
        ? getFirebaseInitUserMessage(error)
        : getAuthUserMessage(error);
    ui.showAuthFailure({
        message,
        code: diagnostic.code,
        retryable: diagnostic.retryable
    });
}

function isFirebaseAuthFailure(error) {
    return error instanceof AuthInitializationError || error instanceof FirebaseInitializationError;
}

function getServiceCheckOptions() {
    return {
        timeoutMs: Number(config.serviceCheckTimeoutMs || 4000),
        forcedStatus: localTestBridge?.getForcedServiceStatus?.()
    };
}

async function createRoomGuarded(event) {
    if (createInFlight || operationController?.isActive("create")) return;
    createInFlight = true;
    ui.clearFieldErrors();
    ui.setState(APP_STATES.CREATING_ROOM);
    try {
        await operationController.run("create", async (generation) => {
            await ensureFirebase();
            if (!operationController.isCurrent("create", generation)) throw new RoomOperationCancelledError("create");
            if (!(await verifyServicesOrShow("create"))) throw new RoomOperationCancelledError("create");
            const data = event.detail;
            const mediaUrl = normalizeMediaUrl(data.get("videoUrl"));
            const subtitle = await buildHostSubtitle(data);
            if (!operationController.isCurrent("create", generation)) throw new RoomOperationCancelledError("create");
            roomService = new RoomService(firebase, config);
            await roomService.initServerClock();
            const code = await roomService.createRoom({
                displayName: localDisplayName,
                mediaUrl,
                subtitle,
                autoPauseOnBuffer: data.get("autoPauseOnBuffer") === "on",
                shouldContinue: () => operationController.isCurrent("create", generation)
            });
            if (!operationController.isCurrent("create", generation)) {
                roomService.detach();
                throw new RoomOperationCancelledError("create");
            }
            selectedRole = "host";
            saveSession({ roomCode: code, role: "host", displayName: localDisplayName, uid: roomService.uid, lastKnownStage: "lobby" });
            setupRoomControllers(code, true);
            ui.toast("اتاق ساخته شد.");
        }, { timeoutMs: Number(config.createRoomTimeoutMs || 10000) });
    } catch (error) {
        if (error instanceof RoomOperationCancelledError || error?.message === "operation-cancelled") return;
        if (error instanceof RoomOperationTimeoutError) ui.setFieldError("hostVideoError", "ساخت اتاق بیشتر از حد معمول طول کشید. دوباره تلاش کنید.");
        else if (error instanceof ServiceAvailabilityError) ui.showServiceUnavailable(error.details || {}, { production: !shouldUseEmulators(config) });
        else if (isFirebaseAuthFailure(error)) showAuthFailure(error, "create");
        else if (error.message === MESSAGES.invalidUrl || error.message === MESSAGES.insecureUrl) ui.setFieldError("hostVideoError", error.message);
        else if (/subtitle|زیرنویس|Ø²ÛŒØ±Ù†ÙˆÛŒØ³/i.test(error.message || "")) ui.setFieldError("hostSubtitleError", error.message);
        else ui.setFieldError("hostVideoError", error.message || "امکان ساخت اتاق وجود ندارد.");
        if (!(error instanceof ServiceAvailabilityError) && !isFirebaseAuthFailure(error)) ui.setState(APP_STATES.HOST_MEDIA);
    } finally {
        createInFlight = false;
    }
}

async function joinRoomGuarded(event) {
    if (joinInFlight || operationController?.isActive("join")) return;
    joinInFlight = true;
    ui.clearFieldErrors();
    ui.setState(APP_STATES.JOINING_ROOM);
    try {
        await operationController.run("join", async (generation) => {
            await ensureFirebase();
            if (!operationController.isCurrent("join", generation)) throw new RoomOperationCancelledError("join");
            if (!(await verifyServicesOrShow("join"))) throw new RoomOperationCancelledError("join");
            const data = event.detail;
            const displayName = sanitizeDisplayName(data.get("displayName"));
            if (!displayName) throw new Error("نام نمایشی الزامی است.");
            localDisplayName = displayName;
            ui.saveRememberedName(displayName, data.get("rememberName") === "on");
            roomService = new RoomService(firebase, config);
            await roomService.initServerClock();
            const code = await roomService.joinRoom(pendingGuestCode || ui.els.guestRoomCode.value, displayName, {
                shouldContinue: () => operationController.isCurrent("join", generation)
            });
            if (!operationController.isCurrent("join", generation)) {
                roomService.detach();
                throw new RoomOperationCancelledError("join");
            }
            selectedRole = roomService.role === "owner" ? "host" : "guest";
            saveSession({ roomCode: code, role: selectedRole, displayName, uid: roomService.uid, lastKnownStage: "lobby" });
            setupRoomControllers(code, selectedRole === "host");
            ui.toast("وارد اتاق شدید.");
        }, { timeoutMs: Number(config.joinRoomTimeoutMs || 10000) });
    } catch (error) {
        if (error instanceof RoomOperationCancelledError || error?.message === "operation-cancelled") return;
        if (error instanceof RoomOperationTimeoutError) ui.setFieldError("guestNameError", "ورود به اتاق بیشتر از حد معمول طول کشید. دوباره تلاش کنید.");
        else if (error instanceof ServiceAvailabilityError) ui.showServiceUnavailable(error.details || {}, { production: !shouldUseEmulators(config) });
        else if (isFirebaseAuthFailure(error)) showAuthFailure(error, "join");
        else ui.setFieldError("guestNameError", mapJoinError(error));
        if (!(error instanceof ServiceAvailabilityError) && !isFirebaseAuthFailure(error)) ui.setState(APP_STATES.GUEST_PROFILE);
    } finally {
        joinInFlight = false;
    }
}

async function createRoom(event) {
    if (createInFlight) return;
    createInFlight = true;
    ui.clearFieldErrors();
    ui.setState(APP_STATES.CREATING_ROOM);
    try {
        await ensureFirebase();
        const data = event.detail;
        const mediaUrl = normalizeMediaUrl(data.get("videoUrl"));
        const subtitle = await buildHostSubtitle(data);
        roomService = new RoomService(firebase, config);
        await roomService.initServerClock();
        const code = await roomService.createRoom({
            displayName: localDisplayName,
            mediaUrl,
            subtitle,
            autoPauseOnBuffer: data.get("autoPauseOnBuffer") === "on"
        });
        selectedRole = "host";
        saveSession({ roomCode: code, role: "host", displayName: localDisplayName, uid: roomService.uid, lastKnownStage: "lobby" });
        setupRoomControllers(code, true);
        ui.toast("اتاق ساخته شد.");
    } catch (error) {
        if (error.message === MESSAGES.invalidUrl || error.message === MESSAGES.insecureUrl) ui.setFieldError("hostVideoError", error.message);
        else if (error.message?.includes("زیرنویس")) ui.setFieldError("hostSubtitleError", error.message);
        else ui.setFieldError("hostVideoError", error.message || "امکان ساخت اتاق وجود ندارد.");
        ui.setState(APP_STATES.HOST_MEDIA);
    } finally {
        createInFlight = false;
    }
}

async function joinRoom(event) {
    if (joinInFlight) return;
    joinInFlight = true;
    ui.clearFieldErrors();
    ui.setState(APP_STATES.JOINING_ROOM);
    try {
        await ensureFirebase();
        const data = event.detail;
        const displayName = sanitizeDisplayName(data.get("displayName"));
        if (!displayName) throw new Error("نام نمایشی الزامی است.");
        localDisplayName = displayName;
        ui.saveRememberedName(displayName, data.get("rememberName") === "on");
        roomService = new RoomService(firebase, config);
        await roomService.initServerClock();
        const code = await roomService.joinRoom(pendingGuestCode || ui.els.guestRoomCode.value, displayName);
        selectedRole = roomService.role === "owner" ? "host" : "guest";
        saveSession({ roomCode: code, role: selectedRole, displayName, uid: roomService.uid, lastKnownStage: "lobby" });
        setupRoomControllers(code, selectedRole === "host");
        ui.toast("وارد اتاق شدید.");
    } catch (error) {
        ui.setFieldError("guestNameError", mapJoinError(error));
        ui.setState(APP_STATES.GUEST_PROFILE);
    } finally {
        joinInFlight = false;
    }
}

async function restoreSession(session) {
    localDisplayName = session.displayName || "مهمان";
    selectedRole = session.role;
    roomService = new RoomService(firebase, config);
    await roomService.initServerClock();
    await roomService.enterRoom(session.roomCode, session.role === "host" ? "owner" : "guest", localDisplayName);
    setupRoomControllers(session.roomCode, session.role === "host");
}

function beginInitialRestoreIfAvailable() {
    const result = readSavedSession();
    if (!result?.roomCode) {
        if (hasAnyStoredRoomSession()) {
            clearSavedSession();
            ui.toast("اطلاعات اتاق قبلی منقضی شده بود و پاک شد.");
        }
        return false;
    }
    restoreSessionCandidate = result;
    beginRestoreAttempt({ manual: false });
    return true;
}

function getRestoreCoordinator() {
    if (!restoreCoordinator || restoreCoordinator.timeoutMs !== getRestoreTimeoutMs()) {
        restoreCoordinator = new RestoreCoordinator({
            timeoutMs: getRestoreTimeoutMs(),
            onTimeout: handleRestoreTimeout
        });
    }
    return restoreCoordinator;
}

function beginRestoreAttempt({ manual }) {
    if (!restoreSessionCandidate) restoreSessionCandidate = readSavedSession();
    if (!restoreSessionCandidate?.roomCode) {
        clearSavedSession();
        ui.setState(APP_STATES.WELCOME);
        return;
    }
    restoreCancelled = false;
    const coordinator = getRestoreCoordinator();
    const generation = coordinator.begin();
    ui.showRestoring({
        attempt: coordinator.attemptCount,
        message: manual ? "در حال تلاش دوباره برای بازیابی اتاق..." : "لطفاً چند لحظه صبر کن."
    });
    performRestore(restoreSessionCandidate, generation).catch((error) => {
        if (!coordinator.isCurrent(generation)) return;
        handleRestoreFailure(error, generation);
    });
}

function handleRestoreTimeout(generation) {
    if (!restoreCoordinator?.isCurrent(generation)) return;
    cleanup();
    restoreCoordinator.cancel();
    ui.showRestoreFailed({
        message: getRestoreFailureMessage(RESTORE_FAILURES.TIMEOUT),
        canRetry: true
    });
}

async function performRestore(session, generation) {
    await maybeDelayRestore();
    if (!isCurrentRestore(generation)) return;
    await ensureFirebase();
    if (!isCurrentRestore(generation)) return;

    const stored = readSavedSession({ uid: firebase.user.uid });
    if (!stored?.roomCode) throw new RestoreError(RESTORE_FAILURES.ACCESS_LOST);
    restoreSessionCandidate = stored;
    localDisplayName = stored.displayName || "مهمان";
    selectedRole = stored.role;
    roomService = new RoomService(firebase, config);
    await roomService.initServerClock();
    if (!isCurrentRestore(generation)) {
        roomService.detach();
        return;
    }

    const room = await readRestorableRoom(stored);
    if (!isCurrentRestore(generation)) {
        roomService.detach();
        return;
    }
    validateRestoredMembership(room, stored);
    try {
        await roomService.enterRoom(stored.roomCode, stored.role === "host" ? "owner" : "guest", localDisplayName);
    } catch (error) {
        roomService.detach();
        throw new RestoreError(classifyRestoreFailure(error));
    }
    if (!isCurrentRestore(generation)) {
        roomService.detach();
        return;
    }
    saveSession({ ...stored, uid: firebase.user.uid, lastKnownStage: room.playback?.action === "ready-start" ? "active-room" : "lobby" });
    setupRoomControllers(stored.roomCode, stored.role === "host", generation);
    restoreCoordinator?.complete(generation);
}

async function maybeDelayRestore() {
    await localTestBridge?.beforeRestoreRead?.((reason) => new RestoreError(reason));
}

async function readRestorableRoom(session) {
    try {
        const snap = await firebase.db.get(roomService.roomRef(session.roomCode));
        if (!snap.exists()) throw new RestoreError(RESTORE_FAILURES.NOT_FOUND);
        return snap.val();
    } catch (error) {
        if (error instanceof RestoreError) throw error;
        const reason = classifyRestoreFailure(error);
        if (reason === RESTORE_FAILURES.PERMISSION_DENIED) throw new RestoreError(RESTORE_FAILURES.PERMISSION_DENIED);
        throw new RestoreError(reason);
    }
}

function validateRestoredMembership(room, session) {
    if (!room) throw new RestoreError(RESTORE_FAILURES.NOT_FOUND);
    if (room.status === "ended") throw new RestoreError(RESTORE_FAILURES.ENDED);
    if (room.status === "expired" || (room.expiresAt && room.expiresAt < Date.now())) throw new RestoreError(RESTORE_FAILURES.EXPIRED);
    const uid = firebase.user.uid;
    if (session.role === "host" && room.ownerUid !== uid) throw new RestoreError(RESTORE_FAILURES.ACCESS_LOST);
    if (session.role === "guest" && room.guestUid !== uid) throw new RestoreError(RESTORE_FAILURES.PERMISSION_DENIED);
}

function handleRestoreFailure(error, generation) {
    if (!restoreCoordinator?.isCurrent(generation)) return;
    cleanup();
    restoreCoordinator.complete(generation);
    const reason = classifyRestoreFailure(error);
    const terminal = !canRetryRestoreFailure(reason);
    if (terminal) clearSavedSession();
    if (reason === RESTORE_FAILURES.ENDED) {
        ui.setState(APP_STATES.ROOM_ENDED);
        return;
    }
    ui.showRestoreFailed({
        message: getRestoreFailureMessage(reason),
        canRetry: !terminal
    });
}

function isCurrentRestore(generation) {
    return restoreCoordinator?.isCurrent(generation) && !restoreCancelled;
}

function isRoomGenerationValid(generation) {
    return !restoreCancelled && generation === restoreCoordinator?.generation;
}

function setupRoomControllers(code, isOwner, generation = null) {
    roomEventGeneration = generation;
    const inviteLink = `${location.origin}/watch-party/?room=${code}`;
    ui.enterLobby(code, inviteLink, isOwner);
    syncController = new SyncController(ui.els.video, roomService, config);
    syncController.attach();
    voiceCall = new VoiceCall(roomService, config, ui.els.remoteAudio, localTestBridge?.getVoiceOptions?.());
    voiceCall.start().catch((error) => {
        safeLog("voice start failed", { error: error?.message || String(error) });
        ui.setVoiceStatus({ label: "اتصال صوتی برقرار نشد", failed: true, reconnectable: true });
    });
    chatController = new ChatController(roomService, config);
    chatController.listen();
    bindRoomEvents(generation);
    bindVideoBuffering();
    ui.banner("", false);
}

function bindRoomEvents(generation = null) {
    if (roomEventsBound) return;
    roomEventsBound = true;
    roomService.addEventListener("room", async (event) => {
        if (generation && !isRoomGenerationValid(generation)) return;
        currentRoom = event.detail;
        if (!currentRoom) {
            ui.toast(MESSAGES.roomNotFound, "error");
            return;
        }
        if (currentRoom.status === "ended") {
            ui.setState(APP_STATES.ROOM_ENDED);
            clearSavedSession();
            return;
        }
        ui.renderRoom(currentRoom, roomService.uid);
        const partner = Object.entries(currentRoom.participants || {}).find(([uid]) => uid !== roomService.uid)?.[1];
        voiceCall?.updateRoom(currentRoom);
        voiceCall?.setPartnerMicEnabled(Boolean(partner?.micEnabled));
        syncController.startHeartbeat(roomService.role === "owner" && ui.state === APP_STATES.ACTIVE_ROOM);
        await applyRoomMedia(currentRoom);
        if (!currentRoom) return;
        await applyReadyFlow(currentRoom);
        if (!currentRoom) return;
        await syncController.apply(currentRoom.playback, roomService.offsetMs);
        await syncController.resumeAfterBuffer(currentRoom);
        if (!currentRoom) return;
        if (currentRoom.playback?.action === "ready-start" || (!currentRoom.playback?.paused && ui.state === APP_STATES.LOBBY)) {
            ui.setState(APP_STATES.ACTIVE_ROOM);
            syncController.startHeartbeat(roomService.role === "owner");
        }
    });
    roomService.addEventListener("connection", (event) => {
        if (generation && !isRoomGenerationValid(generation)) return;
        ui.banner(event.detail === "online" ? "" : MESSAGES.reconnecting, event.detail !== "online");
    });
    roomService.addEventListener("roomError", (event) => {
        if (generation && !isRoomGenerationValid(generation)) return;
        if (restoreCoordinator?.active) {
            handleRestoreFailure(event.detail, generation);
            return;
        }
        handleRoomAccessLoss(event.detail);
    });
    syncController.addEventListener("autoplay", () => ui.showAutoplayOverlay());
    mediaController.addEventListener("error", (event) => ui.toast(event.detail || MESSAGES.network, "error"));
    mediaController.addEventListener("compatibilityNeeded", (event) => {
        const detail = event.detail || {};
        ui.toast(detail.gatewayAvailable ? `${detail.message} ${MESSAGES.gatewayOffer}` : detail.message, "error");
    });
    mediaController.addEventListener("audioStatus", (event) => {
        const message = event.detail?.message || "";
        ui.setMkvAudioStatus(message);
        if (event.detail?.diagnostics) ui.renderAudioTracks(event.detail.diagnostics);
    });
    mediaController.addEventListener("audioTracks", (event) => {
        ui.renderAudioTracks(event.detail);
        if (event.detail?.status === "unsupported") ui.toast(event.detail?.message || MESSAGES.mkvAudioUnsupported, "error");
    });
    voiceCall.addEventListener("userError", (event) => ui.toast(event.detail, "error"));
    voiceCall.addEventListener("remoteAudioBlocked", (event) => {
        ui.setVoiceStatus({ label: event.detail || MESSAGES.remoteAudioBlocked, remoteAudioBlocked: true });
    });
    voiceCall.addEventListener("status", (event) => {
        ui.setVoiceStatus(event.detail);
        ui.setMicState({ enabled: micEnabled, muted, label: event.detail?.label, busy: micOperationActive });
    });
    voiceCall.addEventListener("partnerStatus", (event) => ui.setVoicePartnerStatus(event.detail));
    chatController.addEventListener("messages", (event) => ui.renderMessages(event.detail));
    chatController.addEventListener("reaction", (event) => ui.showReaction(event.detail.emoji));
    ui.addEventListener("copyCode", copyCode);
    ui.addEventListener("copy", copyInvite);
    ui.addEventListener("share", shareInvite);
    ui.addEventListener("ready", async () => roomService.setReady(true));
    ui.addEventListener("continue", async () => {
        ui.hideAutoplayOverlay();
        try { await ui.els.video.play(); } catch {}
    });
    ui.addEventListener("voiceUnlock", async () => {
        const ok = await voiceCall?.unlockRemoteAudio();
        ui.setVoiceStatus({ label: ok ? "صدا: اتصال برقرار است" : MESSAGES.remoteAudioBlocked, remoteAudioBlocked: !ok });
    });
    ui.addEventListener("voiceReconnect", async () => {
        ui.setVoiceStatus({ label: "صدا: در حال اتصال دوباره", busy: true });
        await voiceCall?.reconnect?.();
    });
    ui.addEventListener("mediaChange", changeMedia);
    ui.addEventListener("subtitleChange", changeSubtitle);
    ui.addEventListener("restart", () => roomService.setPlaybackPatch({
        paused: true,
        pauseReason: "manual",
        currentTime: 0,
        playbackRate: ui.els.video.playbackRate || 1,
        action: "restart"
    }));
    ui.addEventListener("chat", async (event) => {
        if (await chatController.send(event.detail, localDisplayName)) ui.clearChatInput();
    });
    ui.addEventListener("reaction", (event) => chatController.react(event.detail));
    ui.addEventListener("mic", toggleMic);
    ui.addEventListener("mute", toggleMute);
    ui.addEventListener("movieVolume", (event) => {
        mediaController.setMovieVolume(event.detail);
        try { localStorage.setItem("watchPartyMovieVolume", String(event.detail)); } catch {}
    });
    ui.addEventListener("movieMute", (event) => {
        mediaController.setMovieMuted(event.detail);
        try { localStorage.setItem("watchPartyMovieMuted", event.detail ? "1" : "0"); } catch {}
    });
    ui.addEventListener("voiceVolume", (event) => {
        voiceCall?.setRemoteVolume(event.detail);
        try { localStorage.setItem("watchPartyVoiceVolume", String(event.detail)); } catch {}
    });
    ui.addEventListener("voiceMute", (event) => {
        voiceMuted = Boolean(event.detail);
        voiceCall?.setRemoteMuted(voiceMuted);
    });
    ui.addEventListener("audioTrackChange", async (event) => {
        try {
            await roomService.updateAudioTrack(event.detail);
            await mediaController.selectAudioTrack(event.detail);
        } catch (error) {
            ui.toast(error.message || "تغییر ترک صدا انجام نشد.", "error");
        }
    });
    ui.addEventListener("leave", () => leaveRoom({ redirect: true }));
    ui.addEventListener("end", endRoom);
    ui.addEventListener("subtitlePrefs", (event) => subtitleController.savePreferences(event.detail));
    window.addEventListener("beforeunload", cleanup, { once: true });
}

async function applyRoomMedia(room) {
    const playback = room.playback || {};
    const media = room.media || {};
    const nextMediaSignature = `${media.url || ""}:${media.audioTrackId || ""}`;
    if (media.url && nextMediaSignature !== mediaSignature) {
        mediaSignature = nextMediaSignature;
        try {
            await mediaController.load(media.url, playback.currentTime || 0, { audioTrackId: media.audioTrackId });
            ui.els.mediaUrl.value = media.url;
        } catch (error) {
            ui.toast(error.message || describeMediaError(ui.els.video), "error");
        }
    }
    const subtitle = room.subtitle || {};
    const signature = `${subtitle.mode || "none"}:${subtitle.url || ""}:${subtitle.fileName || ""}:${subtitle.updatedAt || ""}`;
    if (signature !== subtitleSignature) {
        subtitleSignature = signature;
        subtitleController.applySubtitle(subtitle);
        if (subtitle.url) {
            ui.els.subtitleUrl.value = subtitle.url;
            ui.els.activeSubtitleUrl.value = subtitle.url;
        }
    }
    const diagnostics = mediaController?.diagnostics?.mkvAudio;
    if (diagnostics) ui.renderAudioTracks(diagnostics);
}

async function applyReadyFlow(room) {
    const participants = Object.values(room.participants || {});
    const bothReady = participants.length === 2 && participants.every((p) => p.ready);
    if (!bothReady || ui.state !== APP_STATES.LOBBY) return;
    const token = ++countdownToken;
    ui.setState(APP_STATES.COUNTDOWN);
    for (let value = 3; value > 0; value -= 1) {
        if (token !== countdownToken) return;
        ui.setCountdown(value);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const latestParticipants = Object.values(currentRoom?.participants || {});
        if (!latestParticipants.every((p) => p.ready)) {
            ui.setState(APP_STATES.LOBBY);
            return;
        }
    }
    ui.setState(APP_STATES.ACTIVE_ROOM);
    if (roomService.role === "owner" && room.playback?.paused) {
        await roomService.setPlaybackPatch({
            paused: false,
            pauseReason: "playing",
            currentTime: room.playback.currentTime || 0,
            playbackRate: room.playback.playbackRate || 1,
            action: "ready-start"
        });
    }
}

function bindVideoBuffering() {
    if (videoBufferBound) return;
    videoBufferBound = true;
    const waiting = () => {
        clearTimeout(bufferTimer);
        bufferTimer = setTimeout(async () => {
            await roomService.updateParticipant({ buffering: true });
            if (currentRoom?.settings?.autoPauseOnBuffer) {
                ui.banner("در انتظار آماده شدن طرف مقابل");
                await syncController.requestBufferPause();
            }
        }, config.sync?.bufferDebounceMs || 1200);
    };
    const ready = () => {
        clearTimeout(bufferTimer);
        roomService.updateParticipant({ buffering: false }).catch(() => {});
        ui.banner("", false);
    };
    ["waiting", "stalled"].forEach((event) => ui.els.video.addEventListener(event, waiting));
    ["canplay", "playing"].forEach((event) => ui.els.video.addEventListener(event, ready));
    ui.els.video.addEventListener("error", () => ui.toast(describeMediaError(ui.els.video), "error"));
}

async function buildHostSubtitle(data) {
    const mode = data.get("subtitleMode") || "none";
    if (mode === "none") return null;
    if (mode === "file") {
        const file = data.get("subtitleFile");
        if (!(file instanceof File) || !file.size) return null;
        return subtitleController.fromFile(file);
    }
    const rawUrl = String(data.get("subtitleUrl") || "").trim();
    if (!rawUrl) return null;
    if (!isHttpsUrl(rawUrl)) throw new Error(MESSAGES.insecureUrl);
    return subtitleController.fromUrl(rawUrl);
}

async function buildSubtitle(url, file) {
    const subtitleFile = file instanceof File && file.size > 0 ? file : null;
    if (subtitleFile) return subtitleController.fromFile(subtitleFile);
    const rawUrl = String(url || "").trim();
    if (!rawUrl) return null;
    if (!isHttpsUrl(rawUrl)) throw new Error(MESSAGES.insecureUrl);
    return subtitleController.fromUrl(rawUrl);
}

function normalizeMediaUrl(raw) {
    const url = parseUrl(raw);
    if (!url) throw new Error(MESSAGES.invalidUrl);
    if (!isHttpsUrl(url.href)) throw new Error(MESSAGES.insecureUrl);
    return url.href;
}

async function changeMedia() {
    const ok = await ui.askConfirmation({
        title: "تغییر فیلم؟",
        text: "فیلم فعلی برای هر دو نفر جایگزین می‌شود.",
        confirmLabel: "تغییر فیلم"
    });
    if (!ok) return;
    try {
        await roomService.updateMedia(normalizeMediaUrl(ui.els.mediaUrl.value));
        ui.toast("لینک ویدیو به‌روزرسانی شد.");
    } catch (error) {
        ui.toast(error.message, "error");
    }
}

async function changeSubtitle() {
    try {
        const subtitle = await buildSubtitle(ui.els.subtitleUrl.value, ui.els.subtitleFile.files[0]);
        await roomService.updateSubtitle(subtitle || { mode: "none" });
        ui.toast("زیرنویس به‌روزرسانی شد.");
    } catch (error) {
        ui.toast(error.message, "error");
    }
}

async function copyCode() {
    await navigator.clipboard.writeText(ui.els.inviteCode.textContent);
    ui.toast("کد دعوت کپی شد.");
}

async function copyInvite() {
    await navigator.clipboard.writeText(ui.els.inviteLink.value);
    ui.toast("لینک دعوت کپی شد.");
}

async function shareInvite() {
    if (!navigator.share) return copyInvite();
    await navigator.share({ title: "تماشای دونفره فیری مووی", url: ui.els.inviteLink.value }).catch(() => {});
}

async function toggleMic() {
    if (micOperationActive || !voiceCall) return;
    micOperationActive = true;
    const nextEnabled = !micEnabled;
    ui.setMicState({
        enabled: micEnabled,
        muted,
        busy: true,
        label: nextEnabled ? "درخواست دسترسی..." : "در حال خاموش کردن میکروفن..."
    });
    try {
        if (nextEnabled) {
            const ok = await voiceCall.enableMicrophone();
            micEnabled = ok;
        } else {
            await voiceCall.disableMicrophone();
            micEnabled = false;
            muted = false;
        }
    } finally {
        micOperationActive = false;
        ui.setMicState({ enabled: micEnabled, muted, label: micEnabled ? "میکروفن روشن" : "میکروفن خاموش" });
    }
}

function toggleMute() {
    muted = !muted;
    voiceCall.setMuted(muted);
    ui.els.muteButton.textContent = muted ? "لغو بی‌صدا" : "بی‌صدا";
    ui.setMicState({ enabled: micEnabled, muted, label: muted ? "میکروفن بی‌صدا شد" : (micEnabled ? "میکروفن روشن" : "میکروفن خاموش") });
}

async function confirmLeave() {
    return ui.askConfirmation({
        title: "ترک اتاق؟",
        text: "از اتاق خارج می‌شوی و وضعیت حضور تو به‌روزرسانی می‌شود.",
        confirmLabel: "ترک اتاق"
    });
}

async function leaveRoom({ redirect }) {
    const ok = await confirmLeave();
    if (!ok) return;
    cleanup();
    await roomService?.leaveRoom();
    clearSavedSession();
    if (redirect) {
        cleanWatchPartyUrl();
        selectedRole = null;
        pendingGuestCode = "";
        ui.setSelectedRole(null);
        ui.setState(APP_STATES.WELCOME);
    }
}

async function endRoom() {
    const ok = await ui.askConfirmation({
        title: "پایان دادن به اتاق؟",
        text: "اتاق برای هر دو نفر بسته می‌شود و امکان بازگشت به آن وجود نخواهد داشت.",
        confirmLabel: "پایان اتاق"
    });
    if (!ok) return;
    cleanup();
    await roomService.endRoom();
    clearSavedSession();
    ui.setState(APP_STATES.ROOM_ENDED);
}

function cleanup() {
    operationController?.cancelAll();
    clearTimeout(bufferTimer);
    bufferTimer = null;
    countdownToken += 1;
    syncController?.destroy();
    voiceCall?.destroy();
    voiceCall = null;
    chatController?.destroy();
    subtitleController?.clear();
    mediaController?.destroySource();
    roomService?.detach();
    currentRoom = null;
    roomEventGeneration = null;
    roomEventsBound = false;
    videoBufferBound = false;
}

function cancelRestoreToWelcome() {
    restoreCancelled = true;
    restoreCoordinator?.cancel();
    cleanup();
    clearSavedSession();
    cleanWatchPartyUrl();
    restoreSessionCandidate = null;
    selectedRole = null;
    pendingGuestCode = "";
    createInFlight = false;
    joinInFlight = false;
    ui.clearFieldErrors();
    ui.setSelectedRole(null);
    ui.els.guestRoomCode.value = "";
    ui.els.invitationDetected.hidden = true;
    ui.setState(APP_STATES.WELCOME);
    ui.toast("بازیابی قبلی لغو شد");
}

function cleanWatchPartyUrl() {
    const url = new URL(location.href);
    ["room", "resetSession", "restore"].forEach((key) => url.searchParams.delete(key));
    const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}${url.hash || ""}`;
    history.replaceState(null, "", next);
}

function readPrefill() {
    const params = new URLSearchParams(location.search);
    let stored = {};
    try {
        stored = JSON.parse(sessionStorage.getItem("watchPartyPrefill") || "{}");
        sessionStorage.removeItem("watchPartyPrefill");
    } catch {}
    return {
        videoUrl: stored.videoUrl,
        subtitleUrl: stored.subtitleUrl,
        roomCode: params.get("room") || ""
    };
}

function saveSession(session) {
    return saveRoomSession({
        ...session,
        uid: session.uid || firebase?.user?.uid,
        savedAt: Date.now()
    });
}

function readSavedSession(options = {}) {
    const result = readStoredRoomSession({
        uid: options.uid || null,
        maxAgeMs: getMaxStoredSessionAgeMs()
    });
    return result.ok ? result.session : null;
}

function clearSavedSession() {
    clearStoredRoomSession();
}

function mapJoinError(error) {
    const message = error?.message || "";
    if (message === MESSAGES.invalidRoom) return "کد اتاق نامعتبر است";
    if (message === MESSAGES.roomNotFound) return "این اتاق پیدا نشد";
    if (message === MESSAGES.roomExpired) return "این اتاق منقضی شده است";
    if (message === MESSAGES.roomEnded) return "این اتاق پایان یافته است";
    if (message === MESSAGES.roomFull) return "ظرفیت اتاق تکمیل است";
    if (/network|fetch|offline|permission/i.test(message)) return "ارتباط با سرویس برقرار نشد";
    return message || "امکان ورود به اتاق وجود ندارد";
}

function showFatal(message) {
    ui.els.fatalErrorMessage.textContent = message;
    ui.setState(APP_STATES.ERROR);
}
