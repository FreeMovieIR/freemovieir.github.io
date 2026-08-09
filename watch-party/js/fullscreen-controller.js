export const FULLSCREEN_CAPABILITY = Object.freeze({
    STANDARD_ELEMENT_FULLSCREEN: "standard-element-fullscreen",
    WEBKIT_VIDEO_FULLSCREEN: "webkit-video-fullscreen",
    CSS_CINEMA_MODE: "css-cinema-mode",
    UNAVAILABLE: "unavailable"
});

export class FullscreenController extends EventTarget {
    constructor({ wrapper, video, controlsRoot = null, doc = document, win = window } = {}) {
        super();
        this.wrapper = wrapper;
        this.video = video;
        this.controlsRoot = controlsRoot;
        this.document = doc;
        this.window = win;
        this.mode = null;
        this.scrollY = 0;
        this.boundExit = () => this.exit();
        this.boundWebkitBegin = () => this.dispatchMode(FULLSCREEN_CAPABILITY.WEBKIT_VIDEO_FULLSCREEN, true);
        this.boundWebkitEnd = () => this.dispatchMode(FULLSCREEN_CAPABILITY.WEBKIT_VIDEO_FULLSCREEN, false);
        this.boundStandardChange = () => {
            const active = this.document.fullscreenElement === this.wrapper;
            this.dispatchMode(FULLSCREEN_CAPABILITY.STANDARD_ELEMENT_FULLSCREEN, active);
        };
        this.bindEvents();
    }

    bindEvents() {
        this.video?.addEventListener?.("webkitbeginfullscreen", this.boundWebkitBegin);
        this.video?.addEventListener?.("webkitendfullscreen", this.boundWebkitEnd);
        this.document?.addEventListener?.("fullscreenchange", this.boundStandardChange);
    }

    getCapability() {
        return getFullscreenCapability({
            wrapper: this.wrapper,
            video: this.video,
            doc: this.document
        });
    }

    enterFromUserGesture() {
        if (this.isActive()) {
            this.exit();
            return true;
        }
        const capability = this.getCapability();
        if (capability === FULLSCREEN_CAPABILITY.STANDARD_ELEMENT_FULLSCREEN) {
            return this.enterStandardFullscreen();
        }
        if (capability === FULLSCREEN_CAPABILITY.WEBKIT_VIDEO_FULLSCREEN) {
            // iPhone Safari requires this call to happen synchronously inside the click gesture.
            this.video.webkitEnterFullscreen();
            return true;
        }
        if (capability === FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE) {
            this.enterCinemaMode();
            return true;
        }
        this.dispatchEvent(new CustomEvent("unavailable"));
        return false;
    }

    isActive() {
        return this.mode === FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE
            || this.wrapper?.classList?.contains?.("cinema-mode-active")
            || this.document?.body?.classList?.contains?.("watch-party-cinema-lock")
            || this.document?.fullscreenElement === this.wrapper;
    }

    exit() {
        if (this.document?.fullscreenElement === this.wrapper && typeof this.document.exitFullscreen === "function") {
            this.document.exitFullscreen().catch?.(() => {});
        }
        if (typeof this.video?.webkitExitFullscreen === "function") {
            try {
                this.video.webkitExitFullscreen();
            } catch {
                // Some WebKit builds throw when the video is not currently fullscreen.
            }
        }
        this.exitCinemaMode({ force: true });
    }

    async enterStandardFullscreen() {
        try {
            await this.wrapper.requestFullscreen();
            return true;
        } catch {
            this.enterCinemaMode();
            return false;
        }
    }

