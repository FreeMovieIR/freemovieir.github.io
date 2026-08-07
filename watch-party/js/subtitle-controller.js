import { MESSAGES } from "./utils.js";

export function normalizeSubtitleToVtt(raw, fileName = "") {
    let text = String(raw || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
    const lowerName = fileName.toLowerCase();
    if (!text) throw new Error(MESSAGES.subtitleInvalid);
    if (!text.startsWith("WEBVTT")) {
        text = text
            .replace(/^\d+\s*$/gm, "")
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
        text = `WEBVTT\n\n${text}`;
    }
    if (!/^WEBVTT(?:\s|$)/.test(text) || !/-->\s*\d{2}:\d{2}/.test(text)) {
        if (!lowerName.endsWith(".vtt") && !lowerName.endsWith(".srt")) throw new Error(MESSAGES.subtitleInvalid);
        throw new Error(MESSAGES.subtitleInvalid);
    }
    return text;
}

export class SubtitleController {
    constructor(video, trackEl, config) {
        this.video = video;
        this.trackEl = trackEl;
        this.config = config;
        this.currentBlobUrl = null;
        this.applyPreferences(this.loadPreferences());
    }

    async fromFile(file) {
        if (!file) return null;
        if (file.size > (this.config.subtitleSizeLimit || 307200)) throw new Error(MESSAGES.subtitleLarge);
        const text = await file.text();
        const content = this.normalizeToVtt(text, file.name);
        return {
            mode: "inline",
            format: "vtt",
            content,
            fileName: file.name.slice(0, 80)
        };
    }

    async fromUrl(url) {
        try {
            const response = await fetch(url, { mode: "cors", credentials: "omit" });
            if (!response.ok) throw new Error(MESSAGES.subtitleCors);
            const text = await response.text();
            if (new Blob([text]).size > (this.config.subtitleSizeLimit || 307200)) throw new Error(MESSAGES.subtitleLarge);
            return {
                mode: "url",
                format: "vtt",
                url,
                content: this.normalizeToVtt(text, url.split("/").pop() || "subtitle")
            };
        } catch (error) {
            if (error.message === MESSAGES.subtitleLarge) throw error;
            throw new Error(MESSAGES.subtitleCors);
        }
    }

    normalizeToVtt(raw, fileName = "") {
        return normalizeSubtitleToVtt(raw, fileName);
    }

    applySubtitle(subtitle) {
        this.clear();
        if (!subtitle || subtitle.mode === "none") return;
        let source = "";
        if (subtitle.content) {
            this.currentBlobUrl = URL.createObjectURL(new Blob([subtitle.content], { type: "text/vtt;charset=utf-8" }));
            source = this.currentBlobUrl;
        } else if (subtitle.url) {
            source = subtitle.url;
        }
        if (!source) return;
        this.trackEl.src = source;
        this.trackEl.label = subtitle.fileName || "فارسی";
        this.trackEl.srclang = "fa";
        this.trackEl.kind = "subtitles";
        queueMicrotask(() => {
            const track = Array.from(this.video.textTracks).find((item) => item.label === this.trackEl.label) || this.video.textTracks[0];
            if (track) track.mode = "showing";
        });
    }

    clear() {
        this.trackEl.removeAttribute("src");
        if (this.currentBlobUrl) URL.revokeObjectURL(this.currentBlobUrl);
        this.currentBlobUrl = null;
    }

    loadPreferences() {
        try {
            return JSON.parse(localStorage.getItem("watchPartySubtitlePrefs") || "{}");
        } catch {
            return {};
        }
    }

    savePreferences(prefs) {
        localStorage.setItem("watchPartySubtitlePrefs", JSON.stringify(prefs));
        this.applyPreferences(prefs);
    }

    applyPreferences(prefs) {
        const root = document.documentElement;
        root.style.setProperty("--wp-caption-size", `${prefs.fontSize || 18}px`);
        root.style.setProperty("--wp-caption-color", prefs.color || "#ffffff");
        root.style.setProperty("--wp-caption-bg", `rgba(0,0,0,${prefs.bgOpacity ?? 0.65})`);
        root.style.setProperty("--wp-caption-bottom", `${prefs.vertical || 8}%`);
    }
}
