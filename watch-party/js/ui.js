import { APP_STATES, getVisibleScreenForState } from "./ui-state.js";
import { formatClock, normalizeRoomCode } from "./utils.js";
import { FULLSCREEN_CAPABILITY, FullscreenController } from "./fullscreen-controller.js";
import { getDeviceMediaProfile, summarizeDeviceMediaProfile } from "./device-media-profile.js";
import { formatSafeErrorReport } from "./user-errors.js";

export function qs(selector, root = document) {
    return root.querySelector(selector);
}

export function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

export class WatchPartyUI extends EventTarget {
    constructor() {
        super();
        this.state = APP_STATES.WELCOME;
        this.selectedRole = null;
        this.activeTab = "room";
        this.unreadChat = 0;
        this.confirmResolver = null;
        this.createSubmitLocked = false;
        this.joinSubmitLocked = false;
        this.els = this.collectElements();
        this.fullscreenController = new FullscreenController({
            wrapper: this.els.videoShell,
            video: this.els.video,
            controlsRoot: this.els.movieControls
        });
        this.bindStaticEvents();
        this.setState(APP_STATES.WELCOME);
        this.updateChatComposer();
    }

    collectElements() {
        return {
            screens: qsa(".app-screen"),
            topBanner: qs("#top-banner"),
            authMessage: qs("#auth-message"),
            authFailedMessage: qs("#auth-failed-message"),
            authFailedHelp: qs("#auth-failed-help"),
            authDiagnosticCode: qs("#auth-diagnostic-code"),
            authSafeReport: qs("#auth-safe-report"),
            authCopyReport: qs("#auth-copy-report"),
            authRetry: qs("#auth-retry"),
            authBack: qs("#auth-back"),
            hostProfileForm: qs("#host-profile-form"),
            hostDisplayName: qs("#host-display-name"),
            hostRememberName: qs("#host-remember-name"),
            hostNameError: qs("#host-name-error"),
            hostMediaForm: qs("#host-media-form"),
            hostVideoUrl: qs("#host-video-url"),
            hostSubtitleUrl: qs("#host-subtitle-url"),
            hostSubtitleFile: qs("#host-subtitle-file"),
            hostSubtitleUrlWrap: qs("#host-subtitle-url-wrap"),
            hostSubtitleFileWrap: qs("#host-subtitle-file-wrap"),
            hostVideoError: qs("#host-video-error"),
            hostSubtitleError: qs("#host-subtitle-error"),
            createButton: qs("#create-room-button"),
            guestCodeForm: qs("#guest-code-form"),
            guestRoomCode: qs("#guest-room-code"),
            guestCodeError: qs("#guest-code-error"),
            invitationDetected: qs("#invitation-detected"),
            checkCodeButton: qs("#check-code-button"),
            restoreStatusMessage: qs("#restore-status-message"),
            restoreFailedMessage: qs("#restore-failed-message"),
            restoreRetry: qs("#restore-retry"),
            restoreCancel: qs("#restore-cancel"),
            restoreRetryFailed: qs("#restore-retry-failed"),
            restoreCancelFailed: qs("#restore-cancel-failed"),
            serviceAuthStatus: qs("#service-auth-status"),
            serviceDatabaseStatus: qs("#service-database-status"),
            serviceMessage: qs("#service-message"),
            serviceCommandHint: qs("#service-command-hint"),
            serviceRetry: qs("#service-retry"),
            serviceBack: qs("#service-back"),
            guestProfileForm: qs("#guest-profile-form"),
            guestDisplayName: qs("#guest-display-name"),
            guestRememberName: qs("#guest-remember-name"),
            guestNameError: qs("#guest-name-error"),
            roomPreview: qs("#room-preview"),
            joinButton: qs("#join-room-button"),
            inviteCode: qs("#invite-code"),
            inviteQr: qs("#invite-qr"),
            activeInviteCode: qs("#active-invite-code"),
            inviteLink: qs("#invite-link"),
            lobbyMessage: qs("#lobby-message"),
            lobbyMediaState: qs("#lobby-media-state"),
            lobbySubtitleState: qs("#lobby-subtitle-state"),
            lobbyConnectionState: qs("#lobby-connection-state"),
            lobbyDeviceState: qs("#lobby-device-state"),
            lobbyFullscreenState: qs("#lobby-fullscreen-state"),
            lobbyPlaybackMode: qs("#lobby-playback-mode"),
            lobbyHostActions: qs("#lobby-host-actions"),
            participants: qs("#participants"),
            activeParticipants: qs("#active-participants"),
            readyButton: qs("#ready-button"),
            video: qs("#party-video"),
            videoShell: qs(".video-shell"),
            remoteAudio: qs("#remote-audio"),
            track: qs("#subtitle-track"),
            movieControls: qs("#movie-controls"),
            controlPlayPause: qs("#control-play-pause"),
            controlBack10: qs("#control-back-10"),
            controlForward10: qs("#control-forward-10"),
            controlTime: qs("#control-time"),
            controlSeek: qs("#control-seek"),
            seekPreview: qs("#seek-preview"),
            controlRate: qs("#control-rate"),
            controlSubtitleToggle: qs("#control-subtitle-toggle"),
            audioTrackWrap: qs("#audio-track-wrap"),
            controlAudioTrack: qs("#control-audio-track"),
            controlMovieVolume: qs("#control-movie-volume"),
            controlMovieMute: qs("#control-movie-mute"),
            playerMicButton: qs("#player-mic-button"),
            controlVoiceVolume: qs("#control-voice-volume"),
            controlVoiceMute: qs("#control-voice-mute"),
            controlFullscreen: qs("#control-fullscreen"),
            controlPip: qs("#control-pip"),
            syncStatus: qs("#sync-status"),
            mkvAudioStatus: qs("#mkv-audio-status"),
            statusBanner: qs("#status-banner"),
            reactionLayer: qs("#reaction-layer"),
            autoplayOverlay: qs("#autoplay-overlay"),
            countdown: qs("#countdown"),
            mediaUrl: qs("#media-url"),
            activeMediaUrl: qs("#active-media-url"),
            activeMediaSummary: qs("#active-media-summary"),
            activeMediaError: qs("#active-media-error"),
            activeMediaHostControls: qs("#active-media-host-controls"),
            subtitleUrl: qs("#subtitle-url"),
            subtitleFile: qs("#subtitle-file"),
            activeSubtitleUrl: qs("#active-subtitle-url"),
            localMicState: qs("#local-mic-state"),
            voiceStatus: qs("#voice-status"),
            voicePartnerStatus: qs("#voice-partner-status"),
            voiceUnlockButton: qs("#voice-unlock-button"),
            voiceReconnectButton: qs("#voice-reconnect-button"),
            micLevelBar: qs("#mic-level-bar"),
            micButton: qs("#mic-button"),
            muteButton: qs("#mute-button"),
            playbackState: qs("#playback-state"),
            partnerState: qs("#partner-state"),
            roomStatus: qs("#room-status"),
            chatMessages: qs("#chat-messages"),
            chatNewMessages: qs("#chat-new-messages"),
            chatForm: qs("#chat-form"),
            chatInput: qs("#chat-input"),
            chatSend: qs("[data-testid='chat-send']"),
            chatCount: qs("#chat-count"),
            chatUnread: qs("#chat-unread"),
            subtitleSourceState: qs("#subtitle-source-state"),
            activeSubtitleHostControls: qs("#active-subtitle-host-controls"),
            toastRoot: qs("#toast-root"),
            fatalErrorMessage: qs("#fatal-error-message"),
            dialog: qs("#confirm-dialog"),
            dialogTitle: qs("#dialog-title"),
            dialogText: qs("#dialog-text"),
            dialogCancel: qs("#dialog-cancel"),
            dialogConfirm: qs("#dialog-confirm")
        };
    }