    enterCinemaMode() {
        if (!this.wrapper || this.mode === FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE) return;
        this.scrollY = Number(this.window.scrollY || this.document.documentElement?.scrollTop || 0);
        this.mode = FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE;
        this.wrapper.classList.add("cinema-mode-active");
        this.document.body.classList.add("watch-party-cinema-lock");
        this.document.body.style.top = `-${this.scrollY}px`;
        this.ensureCinemaExitButton();
        this.document.addEventListener("keydown", this.handleCinemaKeydown);
        this.dispatchMode(FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE, true);
        if (this.window.matchMedia?.("(orientation: portrait)")?.matches) {
            this.showOrientationHint();
        }
    }

    ensureCinemaExitButton() {
        if (!this.wrapper || this.wrapper.querySelector("[data-cinema-exit]")) return;
        const button = this.document.createElement("button");
        button.type = "button";
        button.className = "cinema-exit-button";
        button.dataset.cinemaExit = "true";
        button.textContent = "خروج از حالت سینمایی";
        button.addEventListener("click", this.boundExit);
        this.wrapper.append(button);
    }

    showOrientationHint() {
        if (!this.wrapper || this.wrapper.querySelector("[data-cinema-orientation-hint]")) return;
        const hint = this.document.createElement("p");
        hint.className = "cinema-orientation-hint";
        hint.dataset.cinemaOrientationHint = "true";
        hint.textContent = "برای تصویر بزرگ‌تر، گوشی را افقی کنید.";
        this.wrapper.append(hint);
        this.window.setTimeout(() => hint.remove(), 4800);
    }

    handleCinemaKeydown = (event) => {
        if (event.key === "Escape") this.exit();
    };

    exitCinemaMode({ force = false } = {}) {
        const hasCinemaDom = this.wrapper?.classList?.contains?.("cinema-mode-active")
            || this.document.body?.classList?.contains?.("watch-party-cinema-lock");
        if (!force && this.mode !== FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE) return;
        if (force && this.mode !== FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE && !hasCinemaDom) return;
        this.mode = null;
        this.wrapper?.classList.remove("cinema-mode-active");
        this.wrapper?.querySelector("[data-cinema-exit]")?.remove();
        this.wrapper?.querySelector("[data-cinema-orientation-hint]")?.remove();
        this.document.body.classList.remove("watch-party-cinema-lock");
        this.document.body.style.top = "";
        this.document.removeEventListener("keydown", this.handleCinemaKeydown);
        this.window.scrollTo?.(0, this.scrollY);
        this.dispatchMode(FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE, false);
    }

    destroy() {
        this.exitCinemaMode({ force: true });
        this.video?.removeEventListener?.("webkitbeginfullscreen", this.boundWebkitBegin);
        this.video?.removeEventListener?.("webkitendfullscreen", this.boundWebkitEnd);
        this.document?.removeEventListener?.("fullscreenchange", this.boundStandardChange);
    }

    dispatchMode(mode, active) {
        this.dispatchEvent(new CustomEvent("change", { detail: { mode, active } }));
    }
}

export function getFullscreenCapability({ wrapper, video, doc = document } = {}) {
    if (doc?.fullscreenEnabled && wrapper?.requestFullscreen) {
        return FULLSCREEN_CAPABILITY.STANDARD_ELEMENT_FULLSCREEN;
    }
    if (hasLoadedMetadata(video) && video?.webkitSupportsFullscreen && typeof video.webkitEnterFullscreen === "function") {
        return FULLSCREEN_CAPABILITY.WEBKIT_VIDEO_FULLSCREEN;
    }
    if (wrapper && supportsCssCinemaMode(doc)) return FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE;
    return FULLSCREEN_CAPABILITY.UNAVAILABLE;
}

export function hasLoadedMetadata(video) {
    return Boolean(video && (video.readyState >= 1 || video.videoWidth > 0 || Number.isFinite(video.duration)));
}

export function supportsCssCinemaMode(doc = document) {
    const cssSupports = globalThis.CSS && typeof globalThis.CSS.supports === "function"
        ? globalThis.CSS.supports("position", "fixed")
        : true;
    return Boolean(doc?.body?.classList && cssSupports !== false);
}
