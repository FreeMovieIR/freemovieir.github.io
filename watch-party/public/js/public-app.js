import { getPublicRoomCapabilities } from "./public-room-capabilities.js";
import { getPublicRoomErrorMessage, PUBLIC_ROOM_ERROR_CODES, PublicRoomError } from "./public-room-errors.js";
import { PublicRoomService, loadPublicRoomConfig } from "./public-room-service.js";
import {
    PUBLIC_ALLOWED_REACTIONS,
    PUBLIC_APP_STATES,
    PUBLIC_ROOM_STATUSES,
    formatPublicClock,
    formatRelativeAge,
    formatSlowModeLabel,
    isPublicRoomJoinable,
    isValidPublicRoomId,
    normalizePublicRoomId,
    sanitizePublicMessage,
    sanitizePublicText,
    toPersianDigits
} from "./public-room-state.js";
import { expectedPublicPlaybackTime } from "./public-room-media-sync.js";
import { NoopPublicVoiceProvider } from "./voice/noop-public-voice-provider.js";

const MESSAGE_GROUP_MS = 2 * 60 * 1000;

const state = {
    appState: PUBLIC_APP_STATES.LOADING,
    config: null,
    service: null,
    voice: new NoopPublicVoiceProvider(),
    directory: [],
    directoryLoaded: false,
    directoryFilter: "all",
    directoryLanguage: "all",
    directorySort: "newest",
    preview: null,
    currentRoom: null,
    currentUid: "",
    role: "",
    activeSocialTab: "chat",
    applyingRemote: false,
    mediaUrl: "",
    chatAutoScroll: true,
    unreadMessages: 0,
    knownMessageIds: new Set(),
    shownReactionIds: new Set(),
    isComposing: false,
    searchTimer: null,
    createPending: false,
    joinPending: false,
    mediaPending: false
};

const els = {};
collectElements();
bindUi();
init().catch((error) => showError(error));

async function init() {
    setState(PUBLIC_APP_STATES.LOADING);
    state.config = await loadPublicRoomConfig();
    if (!state.config?.publicRooms?.enabled) {
        showUnavailable("سینمای عمومی هنوز برای نسخه اصلی فعال نشده است.");
        return;
    }
    if (state.config?.publicRooms?.maintenance) {
        showUnavailable("سینمای عمومی موقتاً در دسترس نیست.");
        return;
    }
    state.service = await PublicRoomService.create(state.config);
    state.service.addEventListener("error", (event) => showError(event.detail));
    await state.service.ensureAuth();
    state.currentUid = state.service.user.uid;
    state.service.listenDirectory((rooms) => {
        state.directory = rooms;
        state.directoryLoaded = true;
        els.directoryLoading.hidden = true;
        renderDirectory();
    });
    renderReactionPicker();
    const roomParam = normalizePublicRoomId(new URLSearchParams(location.search).get("room") || "");
    if (isValidPublicRoomId(roomParam)) {
        await openPreview(roomParam);
        return;
    }
    renderCreationAvailability();
    setState(PUBLIC_APP_STATES.DIRECTORY);
}

function collectElements() {
    for (const id of [
        "state-loading", "state-unavailable", "state-directory", "state-create", "state-preview", "state-room", "state-ended",
        "open-create", "directory-live-count", "directory-search", "directory-filter", "directory-language", "directory-sort", "only-joinable", "directory-loading", "directory-empty", "directory-list",
        "create-form", "create-display-name", "create-room-name", "create-movie-title", "create-media-url", "create-capacity", "create-language", "create-error", "create-submit",
        "join-form", "join-display-name", "join-error", "join-submit", "preview-room-name", "preview-details",
        "room-status", "room-title", "room-subtitle", "room-count", "host-disconnected", "public-video", "guest-control-note", "media-sync-state", "member-list", "host-actions", "guest-actions", "toggle-lock", "end-room", "leave-room", "leave-room-panel",
        "room-facts", "open-host-controls", "host-control-dialog", "close-host-controls", "host-media-form", "host-movie-title", "host-media-url", "host-media-error", "host-media-submit",
        "tab-chat-button", "tab-members-button", "tab-room-button", "social-chat-panel", "social-members-panel", "social-room-panel",
        "public-reaction-layer", "public-chat-list", "public-new-messages", "public-chat-disabled", "public-chat-form", "public-chat-input", "public-chat-meta", "public-chat-send", "public-chat-error", "public-reaction-button", "reaction-picker",
        "social-settings", "social-chat-enabled", "social-slow-mode", "social-reactions-enabled",
        "confirm-dialog", "confirm-title", "confirm-text", "confirm-cancel", "confirm-ok", "ended-title", "ended-message", "toast"
    ]) {
        els[toCamel(id)] = document.getElementById(id);
    }
}

