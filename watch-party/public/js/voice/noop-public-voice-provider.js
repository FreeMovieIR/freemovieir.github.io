import { PUBLIC_VOICE_STATES } from "./public-voice-types.js";

export class NoopPublicVoiceProvider {
    async initialize() { return this.getState(); }
    async join() { return this.getState(); }
    async leave() { return this.getState(); }
    async enableMicrophone() { return this.getState(); }
    async disableMicrophone() { return this.getState(); }
    async muteParticipant() { return this.getState(); }
    async requestToSpeak() { return this.getState(); }
    async approveSpeaker() { return this.getState(); }
    getState() {
        return Object.freeze({ state: PUBLIC_VOICE_STATES.DISABLED, policy: "DISABLED" });
    }
    destroy() {
        return this.getState();
    }
}