    bindStaticEvents() {
        qs("#choose-host").addEventListener("click", () => this.dispatchEvent(new CustomEvent("selectRole", { detail: "host" })));
        qs("#choose-guest").addEventListener("click", () => this.dispatchEvent(new CustomEvent("selectRole", { detail: "guest" })));
        qsa("[data-action]").forEach((button) => {
            button.addEventListener("click", () => this.dispatchEvent(new CustomEvent("action", { detail: button.dataset.action })));
        });
        this.els.hostProfileForm.addEventListener("submit", (event) => {
            event.preventDefault();
            this.dispatchEvent(new CustomEvent("hostProfile", { detail: new FormData(this.els.hostProfileForm) }));
        });
        this.els.hostMediaForm.addEventListener("submit", (event) => {
            event.preventDefault();
            if (this.createSubmitLocked) return;
            this.createSubmitLocked = true;
            this.dispatchEvent(new CustomEvent("create", { detail: new FormData(this.els.hostMediaForm) }));
        });
        this.els.guestCodeForm.addEventListener("submit", (event) => {
            event.preventDefault();
            this.dispatchEvent(new CustomEvent("guestCode", { detail: new FormData(this.els.guestCodeForm) }));
        });
        this.els.guestProfileForm.addEventListener("submit", (event) => {
            event.preventDefault();
            if (this.joinSubmitLocked) return;
            this.joinSubmitLocked = true;
            this.dispatchEvent(new CustomEvent("join", { detail: new FormData(this.els.guestProfileForm) }));
        });
        this.els.guestRoomCode.addEventListener("input", () => {
            this.els.guestRoomCode.value = normalizeRoomCode(extractRoomCodeInput(this.els.guestRoomCode.value)).slice(0, 8);
        });
        this.els.restoreRetry.addEventListener("click", () => this.dispatchEvent(new CustomEvent("restoreRetry")));
        this.els.restoreRetryFailed.addEventListener("click", () => this.dispatchEvent(new CustomEvent("restoreRetry")));
        this.els.restoreCancel.addEventListener("click", () => this.dispatchEvent(new CustomEvent("restoreCancel")));
        this.els.restoreCancelFailed.addEventListener("click", () => this.dispatchEvent(new CustomEvent("restoreCancel")));
        this.els.authRetry.addEventListener("click", () => this.dispatchEvent(new CustomEvent("authRetry")));
        this.els.authBack.addEventListener("click", () => this.dispatchEvent(new CustomEvent("authBack")));
        this.els.authCopyReport?.addEventListener("click", async () => {
            await navigator.clipboard?.writeText?.(this.els.authSafeReport.textContent || "").catch(() => {});
            this.toast("اطلاعات امن خطا کپی شد.");
        });
        this.els.serviceRetry.addEventListener("click", () => this.dispatchEvent(new CustomEvent("serviceRetry")));
        this.els.serviceBack.addEventListener("click", () => this.dispatchEvent(new CustomEvent("serviceBack")));
        qsa("input[name='subtitleMode']").forEach((input) => {
            input.addEventListener("change", () => this.updateSubtitleMode(input.value));
        });
        qs("#copy-code").addEventListener("click", () => this.dispatchEvent(new CustomEvent("copyCode")));
        qs("#copy-link").addEventListener("click", () => this.dispatchEvent(new CustomEvent("copy")));
        qs("#share-link").addEventListener("click", () => this.dispatchEvent(new CustomEvent("share")));
        qs("#copy-link-active").addEventListener("click", () => this.dispatchEvent(new CustomEvent("copy")));
        this.els.readyButton.addEventListener("click", () => this.dispatchEvent(new CustomEvent("ready")));
        qs("#continue-button").addEventListener("click", () => this.dispatchEvent(new CustomEvent("continue")));
        qs("#change-media").addEventListener("click", () => this.dispatchEvent(new CustomEvent("mediaChange", { detail: { url: this.els.mediaUrl.value, source: "lobby" } })));
        qs("#active-change-media")?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("mediaChange", { detail: { url: this.els.activeMediaUrl.value, source: "settings" } })));
        qs("#change-subtitle").addEventListener("click", () => this.dispatchEvent(new CustomEvent("subtitleChange")));
        qs("#active-change-subtitle").addEventListener("click", () => {
            this.els.subtitleUrl.value = this.els.activeSubtitleUrl.value;
            this.dispatchEvent(new CustomEvent("subtitleChange"));
        });
        qs("#restart-button").addEventListener("click", () => this.dispatchEvent(new CustomEvent("restart")));
        qs("#fullscreen-button").addEventListener("click", () => this.enterFullscreen());
        qs("#pip-button").addEventListener("click", () => this.els.video.requestPictureInPicture?.());
        this.bindPlayerControls();
        qs("#leave-room").addEventListener("click", () => this.dispatchEvent(new CustomEvent("leave")));
        qs("#end-room").addEventListener("click", () => this.dispatchEvent(new CustomEvent("end")));
        qs("#end-room-lobby").addEventListener("click", () => this.dispatchEvent(new CustomEvent("end")));
        this.els.micButton.addEventListener("click", () => this.dispatchEvent(new CustomEvent("mic")));
        this.els.muteButton.addEventListener("click", () => this.dispatchEvent(new CustomEvent("mute")));
        this.els.voiceUnlockButton?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("voiceUnlock")));
        this.els.voiceReconnectButton?.addEventListener("click", () => this.dispatchEvent(new CustomEvent("voiceReconnect")));
        this.els.chatForm.addEventListener("submit", (event) => {
            event.preventDefault();
            if (!this.els.chatInput.value.trim()) {
                this.updateChatComposer();
                return;
            }
            this.dispatchEvent(new CustomEvent("chat", { detail: this.els.chatInput.value }));
        });
        this.els.chatInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !isMobileViewport()) {
                event.preventDefault();
                this.els.chatForm.requestSubmit();
            }
        });
        this.els.chatInput.addEventListener("input", () => this.updateChatComposer());
        this.els.chatMessages.addEventListener("scroll", () => {
            const atBottom = this.isChatAtBottom();
            if (atBottom) {
                this.els.chatNewMessages.hidden = true;
                this.dispatchEvent(new CustomEvent("chatViewed"));
            }
        });
        this.els.chatNewMessages?.addEventListener("click", () => {
            this.scrollChatToBottom();
            this.els.chatNewMessages.hidden = true;
            this.dispatchEvent(new CustomEvent("chatViewed"));
        });
        qsa("[data-reaction]").forEach((button) => {
            button.addEventListener("click", () => this.dispatchEvent(new CustomEvent("reaction", { detail: button.dataset.reaction })));
        });
        qsa("[data-subtitle-pref]").forEach((input) => {
            input.addEventListener("input", () => this.dispatchEvent(new CustomEvent("subtitlePrefs", { detail: this.getSubtitlePrefs() })));
        });
        qsa("[data-tab]").forEach((button) => {
            button.addEventListener("click", () => this.setActiveTab(button.dataset.tab));
        });
        this.els.dialogCancel.addEventListener("click", () => this.resolveDialog(false));
        this.els.dialogConfirm.addEventListener("click", () => this.resolveDialog(true));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !this.els.dialog.hidden) this.resolveDialog(false);
            this.handlePlayerShortcut(event);
        });
    }

    bindPlayerControls() {
        this.els.video.controls = false;
        this.els.controlPlayPause.addEventListener("click", () => this.togglePlayback());
        this.els.controlBack10.addEventListener("click", () => this.seekRelative(-10));
        this.els.controlForward10.addEventListener("click", () => this.seekRelative(10));
        this.els.controlRate.addEventListener("change", () => {
            this.els.video.playbackRate = Number(this.els.controlRate.value || 1);
        });
        this.els.controlSeek.addEventListener("input", () => {
            this.els.seekPreview.hidden = false;
            this.els.seekPreview.textContent = formatClock(Number(this.els.controlSeek.value || 0));
        });
        this.els.controlSeek.addEventListener("change", () => {
            this.els.video.currentTime = Number(this.els.controlSeek.value || 0);
            this.els.seekPreview.hidden = true;
        });
        this.els.controlSubtitleToggle.addEventListener("click", () => this.toggleSubtitleVisibility());
        this.els.controlAudioTrack.addEventListener("change", () => {
            this.dispatchEvent(new CustomEvent("audioTrackChange", { detail: this.els.controlAudioTrack.value }));
        });
        this.els.controlMovieVolume.addEventListener("input", () => {
            const volume = Number(this.els.controlMovieVolume.value || 0) / 100;
            this.dispatchEvent(new CustomEvent("movieVolume", { detail: volume }));
        });
        this.els.controlMovieMute.addEventListener("click", () => {
            const next = this.els.controlMovieMute.getAttribute("aria-pressed") !== "true";
            this.dispatchEvent(new CustomEvent("movieMute", { detail: next }));
            this.updateMovieMuteButton(next);
        });
        this.els.playerMicButton.addEventListener("click", () => this.dispatchEvent(new CustomEvent("mic")));
        this.els.controlVoiceVolume.addEventListener("input", () => {
            const volume = Number(this.els.controlVoiceVolume.value || 0) / 100;
            this.dispatchEvent(new CustomEvent("voiceVolume", { detail: volume }));
        });
        this.els.controlVoiceMute.addEventListener("click", () => {
            const next = this.els.controlVoiceMute.getAttribute("aria-pressed") !== "true";
            this.els.controlVoiceMute.setAttribute("aria-pressed", String(next));
            this.dispatchEvent(new CustomEvent("voiceMute", { detail: next }));
        });
        this.els.controlFullscreen.addEventListener("click", () => this.enterFullscreen());
        this.els.controlPip.addEventListener("click", () => this.els.video.requestPictureInPicture?.());
        ["loadedmetadata", "timeupdate", "durationchange", "play", "pause", "ratechange", "volumechange"].forEach((eventName) => {
            this.els.video.addEventListener(eventName, () => this.updatePlayerControls());
        });
        this.els.controlPip.hidden = !("pictureInPictureEnabled" in document);
        this.fullscreenController.addEventListener("change", (event) => this.updateFullscreenButton(event.detail));
        this.fullscreenController.addEventListener("unavailable", () => this.toast("تمام‌صفحه در این مرورگر در دسترس نیست.", "error"));
        this.bindTouchPlayerGestures();
        this.loadLocalControlPrefs();
        this.updatePlayerControls();
    }

    bindTouchPlayerGestures() {
        let lastTapAt = 0;
        let hideTimer = null;
        const reveal = () => {
            this.els.movieControls.classList.remove("controls-auto-hidden");
            clearTimeout(hideTimer);
            if (!this.els.video.paused) {
                hideTimer = setTimeout(() => this.els.movieControls.classList.add("controls-auto-hidden"), 3200);
            }
        };
        this.els.videoShell.addEventListener("pointerup", (event) => {
            if (event.target.closest?.("button,input,select")) return;
            const now = Date.now();
            const isDoubleTap = now - lastTapAt < 320;
            lastTapAt = now;
            reveal();
            if (!isDoubleTap) return;
            const rect = this.els.videoShell.getBoundingClientRect();
            const direction = event.clientX < rect.left + rect.width / 2 ? -10 : 10;
            this.seekRelative(direction);
        });
        this.els.video.addEventListener("play", reveal);
        this.els.video.addEventListener("pause", () => {
            clearTimeout(hideTimer);
            this.els.movieControls.classList.remove("controls-auto-hidden");
        });
    }

    setState(state, options = {}) {
        this.state = state;
        if (state === APP_STATES.HOST_MEDIA) this.createSubmitLocked = false;
        if (state === APP_STATES.GUEST_PROFILE) this.joinSubmitLocked = false;
        const visible = getVisibleScreenForState(state);
        this.els.screens.forEach((screen) => {
            screen.hidden = screen.dataset.screen !== visible;
        });
        document.body.dataset.wpState = state;
        this.els.createButton.disabled = state === APP_STATES.CREATING_ROOM;
        this.els.joinButton.disabled = state === APP_STATES.JOINING_ROOM;
        this.els.checkCodeButton.disabled = state === APP_STATES.JOINING_ROOM;
        if (state === APP_STATES.AUTHENTICATING) this.els.authRetry.disabled = true;
        else if (state !== APP_STATES.AUTH_FAILED) this.els.authRetry.disabled = false;
        this.els.serviceRetry.disabled = state === APP_STATES.AUTHENTICATING || state === APP_STATES.CREATING_ROOM || state === APP_STATES.JOINING_ROOM;
        const restoring = state === APP_STATES.RESTORING_ROOM;
        this.els.restoreRetry.disabled = restoring;
        this.els.restoreRetryFailed.disabled = restoring;
        this.els.createButton.textContent = state === APP_STATES.CREATING_ROOM ? "در حال ساخت اتاق..." : "ساخت اتاق";
        this.els.joinButton.textContent = state === APP_STATES.JOINING_ROOM ? "در حال ورود به اتاق..." : "ورود به اتاق";
        if (options.message) this.banner(options.message, true);
        if (state !== APP_STATES.ACTIVE_ROOM) this.hideAutoplayOverlay();
        if (state === APP_STATES.ACTIVE_ROOM) this.updatePlayerControls();
    }

    showRestoring({ attempt = 1, message = "لطفاً چند لحظه صبر کن." } = {}) {
        this.els.restoreStatusMessage.textContent = attempt > 1 ? `تلاش ${attempt}: ${message}` : message;
        this.els.restoreRetry.disabled = true;
        this.setState(APP_STATES.RESTORING_ROOM);
    }

    showRestoreFailed({ message, canRetry = true } = {}) {
        this.els.restoreFailedMessage.textContent = message || "بازیابی اتاق انجام نشد. ممکن است اتاق حذف شده باشد یا ارتباط موقتاً در دسترس نباشد.";
        this.setState(APP_STATES.RESTORE_FAILED);
        this.els.restoreRetryFailed.hidden = !canRetry;
        this.els.restoreRetryFailed.disabled = !canRetry;
    }

    showAuthFailure({ message, help = "", code, retryable = true, safeReport = null } = {}) {
        this.els.authFailedMessage.textContent = message || "ورود انجام نشد. لطفاً دوباره امتحان کنید.";
        this.els.authFailedHelp.textContent = help || "";
        this.els.authFailedHelp.hidden = !help;
        this.els.authDiagnosticCode.textContent = code || "AUTH-UNKNOWN";
        this.els.authSafeReport.textContent = formatSafeErrorReport(safeReport || { code });
        this.els.authRetry.disabled = !retryable;
        this.setState(APP_STATES.AUTH_FAILED);
    }

    showServiceUnavailable(status = {}, { production = false } = {}) {
        const available = "در دسترس";
        const unavailable = "در دسترس نیست";
        this.els.serviceAuthStatus.textContent = status.authAvailable ? available : unavailable;
        this.els.serviceDatabaseStatus.textContent = status.databaseAvailable ? available : unavailable;
        this.els.serviceMessage.textContent = production
            ? "سرویس اتاق موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید."
            : "برای ادامه، Emulator را اجرا کن و سپس دوباره بررسی کن.";
        this.els.serviceCommandHint.hidden = Boolean(production);
        this.setState(APP_STATES.SERVICE_UNAVAILABLE);
    }

    setSelectedRole(role) {
        this.selectedRole = role;
        this.els.lobbyHostActions.hidden = role !== "host";
        qs("#end-room").hidden = role !== "host";
        qs("#end-room-lobby").hidden = role !== "host";
        this.els.activeSubtitleHostControls.hidden = role !== "host";
        if (this.els.activeMediaHostControls) this.els.activeMediaHostControls.hidden = role !== "host";
    }

    prefill({ videoUrl, subtitleUrl, roomCode }) {
        if (videoUrl) {
            this.els.hostVideoUrl.value = videoUrl;
            this.els.mediaUrl.value = videoUrl;
        }
        if (subtitleUrl) {
            qsa("input[name='subtitleMode']").find((input) => input.value === "url").checked = true;
            this.updateSubtitleMode("url");
            this.els.hostSubtitleUrl.value = subtitleUrl;
            this.els.subtitleUrl.value = subtitleUrl;
            this.els.activeSubtitleUrl.value = subtitleUrl;
        }
        if (roomCode) {
            this.els.guestRoomCode.value = normalizeRoomCode(roomCode);
            this.els.invitationDetected.hidden = false;
        }
    }

    updateSubtitleMode(mode) {
        this.els.hostSubtitleUrlWrap.hidden = mode !== "url";
        this.els.hostSubtitleFileWrap.hidden = mode !== "file";
    }

    setFieldError(id, message = "") {
        const el = this.els[id] || qs(`#${id}`);
        if (el) el.textContent = message;
    }

    clearFieldErrors() {
        ["hostNameError", "hostVideoError", "hostSubtitleError", "guestCodeError", "guestNameError"].forEach((id) => this.setFieldError(id, ""));
    }

    loadRememberedName() {
        try {
            const name = localStorage.getItem("watchPartyDisplayName") || "";
            this.els.hostDisplayName.value ||= name;
            this.els.guestDisplayName.value ||= name;
        } catch {}
    }

    saveRememberedName(name, remember) {
        if (!remember) return;
        localStorage.setItem("watchPartyDisplayName", name);
    }

    enterLobby(code, link, isOwner) {
        this.setSelectedRole(isOwner ? "host" : "guest");
        this.els.inviteCode.textContent = code;
        this.els.activeInviteCode.textContent = code;
        this.els.inviteLink.value = link;
        this.renderDevicePreflight();
        this.renderInviteQr(link);
        this.setState(APP_STATES.LOBBY);
    }

    renderDevicePreflight() {
        const profile = getDeviceMediaProfile({ video: this.els.video, wrapper: this.els.videoShell });
        const summary = summarizeDeviceMediaProfile(profile);
        this.els.lobbyDeviceState.textContent = summary.video;
        this.els.lobbyFullscreenState.textContent = summary.fullscreen;
        this.els.lobbyPlaybackMode.textContent = profile.recommendedStrategy === "direct-first-gateway-if-configured" ? "مستقیم / سازگار" : "مستقیم";
    }

    async renderInviteQr(link) {
        const canvas = this.els.inviteQr;
        if (!canvas || !link) return;
        try {
            await ensureQrLibrary();
            const qr = globalThis.qrcode(0, "M");
            qr.addData(link);
            qr.make();
            const ctx = canvas.getContext("2d");
            const modules = qr.getModuleCount();
            const size = canvas.width;
            const cell = Math.floor(size / modules);
            const offset = Math.floor((size - cell * modules) / 2);
            ctx.fillStyle = "#f8fafc";
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = "#111827";
            for (let row = 0; row < modules; row += 1) {
                for (let col = 0; col < modules; col += 1) {
                    if (qr.isDark(row, col)) ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
                }
            }
        } catch {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    renderRoom(room, uid) {
        if (!room) return;
        if (room.status === "ended") {
            this.setState(APP_STATES.ROOM_ENDED);
            return;
        }
        this.els.roomStatus.textContent = room.status === "open" ? "فعال" : room.status;
        const participants = Object.entries(room.participants || {});
        this.renderParticipants(this.els.participants, participants, uid, room);
        this.renderParticipants(this.els.activeParticipants, participants, uid, room);
        const partner = participants.find(([id]) => id !== uid)?.[1];
        this.els.partnerState.textContent = partner ? `${partner.online ? "آنلاین" : "آفلاین"} · ${partner.buffering ? "در حال بافر" : "آماده"}` : "در انتظار نفر دوم";
        this.els.lobbyMessage.textContent = this.getLobbyMessage(participants);
        this.els.lobbyMediaState.textContent = room.media?.url ? "انتخاب شده" : "نامشخص";
        this.els.lobbySubtitleState.textContent = room.subtitle?.mode && room.subtitle.mode !== "none" ? "فعال" : "بدون زیرنویس";
        this.els.lobbyConnectionState.textContent = "اتصال برقرار است";
        this.els.subtitleSourceState.textContent = room.subtitle?.mode && room.subtitle.mode !== "none" ? (room.subtitle.fileName || room.subtitle.url || "زیرنویس فعال") : "بدون زیرنویس";
        if (room.media?.url) {
            this.els.activeMediaUrl.value = room.media.url;
            this.els.activeMediaSummary.textContent = summarizeUrl(room.media.url);
        } else {
            this.els.activeMediaSummary.textContent = "منبعی انتخاب نشده است";
        }
        const self = participants.find(([id]) => id === uid)?.[1];
        this.els.readyButton.textContent = self?.ready ? "آماده هستم" : "آماده‌ام";
        this.els.readyButton.classList.toggle("is-ready", Boolean(self?.ready));
        const playback = room.playback;
        if (playback) this.els.playbackState.textContent = `${playback.paused ? "مکث" : "پخش"} · ${formatClock(playback.currentTime)} · ${playback.playbackRate || 1}x`;
        if (playback) this.els.syncStatus.textContent = playback.paused ? "مکث مشترک" : "همگام";
        if (room.media?.url) this.els.mediaUrl.value = room.media.url;
    }

    renderParticipants(target, participants, uid, room = {}) {
        target.textContent = "";
        const byUid = new Map(participants);
        const byRole = [
            room.ownerUid ? [room.ownerUid, byUid.get(room.ownerUid)] : participants.find(([, p]) => p.role === "owner"),
            room.guestUid ? [room.guestUid, byUid.get(room.guestUid)] : null
        ];
        byRole.forEach((entry, index) => {
            const item = document.createElement("li");
            item.className = "participant";
            item.dataset.testid = index === 0 ? "participant-owner" : "participant-guest";
            const title = document.createElement("strong");
            const participant = entry?.[1];
            title.textContent = participant ? `${participant.displayName || "مهمان"}${entry[0] === uid ? " (شما)" : ""}` : (index === 0 ? "سازنده" : "مهمان");
            const status = document.createElement("span");
            status.textContent = participant ? [
                participant.online ? "آنلاین" : "آفلاین",
                participant.ready ? "آماده" : "ناآماده",
                participant.micEnabled ? "میکروفن روشن" : "میکروفن خاموش",
                participant.connectionState || ""
            ].filter(Boolean).join(" · ") : "در انتظار ورود";
            item.append(title, status);
            target.append(item);
        });
    }

    getLobbyMessage(participants) {
        if (participants.length < 2) return this.selectedRole === "host" ? "منتظر ورود همراهت هستیم..." : "با موفقیت وارد اتاق شدی";
        return "هر دو نفر وارد اتاق شده‌اند";
    }

    renderMessages(messages, { currentUid = "", participants = {} } = {}) {
        const wasChatClosed = this.activeTab !== "chat" && this.state === APP_STATES.ACTIVE_ROOM;
        const wasAtBottom = this.isChatAtBottom();
        this.els.chatMessages.textContent = "";
        if (!messages.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state chat-empty";
            const title = document.createElement("strong");
            title.textContent = "هنوز پیامی رد و بدل نشده.";
            const note = document.createElement("span");
            note.textContent = "گفتگو فقط تا پایان این اتاق باقی می‌ماند.";
            empty.append(title, note);
            this.els.chatMessages.append(empty);
        }
        let previous = null;
        messages.forEach((message) => {
            const mine = message.uid === currentUid;
            const grouped = previous && previous.uid === message.uid && Math.abs(Number(message.createdAt || 0) - Number(previous.createdAt || 0)) < 120000;
            const row = document.createElement("div");
            row.className = `chat-message ${mine ? "is-own" : "is-partner"} ${grouped ? "is-grouped" : ""}`;
            if (!mine && !grouped) {
                const sender = document.createElement("div");
                sender.className = "chat-sender";
                sender.textContent = message.displayName || participants[message.uid]?.displayName || "مهمان";
                row.append(sender);
            }
            const bubble = document.createElement("div");
            bubble.className = "chat-bubble";
            const text = document.createElement("p");
            text.textContent = message.text || "";
            bubble.append(text);
            const meta = document.createElement("div");
            meta.className = "chat-meta";
            const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) : "";
            const partner = Object.entries(participants || {}).find(([uid]) => uid !== currentUid)?.[1];
            const seen = mine && Number(partner?.chatReadAt || 0) >= Number(message.createdAt || 0);
            meta.textContent = mine ? `${time} · ${seen ? "دیده شد" : "ارسال شد"}` : time;
            meta.setAttribute("aria-label", mine ? (seen ? "پیام دیده شد" : "پیام ارسال شد") : "زمان پیام");
            bubble.append(meta);
            row.append(bubble);
            this.els.chatMessages.append(row);
            previous = message;
        });
        if (wasChatClosed && messages.length) this.setUnread(this.unreadChat + 1);
        if (this.activeTab === "chat" && (wasAtBottom || !messages.length)) {
            this.scrollChatToBottom();
            this.els.chatNewMessages.hidden = true;
        } else if (this.activeTab === "chat" && messages.length && !wasAtBottom) {
            this.els.chatNewMessages.hidden = false;
        }
    }

    setActiveTab(tab) {
        this.activeTab = tab;
        qsa("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
        qsa(".side-tab-panel").forEach((panel) => {
            panel.hidden = panel.id !== `tab-${tab}`;
        });
        if (tab === "chat") {
            this.setUnread(0);
            this.scrollChatToBottom();
            this.els.chatNewMessages.hidden = true;
            this.dispatchEvent(new CustomEvent("chatViewed"));
        }
    }

    setUnread(count) {
        this.unreadChat = count;
        this.els.chatUnread.hidden = count <= 0;
        this.els.chatUnread.textContent = String(count);
    }

    clearChatInput() {
        this.els.chatInput.value = "";
        this.updateChatComposer();
    }

    showReaction(detail) {
        const payload = typeof detail === "string" ? { emoji: detail, displayName: "" } : detail || {};
        const span = document.createElement("span");
        span.className = "reaction-float";
        span.style.left = `${20 + Math.random() * 60}%`;
        const emoji = document.createElement("strong");
        emoji.textContent = payload.emoji || "";
        const name = document.createElement("small");
        name.textContent = String(payload.displayName || "").slice(0, 32);
        span.append(emoji, name);
        this.els.reactionLayer.append(span);
        span.addEventListener("animationend", () => span.remove(), { once: true });
        setTimeout(() => span.remove(), 2400);
    }

    isChatAtBottom() {
        const el = this.els.chatMessages;
        if (!el) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    }

    scrollChatToBottom() {
        const el = this.els.chatMessages;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }

    updateChatComposer() {
        const input = this.els.chatInput;
        if (!input) return;
        const minHeight = isMobileViewport() ? 54 : 56;
        const maxHeight = isMobileViewport() ? 136 : 146;
        input.style.height = "auto";
        const nextHeight = Math.min(maxHeight, Math.max(minHeight, input.scrollHeight));
        input.style.height = `${nextHeight}px`;
        input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
        const length = input.value.length;
        if (this.els.chatSend) this.els.chatSend.disabled = input.value.trim().length === 0;
        if (!this.els.chatCount) return;
        this.els.chatCount.textContent = `${length} / 500`;
        this.els.chatCount.classList.toggle("is-warning", length >= 400 && length < 500);
        this.els.chatCount.classList.toggle("is-limit", length >= 500);
    }

    toast(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.els.toastRoot.append(toast);
        setTimeout(() => toast.remove(), 4200);
    }

    banner(message, show = true) {
        const target = this.state === APP_STATES.ACTIVE_ROOM ? this.els.statusBanner : this.els.topBanner;
        target.hidden = !show;
        target.textContent = message;
    }

    showAutoplayOverlay() {
        this.els.autoplayOverlay.hidden = false;
    }

    hideAutoplayOverlay() {
        this.els.autoplayOverlay.hidden = true;
    }

    setCountdown(value) {
        this.els.countdown.textContent = String(value);
    }

    async askConfirmation({ title, text, confirmLabel = "تأیید" }) {
        this.els.dialogTitle.textContent = title;
        this.els.dialogText.textContent = text;
        this.els.dialogConfirm.textContent = confirmLabel;
        this.els.dialog.hidden = false;
        this.els.dialogConfirm.focus();
        return new Promise((resolve) => {
            this.confirmResolver = resolve;
        });
    }

    resolveDialog(value) {
        this.els.dialog.hidden = true;
        this.confirmResolver?.(value);
        this.confirmResolver = null;
    }

    getSubtitlePrefs() {
        return {
            fontSize: Number(qs("#caption-size").value),
            color: qs("#caption-color").value,
            bgOpacity: Number(qs("#caption-bg").value),
            vertical: Number(qs("#caption-position").value)
        };
    }

    togglePlayback() {
        if (this.els.video.paused) {
            this.els.video.play().catch(() => this.showAutoplayOverlay());
        } else {
            this.els.video.pause();
        }
    }

    seekRelative(seconds) {
        const duration = Number.isFinite(this.els.video.duration) ? this.els.video.duration : Infinity;
        this.els.video.currentTime = Math.max(0, Math.min(duration, (this.els.video.currentTime || 0) + seconds));
    }

    toggleSubtitleVisibility() {
        const track = this.els.video.textTracks?.[0];
        if (!track) return;
        const nextShowing = track.mode !== "showing";
        track.mode = nextShowing ? "showing" : "disabled";
        this.els.controlSubtitleToggle.setAttribute("aria-pressed", String(nextShowing));
    }

    updatePlayerControls() {
        const video = this.els.video;
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        this.els.controlTime.textContent = `${formatClock(current)} / ${formatClock(duration)}`;
        this.els.controlSeek.max = String(duration || 0);
        if (document.activeElement !== this.els.controlSeek) this.els.controlSeek.value = String(current || 0);
        const paused = video.paused;
        this.els.controlPlayPause.setAttribute("aria-pressed", String(!paused));
        this.els.controlPlayPause.setAttribute("aria-label", paused ? "پخش" : "مکث");
        this.els.controlPlayPause.querySelector("i").className = paused ? "fas fa-play" : "fas fa-pause";
        this.els.controlPlayPause.querySelector("span").textContent = paused ? "پخش" : "مکث";
        this.els.controlRate.value = String(video.playbackRate || 1);
        this.els.controlMovieVolume.value = String(Math.round((video.volume ?? 1) * 100));
        this.updateMovieMuteButton(video.muted);
    }

    updateMovieMuteButton(muted) {
        this.els.controlMovieMute.setAttribute("aria-pressed", String(Boolean(muted)));
        this.els.controlMovieMute.querySelector("i").className = muted ? "fas fa-volume-xmark" : "fas fa-volume-high";
    }

    renderAudioTracks(diagnostics = {}) {
        const tracks = diagnostics.tracks || [];
        this.els.audioTrackWrap.hidden = tracks.length <= 1;
        this.els.controlAudioTrack.textContent = "";
        tracks.forEach((track) => {
            const option = document.createElement("option");
            option.value = String(track.id);
            option.textContent = formatAudioTrackLabel(track);
            option.disabled = !track.supported;
            option.selected = String(track.id) === String(diagnostics.selectedTrackId);
            this.els.controlAudioTrack.append(option);
        });
    }

    setMkvAudioStatus(message = "") {
        this.els.mkvAudioStatus.textContent = message || "";
    }

    setMicState({ enabled = false, muted = false, label = "", busy = false } = {}) {
        const text = label || (enabled ? "میکروفن روشن" : "میکروفن خاموش");
        this.els.localMicState.textContent = text;
        this.els.micButton.textContent = busy ? "لطفاً صبر کنید..." : (enabled ? "خاموش کردن میکروفن" : "فعال‌کردن میکروفن");
        this.els.playerMicButton.textContent = "";
        this.els.playerMicButton.append(makeIcon(enabled ? "fa-microphone" : "fa-microphone-slash"), document.createTextNode(busy ? " در حال آماده‌سازی" : (enabled ? " روشن" : " میکروفن")));
        [this.els.micButton, this.els.playerMicButton].forEach((button) => {
            button.setAttribute("aria-pressed", String(Boolean(enabled && !muted)));
            button.setAttribute("aria-label", text);
            button.disabled = Boolean(busy);
        });
        this.els.muteButton.disabled = !enabled || Boolean(busy);
        if (this.els.micLevelBar) this.els.micLevelBar.style.transform = `scaleX(${enabled && !muted ? 0.68 : 0.08})`;
    }

    setVoiceStatus({ label = "", remoteAudioBlocked = false, failed = false, reconnectable = false, busy = false } = {}) {
        const text = label || "صدا: منتظر همراه";
        if (this.els.voiceStatus) this.els.voiceStatus.textContent = text;
        if (this.els.voiceUnlockButton) this.els.voiceUnlockButton.hidden = !remoteAudioBlocked;
        if (this.els.voiceReconnectButton) {
            this.els.voiceReconnectButton.hidden = !(failed || reconnectable);
            this.els.voiceReconnectButton.disabled = Boolean(busy);
        }
    }

    setVoicePartnerStatus(message = "") {
        if (this.els.voicePartnerStatus) this.els.voicePartnerStatus.textContent = message || "میکروفن همراه خاموش است";
    }

    loadLocalControlPrefs() {
        try {
            const movieVolume = Number(localStorage.getItem("watchPartyMovieVolume"));
            if (Number.isFinite(movieVolume)) {
                this.els.video.volume = Math.min(1, Math.max(0, movieVolume));
                this.els.controlMovieVolume.value = String(Math.round(this.els.video.volume * 100));
            }
            const voiceVolume = Number(localStorage.getItem("watchPartyVoiceVolume"));
            if (Number.isFinite(voiceVolume)) this.els.controlVoiceVolume.value = String(Math.round(Math.min(1, Math.max(0, voiceVolume)) * 100));
        } catch {}
    }

    handlePlayerShortcut(event) {
        if (this.state !== APP_STATES.ACTIVE_ROOM || isTypingTarget(event.target)) return;
        const key = event.key.toLowerCase();
        if (key === " ") {
            event.preventDefault();
            this.togglePlayback();
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            this.seekRelative(event.shiftKey ? -10 : -5);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            this.seekRelative(event.shiftKey ? 10 : 5);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            this.els.video.volume = Math.min(1, (this.els.video.volume || 0) + 0.05);
            this.dispatchEvent(new CustomEvent("movieVolume", { detail: this.els.video.volume }));
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            this.els.video.volume = Math.max(0, (this.els.video.volume || 0) - 0.05);
            this.dispatchEvent(new CustomEvent("movieVolume", { detail: this.els.video.volume }));
        } else if (key === "m") {
            event.preventDefault();
            this.dispatchEvent(new CustomEvent("movieMute", { detail: !this.els.video.muted }));
        } else if (key === "c") {
            event.preventDefault();
            this.toggleSubtitleVisibility();
        } else if (key === "f") {
            event.preventDefault();
            this.enterFullscreen();
        } else if (key === "p") {
            event.preventDefault();
            this.els.video.requestPictureInPicture?.();
        }
    }

    enterFullscreen() {
        const capability = this.fullscreenController.getCapability();
        const didStart = this.fullscreenController.enterFromUserGesture();
        if (didStart && capability === FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE) {
            this.toast("حالت سینمایی فعال شد.");
        }
    }

    updateFullscreenButton({ mode, active }) {
        const label = mode === FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE ? "حالت سینمایی" : "تمام صفحه";
        [this.els.controlFullscreen, qs("#fullscreen-button")].forEach((button) => {
            if (!button) return;
            button.setAttribute("aria-pressed", String(Boolean(active)));
            button.setAttribute("aria-label", active ? `خروج از ${label}` : label);
            const span = button.querySelector("span");
            if (span) {
                span.textContent = active ? "خروج" : label;
            } else {
                button.textContent = active ? `خروج از ${label}` : label;
            }
        });
    }
}

function extractRoomCodeInput(value) {
    const raw = String(value || "").trim();
    try {
        const url = new URL(raw);
        return url.searchParams.get("room") || raw;
    } catch {
        return raw;
    }
}

function formatAudioTrackLabel(track) {
    const language = track.language && track.language !== "und" ? track.language : "صدا";
    const codec = String(track.codec || track.internalCodecId || "ناشناخته").toUpperCase();
    const channels = track.channelCount ? `${track.channelCount} کانال` : "کانال نامشخص";
    return `${track.title || language} — ${codec} — ${channels}`;
}

function summarizeUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname);
        return `${url.hostname} · ${fileName}`.slice(0, 96);
    } catch {
        return "منبع انتخاب شده";
    }
}

function isMobileViewport() {
    return globalThis.matchMedia?.("(max-width: 720px)")?.matches || false;
}

function makeIcon(iconClass) {
    const icon = document.createElement("i");
    icon.className = `fas ${iconClass}`;
    icon.setAttribute("aria-hidden", "true");
    return icon;
}

function ensureQrLibrary() {
    if (globalThis.qrcode) return Promise.resolve();
    if (globalThis.__watchPartyQrLoading) return globalThis.__watchPartyQrLoading;
    globalThis.__watchPartyQrLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
        script.crossOrigin = "anonymous";
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
    });
    return globalThis.__watchPartyQrLoading;
}

function isTypingTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}
