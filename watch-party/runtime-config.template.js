export const watchPartyConfig = {
    environment: "__WATCH_PARTY_ENVIRONMENT__",
    firebase: {
        apiKey: "__WATCH_PARTY_FIREBASE_API_KEY__",
        authDomain: "__WATCH_PARTY_FIREBASE_AUTH_DOMAIN__",
        databaseURL: "__WATCH_PARTY_FIREBASE_DATABASE_URL__",
        projectId: "__WATCH_PARTY_FIREBASE_PROJECT_ID__",
        appId: "__WATCH_PARTY_FIREBASE_APP_ID__"
    },
    useEmulators: false,
    emulators: {
        auth: { url: "http://127.0.0.1:9099" },
        database: { host: "127.0.0.1", port: 9000 },
        ui: { url: "http://127.0.0.1:4000" }
    },
    appCheck: {
        enabled: __WATCH_PARTY_APP_CHECK_ENABLED__,
        provider: "recaptcha-enterprise",
        siteKey: "__WATCH_PARTY_APP_CHECK_SITE_KEY__",
        autoRefresh: true
    },
    rtc: {
        iceServers: __WATCH_PARTY_RTC_ICE_SERVERS__,
        turnCredentialsEndpoint: "__WATCH_PARTY_TURN_CREDENTIALS_ENDPOINT__"
    },
    optionalTurn: {
        enabled: false,
        note: "Do not put permanent TURN credentials in this static frontend.",
        iceServers: []
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