function bindUi() {
    els.openCreate.addEventListener("click", () => openCreateState());
    document.addEventListener("click", async (event) => {
        const action = event.target?.dataset?.action;
        if (action === "directory") await goDirectory();
        if (action === "create") openCreateState();
    });
    els.directorySearch.addEventListener("input", () => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(renderDirectory, 220);
    });
    els.directoryFilter.addEventListener("click", (event) => {
        const filter = event.target?.dataset?.filter;
        if (!filter) return;
        state.directoryFilter = filter;
        for (const button of els.directoryFilter.querySelectorAll("button")) button.classList.toggle("is-active", button.dataset.filter === filter);
        renderDirectory();
    });
    els.directoryLanguage.addEventListener("change", () => {
        state.directoryLanguage = els.directoryLanguage.value;
        renderDirectory();
    });
    els.directorySort.addEventListener("change", () => {
        state.directorySort = els.directorySort.value;
        renderDirectory();
    });
    els.onlyJoinable.addEventListener("change", () => {
        state.directoryFilter = els.onlyJoinable.checked ? "joinable" : "all";
        for (const button of els.directoryFilter.querySelectorAll("button")) button.classList.toggle("is-active", button.dataset.filter === state.directoryFilter);
        renderDirectory();
    });
    els.createForm.addEventListener("submit", createRoom);
    els.joinForm.addEventListener("submit", joinPreviewRoom);
    els.toggleLock.addEventListener("click", toggleLock);
    els.endRoom.addEventListener("click", endRoom);
    els.leaveRoom.addEventListener("click", leaveRoom);
    els.leaveRoomPanel?.addEventListener("click", leaveRoom);
    els.openHostControls?.addEventListener("click", openHostControls);
    els.closeHostControls?.addEventListener("click", closeHostControls);
    els.hostMediaForm?.addEventListener("submit", updateHostMedia);
    els.hostControlDialog?.addEventListener("cancel", () => closeHostControls());
    for (const button of [els.tabChatButton, els.tabMembersButton, els.tabRoomButton]) {
        button?.addEventListener("click", () => setSocialTab(button.dataset.publicTab));
    }
    els.publicVideo.addEventListener("play", () => hostPlayback("play"));
    els.publicVideo.addEventListener("pause", () => hostPlayback("pause"));
    els.publicVideo.addEventListener("seeked", () => hostPlayback("seek"));
    els.publicVideo.addEventListener("ratechange", () => hostPlayback("rate"));
    els.publicChatForm.addEventListener("submit", sendChatMessage);
    els.publicChatInput.addEventListener("input", updateComposer);
    els.publicChatInput.addEventListener("compositionstart", () => { state.isComposing = true; });
    els.publicChatInput.addEventListener("compositionend", () => { state.isComposing = false; });
    els.publicChatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !state.isComposing) {
            event.preventDefault();
            els.publicChatForm.requestSubmit();
        }
    });
    els.publicChatList.addEventListener("scroll", updateChatScrollState);
    els.publicNewMessages.addEventListener("click", () => scrollChatToBottom(true));
    els.publicReactionButton.addEventListener("click", toggleReactionPicker);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideReactionPicker();
    });
    document.addEventListener("click", (event) => {
        if (els.reactionPicker.hidden) return;
        if (!els.reactionPicker.contains(event.target) && event.target !== els.publicReactionButton) hideReactionPicker();
    });
    els.socialChatEnabled.addEventListener("change", () => updateSocialSettings({ chatEnabled: els.socialChatEnabled.checked }));
    els.socialReactionsEnabled.addEventListener("change", () => updateSocialSettings({ reactionsEnabled: els.socialReactionsEnabled.checked }));
    els.socialSlowMode.addEventListener("change", () => updateSocialSettings({ slowModeMs: Number(els.socialSlowMode.value) }));
}

function showUnavailable(message) {
    const paragraph = els.stateUnavailable?.querySelector("p:not(.eyebrow)");
    if (paragraph) paragraph.textContent = message;
    setState(PUBLIC_APP_STATES.UNAVAILABLE);
}

function canCreatePublicRooms() {
    return state.config?.publicRooms?.creationEnabled === true && state.config?.publicRooms?.maintenance !== true;
}

function openCreateState() {
    if (!canCreatePublicRooms()) {
        toast("ساخت اتاق عمومی فعلاً فعال نیست.");
        return;
    }
    setState(PUBLIC_APP_STATES.CREATE);
}

function renderCreationAvailability() {
    const canCreate = canCreatePublicRooms();
    els.openCreate.hidden = !canCreate;
    for (const button of document.querySelectorAll("[data-action='create']")) {
        button.hidden = !canCreate;
    }
}

function setState(next) {
    state.appState = next;
    document.body.dataset.publicState = next;
    for (const section of document.querySelectorAll("[data-state]")) {
        section.hidden = section.dataset.state !== next;
    }
}

