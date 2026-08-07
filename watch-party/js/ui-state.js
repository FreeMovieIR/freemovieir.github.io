export const APP_STATES = Object.freeze({
    WELCOME: "welcome",
    AUTHENTICATING: "authenticating",
    AUTH_FAILED: "auth-failed",
    HOST_PROFILE: "host-profile",
    HOST_MEDIA: "host-media",
    GUEST_CODE: "guest-code",
    GUEST_PROFILE: "guest-profile",
    CREATING_ROOM: "creating-room",
    JOINING_ROOM: "joining-room",
    RESTORING_ROOM: "restoring-room",
    RESTORE_FAILED: "restore-failed",
    SERVICE_UNAVAILABLE: "service-unavailable",
    LOBBY: "lobby",
    COUNTDOWN: "countdown",
    ACTIVE_ROOM: "active-room",
    RECONNECTING: "reconnecting",
    ROOM_ENDED: "room-ended",
    ERROR: "error"
});

export function getVisibleScreenForState(state) {
    if (state === APP_STATES.CREATING_ROOM) return APP_STATES.HOST_MEDIA;
    if (state === APP_STATES.JOINING_ROOM) return APP_STATES.GUEST_PROFILE;
    if (state === APP_STATES.RESTORING_ROOM) return APP_STATES.RESTORING_ROOM;
    if (state === APP_STATES.RESTORE_FAILED) return APP_STATES.RESTORE_FAILED;
    if (state === APP_STATES.SERVICE_UNAVAILABLE) return APP_STATES.SERVICE_UNAVAILABLE;
    if (state === APP_STATES.AUTH_FAILED) return APP_STATES.AUTH_FAILED;
    if (state === APP_STATES.RECONNECTING) return APP_STATES.AUTHENTICATING;
    return state;
}

export function isRoomState(state) {
    return [APP_STATES.LOBBY, APP_STATES.COUNTDOWN, APP_STATES.ACTIVE_ROOM].includes(state);
}
