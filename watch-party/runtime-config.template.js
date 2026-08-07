export const watchPartyConfig = {
    environment: "production",
    firebase: {
        apiKey: "__WATCH_PARTY_FIREBASE_API_KEY__",
        authDomain: "__WATCH_PARTY_FIREBASE_AUTH_DOMAIN__",
        databaseURL: "__WATCH_PARTY_FIREBASE_DATABASE_URL__",
        projectId: "__WATCH_PARTY_FIREBASE_PROJECT_ID__",
        appId: "__WATCH_PARTY_FIREBASE_APP_ID__"
    },
    useEmulators: false,
    appCheck: {
        enabled: false,
        provider: "recaptcha-enterprise",
        siteKey: "",
        autoRefresh: true
    },
    rtc: {
        iceServers: [],
        turnCredentialsEndpoint: ""
    },
    mediaGateway: {
        enabled: false,
        baseUrl: "",
        requestTimeoutMs: 15000,
        jobTimeoutMs: 120000,
        preferRemux: true
    },
    roomLifetimeMs: 6 * 60 * 60 * 1000,
    serviceCheckTimeoutMs: 4000,
    createRoomTimeoutMs: 10000,
    joinRoomTimeoutMs: 10000,
    replaceMediaTimeoutMs: 10000,
    nativeMetadataTimeoutMs: 15000,
    restoreTimeoutMs: 10000,
    maxStoredSessionAgeMs: 6 * 60 * 60 * 1000,
    subtitleSizeLimit: 300 * 1024,
    chatLengthLimit: 500,
    maxChatMessages: 75,
    mediabunny: {
        moduleUrl: "https://esm.sh/mediabunny@1.52.3",
        ac3ModuleUrl: "https://esm.sh/@mediabunny/ac3@1.52.3"
    },
    sync: {
        heartbeatMs: 5000,
        smallDriftMs: 250,
        hardSeekDriftMs: 1000,
        softCorrectionRateDelta: 0.06,
        bufferDebounceMs: 1200
    }
};