async function createRoom(event) {
    event.preventDefault();
    if (state.createPending) return;
    clearFormErrors();
    if (!canCreatePublicRooms()) {
        els.createError.textContent = "ساخت اتاق عمومی فعلاً فعال نیست.";
        return;
    }
    const payload = {
        displayName: sanitizePublicText(els.createDisplayName.value, 32),
        roomName: sanitizePublicText(els.createRoomName.value, 40),
        movieTitle: sanitizePublicText(els.createMovieTitle.value, 80),
        mediaUrl: sanitizePublicText(els.createMediaUrl.value, 1900),
        capacity: Number(els.createCapacity.value),
        language: sanitizePublicText(els.createLanguage.value, 24)
    };
    if (!payload.displayName || !payload.roomName || !payload.movieTitle || !payload.mediaUrl) {
        els.createError.textContent = "همه فیلدهای اصلی را کامل کنید.";
        return;
    }
    state.createPending = true;
    await runButton(els.createSubmit, "در حال ساخت...", async () => {
        const result = await state.service.createRoom(payload);
        state.role = "host";
        listenRoom(result.roomId);
        history.replaceState(null, "", `?room=${encodeURIComponent(result.roomId)}`);
    }, els.createError);
    state.createPending = false;
}

async function openPreview(roomId) {
    clearFormErrors();
    const room = await state.service.getDirectoryRoom(roomId);
    if (!room) throw new PublicRoomError(PUBLIC_ROOM_ERROR_CODES.NOT_FOUND);
    state.preview = room;
    renderPreview(room);
    setState(PUBLIC_APP_STATES.PREVIEW);
}

async function joinPreviewRoom(event) {
    event.preventDefault();
    if (state.joinPending) return;
    clearFormErrors();
    const displayName = sanitizePublicText(els.joinDisplayName.value, 32);
    if (!displayName) {
        els.joinError.textContent = "نام نمایشی را وارد کنید.";
        return;
    }
    state.joinPending = true;
    await runButton(els.joinSubmit, "در حال ورود...", async () => {
        const result = await state.service.joinRoom(state.preview.id, displayName);
        state.role = "guest";
        listenRoom(result.roomId);
        history.replaceState(null, "", `?room=${encodeURIComponent(result.roomId)}`);
    }, els.joinError);
    state.joinPending = false;
}

function listenRoom(roomId) {
    state.knownMessageIds.clear();
    state.shownReactionIds.clear();
    state.service.listenMemberNotice(roomId, (notice) => {
        if (notice?.type === "kicked") showEnded("میزبان شما را از اتاق خارج کرد.");
    });
    state.service.listenRoom(roomId, (room) => {
        if (!room) {
            if (state.appState === PUBLIC_APP_STATES.ROOM) showEnded("میزبان اتاق را پایان داد.");
            return;
        }
        state.currentRoom = room;
        const member = room.members?.[state.currentUid];
        if (!member) {
            showEnded(room.bans?.[state.currentUid] ? "میزبان شما را از اتاق خارج کرد." : "دسترسی شما به این اتاق فعال نیست.");
            return;
        }
        state.role = member.role;
        renderRoom(room);
        setState(PUBLIC_APP_STATES.ROOM);
    });
}

function renderDirectory() {
    const search = els.directorySearch.value.trim().toLowerCase();
    const rooms = filterDirectory(search);
    els.directoryEmpty.hidden = rooms.length > 0 || !state.directoryLoaded;
    if (els.directoryLiveCount) {
        els.directoryLiveCount.textContent = state.directoryLoaded
            ? `${toPersianDigits(state.directory.length)} اتاق فعال`
            : "اتاق‌ها در حال بارگذاری‌اند";
    }
    renderDirectoryEmpty(search);
    els.directoryList.replaceChildren(...rooms.map(renderRoomCard));
}

