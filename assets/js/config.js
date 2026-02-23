/**
 * Global Site Configuration
 * Centralizing all base URLs and shared constants.
 */

window.CONFIG = {
    // Base URLs
    SITE_URL: 'https://freemovieir.github.io',

    // API Base URLs
    API: {
        TMDB: 'https://api.themoviedb.org/3',
        TMDB_IMAGE: 'https://image.tmdb.org/t/p',
        OMDB: 'https://www.omdbapi.com',
        TVMAZE: 'https://api.tvmaze.com'
    },

    // Assets
    ASSETS: {
        DEFAULT_POSTER: '/assets/images/default-freemovie-300.png',
        STORY_IMAGE: '/assets/images/story.png',
        TWEET_IMAGE: '/assets/images/tweet.png',
        FAVICON_IMDB: 'https://m.media-amazon.com/images/G/01/imdb/images-ANDW73HA/favicon_desktop_32x32._CB1582158068_.png'
    },

    // External Links
    LINKS: {
        TWITTER: 'https://twitter.com/freemovie_ir',
        INSTAGRAM: 'https://instagram.com/freemovie_ir',
        TWITTER_INTENT: 'https://twitter.com/intent/tweet?text=',
        DEFAULT_SUPPORT_TEXT: 'من از فیری مووی حمایت می‌کنم! یک سایت عالی برای تماشای فیلم و سریال: https://b2n.ir/freemovie',
        DOWNLOAD_PROXY: 'https://berlin.saymyname.website/Movies',
        SUBTITLE_PROXY: 'https://subtitle.saymyname.website/DL/filmgir',
        OFFICIAL_DOWNLOADS: {
            ANDROID: 'https://freemovie.ir/download/android.apk',
            WINDOWS: 'https://freemovie.ir/download/freemovie-windows.exe',
            IOS: 'https://freemovie.ir/download/freemovie-ios.ipa',
            MAC: 'https://freemovie.ir/download/freemovie-mac.dmg',
            LINUX: 'https://freemovie.ir/download/freemovie-linux.AppImage'
        }
    },

    // Global Constants
    TMDB_DEFAULT_KEY: '1dc4cbf81f0accf4fa108820d551dafc',
    OMDB_DEFAULT_KEY: '38fa39d5'
};
