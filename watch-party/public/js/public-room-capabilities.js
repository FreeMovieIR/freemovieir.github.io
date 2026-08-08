export function getPublicRoomCapabilities({ role, settings = {} } = {}) {
    const isHost = role === "host";
    return Object.freeze({
        canControlPlayback: isHost,
        canChangeMedia: isHost,
        canChangeSubtitle: false,
        canLockRoom: isHost,
        canKickMembers: isHost,
        canEndRoom: isHost,
        canLeaveRoom: !isHost,
        canManageSocial: isHost,
        canChat: Boolean(settings.chatEnabled),
        canReact: Boolean(settings.reactionsEnabled),
        canSpeak: false,
        canMuteMember: false,
        canApproveSpeaker: false
    });
}