function filterDirectory(search) {
    const rooms = state.directory.filter((room) => {
        if (state.directoryFilter === "joinable" && !isPublicRoomJoinable(room)) return false;
        if (state.directoryFilter === "playing" && room.playbackPaused !== false) return false;
        if (state.directoryFilter === "waiting" && room.playbackPaused === false) return false;
        if (state.directoryLanguage !== "all" && getLanguageGroup(room.language) !== state.directoryLanguage) return false;
        if (!search) return true;
        return `${room.roomName || ""} ${room.movieTitle || ""} ${room.hostDisplayName || ""}`.toLowerCase().includes(search);
    });
    return rooms.sort((a, b) => {
        if (state.directorySort === "active") return Number(b.memberCount || 0) - Number(a.memberCount || 0) || Number(b.createdAt || 0) - Number(a.createdAt || 0);
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
}

function renderDirectoryEmpty(search) {
    if (state.directory.length === 0) {
        els.directoryEmpty.querySelector("h2").textContent = "فعلاً اتاق زنده‌ای نیست.";
        els.directoryEmpty.querySelector("p:not(.eyebrow)").textContent = "اولین سینما را برای بقیه باز کن.";
        return;
    }
    if (search || state.directoryFilter !== "all" || state.directoryLanguage !== "all") {
        els.directoryEmpty.querySelector("h2").textContent = "چیزی با این جستجو پیدا نشد.";
        els.directoryEmpty.querySelector("p:not(.eyebrow)").textContent = "فیلترها را سبک‌تر کن یا یک اتاق تازه بساز.";
        return;
    }
    els.directoryEmpty.querySelector("h2").textContent = "اتاق‌های فعال فعلاً پر هستند.";
    els.directoryEmpty.querySelector("p:not(.eyebrow)").textContent = "چند لحظه دیگر دوباره بررسی کن یا اتاق خودت را بساز.";
}

function renderRoomCard(room) {
    const joinable = isPublicRoomJoinable(room);
    const ownRoom = room.hostUid === state.currentUid;
    const card = document.createElement("article");
    card.className = `room-card ${joinable ? "is-joinable" : "is-closed"} ${ownRoom ? "is-own" : ""}`;
    card.dataset.testid = "public-room-card";

    const top = document.createElement("div");
    top.className = "room-card-top";
    const status = document.createElement("span");
    status.className = `live-status ${room.status === PUBLIC_ROOM_STATUSES.LOCKED ? "is-locked" : room.playbackPaused === false ? "is-playing" : "is-waiting"}`;
    status.textContent = getDirectoryStatus(room);
    const count = document.createElement("span");
    count.className = "count-pill";
    count.textContent = `${toPersianDigits(room.memberCount || 0)} / ${toPersianDigits(room.capacity || 0)}`;
    top.append(status, count);

    const identity = document.createElement("div");
    const movie = document.createElement("p");
    movie.className = "movie-title";
    movie.textContent = room.movieTitle || "فیلم";
    const title = document.createElement("h2");
    title.textContent = room.roomName || "اتاق عمومی";
    identity.append(movie, title);

    const meta = document.createElement("div");
    meta.className = "meta-row";
    for (const text of [
        `میزبان ${room.hostDisplayName || "میزبان"}`,
        room.language || "فارسی",
        formatRelativeAge(room.createdAt),
        room.chatEnabled ? "گفتگو فعال" : "گفتگو خاموش"
    ]) {
        const pill = document.createElement("span");
        pill.className = "meta-pill";
        pill.textContent = text;
        meta.append(pill);
    }

    const bottom = document.createElement("div");
    bottom.className = "room-card-bottom";
    const age = document.createElement("span");
    age.className = "room-age";
    age.textContent = ownRoom ? "اتاق شما" : room.reactionsEnabled ? "واکنش فعال" : "واکنش خاموش";
    const button = document.createElement("button");
    button.className = joinable || ownRoom ? "primary-btn" : "secondary-btn";
    button.type = "button";
    button.textContent = ownRoom ? "بازگشت" : joinable ? "ورود" : getDisabledJoinText(room);
    button.disabled = !joinable && !ownRoom;
    button.addEventListener("click", () => openPreview(room.id).catch(showError));
    bottom.append(age, button);

    card.append(top, identity, meta, bottom);
    if (joinable || ownRoom) {
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `ورود به ${room.roomName || "اتاق عمومی"}`);
        card.addEventListener("click", (event) => {
            if (event.target === button) return;
            button.click();
        });
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                button.click();
            }
        });
    }
    return card;
}

function renderPreview(room) {
    els.previewRoomName.textContent = room.roomName || "اتاق عمومی";
    els.previewDetails.replaceChildren();
    for (const [label, value] of [
        ["فیلم", room.movieTitle || "فیلم"],
        ["میزبان", room.hostDisplayName || "میزبان"],
        ["ظرفیت", `${toPersianDigits(room.memberCount || 0)} / ${toPersianDigits(room.capacity || 0)}`],
        ["زبان", room.language || "فارسی"],
        ["وضعیت", getDirectoryStatus(room)],
        ["گفتگو", room.chatEnabled ? "فعال" : "خاموش"],
        ["واکنش", room.reactionsEnabled ? "فعال" : "خاموش"]
    ]) {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        els.previewDetails.append(dt, dd);
    }
    els.joinSubmit.disabled = !isPublicRoomJoinable(room);
    if (!isPublicRoomJoinable(room)) els.joinError.textContent = getDisabledJoinText(room);
}

