export const VOICE_STATES = Object.freeze({
    IDLE: "IDLE",
    WAITING_FOR_PARTNER: "WAITING_FOR_PARTNER",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    MIC_REQUESTING: "MIC_REQUESTING",
    MIC_ON: "MIC_ON",
    REMOTE_AUDIO_BLOCKED: "REMOTE_AUDIO_BLOCKED",
    RECONNECTING: "RECONNECTING",
    FAILED: "FAILED",
    CLOSED: "CLOSED"
});

export const MICROPHONE_STATES = Object.freeze({
    OFF: "OFF",
    REQUESTING: "REQUESTING",
    ON: "ON",
    MUTED: "MUTED",
    DENIED: "DENIED",
    UNAVAILABLE: "UNAVAILABLE"
});

export const VOICE_LABELS = Object.freeze({
    [VOICE_STATES.IDLE]: "صدا: آماده نیست",
    [VOICE_STATES.WAITING_FOR_PARTNER]: "صدا: منتظر همراه",
    [VOICE_STATES.CONNECTING]: "صدا: در حال اتصال",
    [VOICE_STATES.CONNECTED]: "صدا: اتصال برقرار است",
    [VOICE_STATES.MIC_REQUESTING]: "صدا: در حال دریافت اجازه میکروفن",
    [VOICE_STATES.MIC_ON]: "صدا: میکروفن روشن",
    [VOICE_STATES.REMOTE_AUDIO_BLOCKED]: "برای شنیدن صدای همراه لمس کنید",
    [VOICE_STATES.RECONNECTING]: "صدا: در حال اتصال دوباره",
    [VOICE_STATES.FAILED]: "اتصال صوتی برقرار نشد",
    [VOICE_STATES.CLOSED]: "صدا: بسته شد",
    micOff: "میکروفن خاموش",
    micOn: "میکروفن روشن",
    micMuted: "میکروفن بی‌صدا شد",
    partnerMicOff: "میکروفن همراه خاموش است",
    remoteAudioBlocked: "برای شنیدن صدای همراه لمس کنید",
    reconnect: "اتصال دوباره صدا"
});

const ALLOWED_TRANSITIONS = Object.freeze({
    [VOICE_STATES.IDLE]: [VOICE_STATES.WAITING_FOR_PARTNER, VOICE_STATES.CONNECTING, VOICE_STATES.CLOSED, VOICE_STATES.FAILED],
    [VOICE_STATES.WAITING_FOR_PARTNER]: [VOICE_STATES.CONNECTING, VOICE_STATES.CLOSED, VOICE_STATES.FAILED],
    [VOICE_STATES.CONNECTING]: [VOICE_STATES.CONNECTED, VOICE_STATES.REMOTE_AUDIO_BLOCKED, VOICE_STATES.RECONNECTING, VOICE_STATES.FAILED, VOICE_STATES.CLOSED],
    [VOICE_STATES.CONNECTED]: [VOICE_STATES.MIC_REQUESTING, VOICE_STATES.MIC_ON, VOICE_STATES.REMOTE_AUDIO_BLOCKED, VOICE_STATES.RECONNECTING, VOICE_STATES.FAILED, VOICE_STATES.CLOSED],
    [VOICE_STATES.MIC_REQUESTING]: [VOICE_STATES.CONNECTED, VOICE_STATES.MIC_ON, VOICE_STATES.FAILED, VOICE_STATES.CLOSED],
    [VOICE_STATES.MIC_ON]: [VOICE_STATES.CONNECTED, VOICE_STATES.REMOTE_AUDIO_BLOCKED, VOICE_STATES.RECONNECTING, VOICE_STATES.FAILED, VOICE_STATES.CLOSED],
    [VOICE_STATES.REMOTE_AUDIO_BLOCKED]: [VOICE_STATES.CONNECTED, VOICE_STATES.MIC_ON, VOICE_STATES.RECONNECTING, VOICE_STATES.FAILED, VOICE_STATES.CLOSED],
    [VOICE_STATES.RECONNECTING]: [VOICE_STATES.CONNECTED, VOICE_STATES.FAILED, VOICE_STATES.CLOSED],
    [VOICE_STATES.FAILED]: [VOICE_STATES.CONNECTING, VOICE_STATES.CLOSED],
    [VOICE_STATES.CLOSED]: [VOICE_STATES.IDLE]
});

export class VoiceStateMachine extends EventTarget {
    constructor() {
        super();
        this.connectionState = VOICE_STATES.IDLE;
        this.microphoneState = MICROPHONE_STATES.OFF;
        this.remoteAudioBlocked = false;
        this.lastDetailKey = "";
    }

    transition(nextState, patch = {}) {
        if (!Object.values(VOICE_STATES).includes(nextState)) return false;
        if (nextState !== this.connectionState && !ALLOWED_TRANSITIONS[this.connectionState]?.includes(nextState)) {
            return false;
        }
        this.connectionState = nextState;
        this.applyPatch(patch);
        this.emit();
        return true;
    }

    setMicrophoneState(nextState, patch = {}) {
        if (!Object.values(MICROPHONE_STATES).includes(nextState)) return false;
        this.microphoneState = nextState;
        this.applyPatch(patch);
        this.emit();
        return true;
    }

    applyPatch(patch = {}) {
        if (typeof patch.remoteAudioBlocked === "boolean") this.remoteAudioBlocked = patch.remoteAudioBlocked;
    }

    detail(extra = {}) {
        const label = this.remoteAudioBlocked
            ? VOICE_LABELS.remoteAudioBlocked
            : this.connectionState === VOICE_STATES.CONNECTED && this.microphoneState === MICROPHONE_STATES.OFF
                ? "صدا: اتصال برقرار است · میکروفن خاموش"
                : this.connectionState === VOICE_STATES.CONNECTED && this.microphoneState === MICROPHONE_STATES.ON
                    ? "صدا: اتصال برقرار است · میکروفن روشن"
                    : this.connectionState === VOICE_STATES.CONNECTED && this.microphoneState === MICROPHONE_STATES.MUTED
                        ? "صدا: اتصال برقرار است · میکروفن بی‌صدا"
                        : VOICE_LABELS[this.connectionState];
        return {
            connectionState: this.connectionState,
            microphoneState: this.microphoneState,
            remoteAudioBlocked: this.remoteAudioBlocked,
            failed: this.connectionState === VOICE_STATES.FAILED,
            reconnectable: this.connectionState === VOICE_STATES.FAILED,
            label,
            ...extra
        };
    }

    emit(extra = {}) {
        const detail = this.detail(extra);
        const key = JSON.stringify(detail);
        if (key === this.lastDetailKey) return;
        this.lastDetailKey = key;
        this.dispatchEvent(new CustomEvent("status", { detail }));
    }
}

export function sanitizeVoiceSessionId(value) {
    return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}