function renderRoom(room) {
    const members = Object.entries(room.members || {}).map(([uid, member]) => ({ ...member, uid }));
    const capabilities = getPublicRoomCapabilities({ role: state.role, settings: room.settings });
    els.roomTitle.textContent = room.roomName || "اتاق عمومی";
    els.roomSubtitle.textContent = room.movieTitle || "فیلم";
    els.roomStatus.textContent = getDirectoryStatus(room);
    els.roomCount.textContent = `${toPersianDigits(members.length)} / ${toPersianDigits(room.capacity || 0)}`;
    els.openHostControls.hidden = !capabilities.canEndRoom;
    els.hostActions.hidden = !capabilities.canEndRoom;
    els.guestActions.hidden = !capabilities.canLeaveRoom;
    els.leaveRoom.hidden = !capabilities.canLeaveRoom;
    els.guestControlNote.hidden = capabilities.canControlPlayback;
    els.toggleLock.textContent = room.status === PUBLIC_ROOM_STATUSES.LOCKED ? "باز کردن اتاق" : "قفل اتاق";
    els.hostDisconnected.hidden = Boolean(room.members?.[room.hostUid]?.online);
    els.mediaSyncState.textContent = capabilities.canControlPlayback ? "کنترل پخش با شماست" : "کنترل پخش با میزبان است";
    els.memberList.replaceChildren(...members.map((member) => renderMember(member, capabilities)));
    renderRoomFacts(room, members, capabilities);
    renderSocialSettings(room, capabilities);
    renderChat(room, capabilities);
    renderReactions(room);
    applyMedia(room, capabilities);
    applyPlayback(room.playback, capabilities);
}

function renderRoomFacts(room, members, capabilities) {
    const facts = [
        ["فیلم", room.movieTitle || "فیلم"],
        ["اعضا", `${toPersianDigits(members.length)} / ${toPersianDigits(room.capacity || 0)}`],
        ["وضعیت", getDirectoryStatus(room)],
        ["گفتگو", room.settings?.chatEnabled ? "فعال" : "خاموش"],
        ["واکنش‌ها", room.settings?.reactionsEnabled ? "فعال" : "خاموش"],
        ["نقش شما", capabilities.canEndRoom ? "میزبان" : "مهمان"]
    ];
    els.roomFacts.replaceChildren(...facts.map(([label, value]) => {
        const item = document.createElement("div");
        item.className = "room-fact";
        const term = document.createElement("span");
        term.textContent = label;
        const body = document.createElement("strong");
        body.textContent = value;
        item.append(term, body);
        return item;
    }));
}

function renderMember(member, capabilities) {
    const card = document.createElement("div");
    card.className = `member-card ${member.online ? "is-online" : "is-reconnecting"}`;
    card.dataset.testid = member.role === "host" ? "public-member-host" : "public-member-guest";
    card.dataset.memberName = member.displayName || "";
    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "member-name";
    name.textContent = member.displayName || "مهمان";
    const role = document.createElement("div");
    role.className = "member-role";
    role.textContent = member.role === "host" ? "میزبان" : "مهمان";
    const status = document.createElement("div");
    status.className = "member-status";
    status.textContent = member.online ? "آنلاین" : "در حال اتصال مجدد";
    info.append(name, role, status);
    card.append(info);
    if (capabilities.canKickMembers && member.role !== "host") {
        const button = document.createElement("button");
        button.className = "secondary-btn small";
        button.type = "button";
        button.dataset.testid = "public-kick-member";
        button.setAttribute("aria-label", `اخراج ${member.displayName || "مهمان"}`);
        button.textContent = "اخراج";
        button.addEventListener("click", () => kickMember(member.uid, member.displayName));
        card.append(button);
    }
    return card;
}

function renderSocialSettings(room, capabilities) {
    els.socialSettings.hidden = !capabilities.canManageSocial;
    if (!capabilities.canManageSocial) return;
    els.socialChatEnabled.checked = room.settings?.chatEnabled === true;
    els.socialReactionsEnabled.checked = room.settings?.reactionsEnabled === true;
    els.socialSlowMode.value = String(room.settings?.slowModeMs ?? 3000);
}

function renderChat(room, capabilities) {
    const messages = Object.entries(room.chat || {})
        .map(([id, message]) => ({ id, ...message }))
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
        .slice(-300);
    const nextIds = new Set(messages.map((message) => message.id));
    const hadMessages = state.knownMessageIds.size > 0;
    const incomingCount = messages.filter((message) => !state.knownMessageIds.has(message.id)).length;
    const shouldAutoScroll = state.chatAutoScroll || !hadMessages;
    state.knownMessageIds = nextIds;

    els.publicChatList.replaceChildren(...renderMessageGroups(messages, capabilities));
    if (!messages.length) {
        const empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.textContent = "هنوز گفتگویی شروع نشده است.";
        els.publicChatList.append(empty);
    }
    if (shouldAutoScroll) {
        queueMicrotask(() => scrollChatToBottom(false));
    } else if (incomingCount > 0) {
        state.unreadMessages += incomingCount;
        els.publicNewMessages.textContent = `${toPersianDigits(state.unreadMessages)} پیام جدید`;
        els.publicNewMessages.hidden = false;
    }

    const chatEnabled = capabilities.canChat;
    els.publicChatDisabled.hidden = chatEnabled;
    els.publicChatForm.classList.toggle("is-disabled", !chatEnabled);
    els.publicChatInput.disabled = !chatEnabled;
    els.publicChatSend.disabled = !chatEnabled;
    els.publicReactionButton.disabled = !capabilities.canReact;
    updateComposer();
}

function renderMessageGroups(messages, capabilities) {
    const groups = [];
    let current = null;
    for (const message of messages) {
        const sameSender = current?.uid === message.uid;
        const closeEnough = Number(message.createdAt || 0) - Number(current?.lastAt || 0) <= MESSAGE_GROUP_MS;
        if (!current || !sameSender || !closeEnough) {
            current = {
                uid: message.uid,
                displayName: message.displayName || "کاربر",
                own: message.uid === state.currentUid,
                lastAt: Number(message.createdAt || 0),
                messages: []
            };
            groups.push(current);
        }
        current.lastAt = Number(message.createdAt || current.lastAt);
        current.messages.push(message);
    }
    return groups.map((group) => {
        const node = document.createElement("article");
        node.className = `chat-group ${group.own ? "is-own" : ""}`;
        const header = document.createElement("div");
        header.className = "chat-group-header";
        const name = document.createElement("span");
        name.textContent = group.own ? "شما" : group.displayName;
        const time = document.createElement("time");
        time.textContent = formatPublicClock(group.lastAt);
        header.append(name, time);
        const list = document.createElement("div");
        list.className = "chat-message-stack";
        for (const message of group.messages) {
            const row = document.createElement("div");
            row.className = "chat-message-row";
            const body = document.createElement("p");
            body.textContent = message.text || "";
            row.append(body);
            if (capabilities.canKickMembers) {
                const del = document.createElement("button");
                del.className = "message-menu";
                del.type = "button";
                del.dataset.testid = "public-delete-message";
                del.setAttribute("aria-label", "حذف پیام");
                del.textContent = "•••";
                del.addEventListener("click", () => deleteMessage(message.id));
                row.append(del);
            }
            list.append(row);
        }
        node.append(header, list);
        return node;
    });
}

function renderReactions(room) {
    const reactions = Object.entries(room.reactions || {})
        .map(([id, reaction]) => ({ id, ...reaction }))
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    for (const reaction of reactions) {
        if (state.shownReactionIds.has(reaction.id)) continue;
        state.shownReactionIds.add(reaction.id);
        showReaction(reaction, room.members || {});
    }
    while (state.shownReactionIds.size > 200) {
        state.shownReactionIds.delete(state.shownReactionIds.values().next().value);
    }
}

function showReaction(reaction, members) {
    const node = document.createElement("div");
    const lane = Math.abs(hashString(reaction.id || String(Date.now()))) % 7;
    node.className = `floating-reaction lane-${lane}`;
    const emoji = document.createElement("span");
    emoji.className = "reaction-emoji";
    emoji.textContent = reaction.emoji;
    const name = document.createElement("span");
    name.className = "reaction-name";
    name.textContent = reaction.uid === state.currentUid ? "شما" : (members[reaction.uid]?.displayName || "کاربر");
    node.append(emoji, name);
    els.publicReactionLayer.append(node);
    setTimeout(() => node.remove(), 4600);
}

function renderReactionPicker() {
    els.reactionPicker.replaceChildren(...PUBLIC_ALLOWED_REACTIONS.map((emoji) => {
        const button = document.createElement("button");
        button.type = "button";
        button.role = "menuitem";
        button.textContent = emoji;
        button.setAttribute("aria-label", `واکنش ${emoji}`);
        button.addEventListener("click", () => sendReaction(emoji));
        return button;
    }));
}

function applyMedia(room, capabilities) {
    const url = room.media?.url || "";
    if (url && state.mediaUrl !== url) {
        state.mediaUrl = url;
        els.publicVideo.src = url;
        els.publicVideo.load();
    }
    els.publicVideo.controls = Boolean(capabilities.canControlPlayback);
}

function applyPlayback(playback, capabilities) {
    if (!playback || capabilities.canControlPlayback) return;
    state.applyingRemote = true;
    const expected = expectedPublicPlaybackTime(playback);
    if (Math.abs(els.publicVideo.currentTime - expected) > 1) {
        els.publicVideo.currentTime = expected;
    }
    els.publicVideo.playbackRate = Number(playback.playbackRate || 1);
    const playPromise = playback.paused ? Promise.resolve(els.publicVideo.pause()) : els.publicVideo.play();
    Promise.resolve(playPromise).catch(() => {});
    queueMicrotask(() => { state.applyingRemote = false; });
}

function hostPlayback(action) {
    if (state.applyingRemote || state.role !== "host" || !state.currentRoom) return;
    state.service.updatePlayback({
        action,
        paused: els.publicVideo.paused,
        currentTime: els.publicVideo.currentTime,
        playbackRate: els.publicVideo.playbackRate
    }).catch(showError);
}

async function sendChatMessage(event) {
    event.preventDefault();
    els.publicChatError.textContent = "";
    const text = sanitizePublicMessage(els.publicChatInput.value, 600);
    if (!text) return;
    if (text.length > 500) {
        els.publicChatError.textContent = "پیام بیش از حد طولانی است.";
        return;
    }
    await runButton(els.publicChatSend, "ارسال...", async () => {
        await state.service.sendMessage(text);
        els.publicChatInput.value = "";
        updateComposer();
        scrollChatToBottom(true);
    }, els.publicChatError);
}

async function deleteMessage(messageId) {
    await state.service.deleteMessage(messageId).catch(showError);
}

async function sendReaction(emoji) {
    hideReactionPicker();
    await state.service.sendReaction(emoji).catch((error) => {
        els.publicChatError.textContent = getPublicRoomErrorMessage(error);
    });
}

async function updateSocialSettings(settings) {
    await state.service.updateSocialSettings(settings).catch(showError);
}

async function updateHostMedia(event) {
    event.preventDefault();
    if (state.mediaPending) return;
    els.hostMediaError.textContent = "";
    const movieTitle = sanitizePublicText(els.hostMovieTitle.value, 80);
    const mediaUrl = sanitizePublicText(els.hostMediaUrl.value, 1900);
    if (!movieTitle || !mediaUrl) {
        els.hostMediaError.textContent = "نام فیلم و لینک مستقیم را کامل وارد کنید.";
        return;
    }
    state.mediaPending = true;
    await runButton(els.hostMediaSubmit, "در حال تغییر...", async () => {
        await state.service.updateMedia({ movieTitle, mediaUrl });
        toast("فیلم اتاق تغییر کرد.");
    }, els.hostMediaError).finally(() => {
        state.mediaPending = false;
    });
}

async function toggleLock() {
    const locked = state.currentRoom?.status !== PUBLIC_ROOM_STATUSES.LOCKED;
    await state.service.setLock(locked).catch(showError);
}

async function kickMember(uid, displayName) {
    const ok = await confirmDialog("اخراج از اتاق", "این کاربر از اتاق خارج می‌شود و تا پایان این اتاق نمی‌تواند دوباره وارد شود.", "اخراج");
    if (!ok) return;
    await state.service.kickMember(uid).then(() => toast(`${displayName || "کاربر"} اخراج شد.`)).catch(showError);
}

async function endRoom() {
    closeHostControls();
    const ok = await confirmDialog("پایان دادن به اتاق؟", "با پایان اتاق، تمام اطلاعات این اتاق پاک می‌شود و همه اعضا از اتاق خارج می‌شوند.", "پایان و حذف اتاق");
    if (!ok) return;
    await state.service.endRoom().then(() => showEnded("اتاق پایان یافت.")).catch(showError);
}

async function leaveRoom() {
    const ok = await confirmDialog("ترک اتاق؟", "از اتاق خارج می‌شوید و می‌توانید دوباره از فهرست اتاق‌ها وارد شوید.", "ترک اتاق");
    if (!ok) return;
    await state.service.leaveRoom().then(goDirectory).catch(showError);
}

async function goDirectory() {
    state.service?.clearRoomSession();
    state.currentRoom = null;
    state.preview = null;
    state.role = "";
    state.mediaUrl = "";
    state.knownMessageIds.clear();
    state.shownReactionIds.clear();
    els.publicReactionLayer.replaceChildren();
    els.publicVideo.removeAttribute("src");
    els.publicVideo.load();
    history.replaceState(null, "", "/watch-party/public/");
    setState(PUBLIC_APP_STATES.DIRECTORY);
    renderDirectory();
}

function showEnded(message) {
    state.service?.clearRoomSession();
    els.endedMessage.textContent = message;
    history.replaceState(null, "", "/watch-party/public/");
    setState(PUBLIC_APP_STATES.ENDED);
}

function showError(error) {
    if (state.appState === PUBLIC_APP_STATES.ROOM && error?.code === PUBLIC_ROOM_ERROR_CODES.NOT_AUTHORIZED) {
        showEnded("دسترسی شما به این اتاق دیگر فعال نیست.");
        return;
    }
    const message = getPublicRoomErrorMessage(error);
    if (state.appState === PUBLIC_APP_STATES.CREATE) els.createError.textContent = message;
    else if (state.appState === PUBLIC_APP_STATES.PREVIEW || state.appState === PUBLIC_APP_STATES.JOINING) els.joinError.textContent = message;
    else toast(message);
}

async function runButton(button, label, fn, errorEl) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try {
        await fn();
    } catch (error) {
        if (errorEl) errorEl.textContent = getPublicRoomErrorMessage(error);
        else showError(error);
    } finally {
        button.textContent = original;
        button.disabled = false;
    }
}

function confirmDialog(title, text, okText) {
    els.confirmTitle.textContent = title;
    els.confirmText.textContent = text;
    els.confirmOk.textContent = okText;
    els.confirmDialog.showModal();
    els.confirmCancel.focus();
    return new Promise((resolve) => {
        const cleanup = (value) => {
            els.confirmOk.removeEventListener("click", onOk);
            els.confirmCancel.removeEventListener("click", onCancel);
            els.confirmDialog.removeEventListener("cancel", onDialogCancel);
            els.confirmDialog.close();
            resolve(value);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onDialogCancel = (event) => {
            event.preventDefault();
            cleanup(false);
        };
        els.confirmOk.addEventListener("click", onOk);
        els.confirmCancel.addEventListener("click", onCancel);
        els.confirmDialog.addEventListener("cancel", onDialogCancel);
    });
}

function setSocialTab(tab) {
    state.activeSocialTab = tab || "chat";
    for (const button of [els.tabChatButton, els.tabMembersButton, els.tabRoomButton]) {
        const active = button?.dataset.publicTab === state.activeSocialTab;
        button?.classList.toggle("is-active", active);
        button?.setAttribute("aria-selected", String(active));
    }
    for (const panel of [els.socialChatPanel, els.socialMembersPanel, els.socialRoomPanel]) {
        panel.hidden = panel?.dataset.publicPanel !== state.activeSocialTab;
    }
    if (state.activeSocialTab === "chat") scrollChatToBottom(true);
}

function openHostControls() {
    els.hostMovieTitle.value = state.currentRoom?.movieTitle || "";
    els.hostMediaUrl.value = state.currentRoom?.media?.url || "";
    els.hostMediaError.textContent = "";
    if (!els.hostControlDialog.open) els.hostControlDialog.showModal();
}

function closeHostControls() {
    if (els.hostControlDialog.open) els.hostControlDialog.close();
}

function updateComposer() {
    const length = els.publicChatInput.value.length;
    els.publicChatMeta.textContent = `${toPersianDigits(length)} / ${toPersianDigits(500)}`;
    const slowMode = Number(state.currentRoom?.settings?.slowModeMs || 0);
    if (slowMode > 0) els.publicChatMeta.textContent += ` · حالت آهسته: ${formatSlowModeLabel(slowMode)}`;
    els.publicChatInput.style.height = "auto";
    els.publicChatInput.style.height = `${Math.min(150, Math.max(52, els.publicChatInput.scrollHeight))}px`;
}

function updateChatScrollState() {
    const distance = els.publicChatList.scrollHeight - els.publicChatList.scrollTop - els.publicChatList.clientHeight;
    state.chatAutoScroll = distance < 56;
    if (state.chatAutoScroll) {
        state.unreadMessages = 0;
        els.publicNewMessages.hidden = true;
    }
}

function scrollChatToBottom(force) {
    els.publicChatList.scrollTop = els.publicChatList.scrollHeight;
    if (force) state.chatAutoScroll = true;
    state.unreadMessages = 0;
    els.publicNewMessages.hidden = true;
}

function toggleReactionPicker() {
    if (els.publicReactionButton.disabled) return;
    const wasOpen = !els.reactionPicker.hidden;
    if (wasOpen) {
        hideReactionPicker();
        return;
    }
    const rect = els.publicReactionButton.getBoundingClientRect();
    els.reactionPicker.style.insetInlineStart = `${Math.max(12, window.innerWidth - rect.right)}px`;
    els.reactionPicker.style.top = `${Math.min(window.innerHeight - 90, rect.bottom + 8)}px`;
    els.reactionPicker.hidden = false;
    els.publicReactionButton.setAttribute("aria-expanded", "true");
}

function hideReactionPicker() {
    els.reactionPicker.hidden = true;
    els.publicReactionButton.setAttribute("aria-expanded", "false");
}

function clearFormErrors() {
    els.createError.textContent = "";
    els.joinError.textContent = "";
    els.publicChatError.textContent = "";
}

function getDirectoryStatus(room) {
    if (room.status === PUBLIC_ROOM_STATUSES.LOCKED) return "قفل";
    if (Number(room.memberCount || 0) >= Number(room.capacity || 0)) return "اتاق پر است";
    if (room.playbackPaused === false || room.playback?.paused === false) return "در حال پخش";
    if (room.playbackPaused === true || room.playback?.paused === true) return "متوقف";
    return "در انتظار شروع";
}

function getDisabledJoinText(room) {
    if (room.status === PUBLIC_ROOM_STATUSES.LOCKED) return "قفل است";
    if (Number(room.memberCount || 0) >= Number(room.capacity || 0)) return "پر است";
    return "ورود ممکن نیست";
}

function getLanguageGroup(language = "") {
    const normalized = String(language).toLowerCase();
    if (/فارسی|persian|farsi|fa/.test(normalized)) return "fa";
    if (/english|en/.test(normalized)) return "en";
    return "other";
}

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash) + value.charCodeAt(index);
    return hash;
}

function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    setTimeout(() => { els.toast.hidden = true; }, 2600);
}

function toCamel(id) {
    return id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}
