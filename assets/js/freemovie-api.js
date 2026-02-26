/**
 * FreeMovie Professional API Layer
 * Organized into Services for Clean Code & Scalability
 */

const API_CONFIG = {
    KEY: window.CONFIG?.MOVIE_DATA_KEY || '4F5A9C3D9A86FA54EACEDDD635185',
    PRIMARY: window.CONFIG?.API?.MOVIE_DATA || 'https://server-hi-speed-iran.info',
    HELPERS: ['https://hostinnegar.com', 'https://windowsdiba.info']
};

const DEFAULT_HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
};

/**
 * Base Request Handler (Ported from BaseRepository.kt & TS patterns)
 */
async function executeRequest(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000);

    const fetchOptions = {
        method: 'GET',
        headers: DEFAULT_HEADERS,
        signal: controller.signal,
        ...options
    };

    try {
        const response = await fetch(url, fetchOptions);
        if (response.ok) return await response.json();
        throw new Error(`Request failed with status: ${response.status}`);
    } catch (error) {
        for (const helper of API_CONFIG.HELPERS) {
            try {
                const helperUrl = url.replace(/^https?:\/\/[^/]+/, helper);
                const response = await fetch(helperUrl, fetchOptions);
                if (response.ok) return await response.json();
            } catch (e) { continue; }
        }
        throw error;
    } finally {
        clearTimeout(id);
    }
}

/**
 * Movie Service
 */
const MovieService = {
    async fetchMovies(page = 0, genreId = 0, filterType = 'created') {
        const url = `${API_CONFIG.PRIMARY}/api/movie/by/filtres/${genreId}/${filterType}/${page}/${API_CONFIG.KEY}`;
        return await executeRequest(url);
    }
};

/**
 * Series Service
 */
const SeriesService = {
    async fetchSeries(page = 0, genreId = 0, filterType = 'created') {
        const url = `${API_CONFIG.PRIMARY}/api/serie/by/filtres/${genreId}/${filterType}/${page}/${API_CONFIG.KEY}`;
        return await executeRequest(url);
    },
    async fetchSeasons(seriesId) {
        const url = `${API_CONFIG.PRIMARY}/api/season/by/serie/${seriesId}/${API_CONFIG.KEY}/`;
        return await executeRequest(url);
    }
};

/**
 * Common Metadata Service
 */
const MetadataService = {
    async fetchGenres() {
        const url = `${API_CONFIG.PRIMARY}/api/genre/all/${API_CONFIG.KEY}`;
        return await executeRequest(url);
    },
    async fetchCountries() {
        const url = `${API_CONFIG.PRIMARY}/api/country/all/${API_CONFIG.KEY}/`;
        return await executeRequest(url);
    }
};

/**
 * Search & Discovery Service
 */
const DiscoveryService = {
    async search(query) {
        const encoded = encodeURIComponent(query).replace(/%20/g, '%20');
        const url = `${API_CONFIG.PRIMARY}/api/search/${encoded}/${API_CONFIG.KEY}/`;
        const result = await executeRequest(url);
        return result.posters || [];
    },
    async fetchByCountry(countryId, page = 0, filterType = 'created') {
        const url = `${API_CONFIG.PRIMARY}/api/poster/by/filtres/0/${countryId}/${filterType}/${page}/${API_CONFIG.KEY}`;
        return await executeRequest(url);
    }
};

/**
 * --- Utility Part (Business Logic) ---
 */

const GENRE_MAP = {
    'سریال های برتر': 'Top Series',
    'تازه های باحال': 'New Releases',
    'پیشنهاد سردبیر': 'Editor\'s Pick',
    'سریال های بروز شده': 'Updated Series',
    'کره ای': 'Korean',
    'ترکی': 'Turkish',
    'بهترین ها در 5 ماه گذشته': 'Best of Last 5 Months',
    'چینی ژاپنی': 'Chinese & Japanese',
    'مستند': 'Documentary',
    'آخر الزمانی': 'Apocalyptic',
    '250 برتر تاریخ': 'Top 250 of All Time',
    'اسکار 2024': 'Oscar 2024',
    'بیشترین دانلود ها': 'Most Downloaded',
    'هندی': 'Indian',
    'ترسناک': 'Horror',
    'جنگی': 'War',
    'خانوادگی': 'Family',
    'ماجراجویی': 'Adventure',
    'کمدی': 'Comedy',
    'جنایی': 'Crime',
    'معمایی': 'Mystery',
    'درام': 'Drama',
    'زندگی نامه': 'Biography',
    'ورزشی': 'Sport',
    'محبوب ترین ها': 'Most Popular',
    'علمی تخیلی': 'Sci-Fi',
    'فانتزی': 'Fantasy',
    'اکشن': 'Action',
    'هیجان انگیز': 'Thriller',
    'اسکار 2023': 'Oscar 2023',
    'مسابقات ورزشی': 'Sports Events',
    'کلاسیک': 'Classic',
    'تاریخی': 'Historical',
    'وسترن': 'Western',
    'موزیک': 'Music',
    'عاشقانه': 'Romance',
    'Talk-Show': 'Talk Show',
    'اسکار 2021': 'Oscar 2021',
    'آموزش زبان انگلیسی': 'English Learning',
    'پخش زنده': 'Live',
    'انیمیشن + انیمه': 'Animation & Anime',
    'پیشنهادی هفته': 'Weekly Pick',
    'صوتی': 'Audio',
    'زیر نویس انگلیسی': 'English Subtitle',
    'گلدن گلوب 2024': 'Golden Globe 2024',
    'اسکار 2025': 'Oscar 2025',
    'چینی': 'Chinese',
    'ژاپنی': 'Japanese'
};

const FARSI_ORDINALS = {
    'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5,
    'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10,
    'یازدهم': 11, 'دوازدهم': 12, 'سیزدهم': 13, 'چهاردهم': 14, 'پانزدهم': 15
};

function parseSeasonTitle(title) {
    if (!title) return { seasonNumber: null, info: null };
    const match = title.match(/^فصل\s+(\S+)\s*(.*)/);
    if (match) {
        const ordinalOrNum = match[1];
        const rest = match[2].trim() || null;
        if (FARSI_ORDINALS[ordinalOrNum]) return { seasonNumber: FARSI_ORDINALS[ordinalOrNum], info: rest };
        const westernized = ordinalOrNum.replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - '۰'.charCodeAt(0) + 48));
        const num = parseInt(westernized);
        if (!isNaN(num)) return { seasonNumber: num, info: rest };
    }
    return { seasonNumber: null, info: title };
}

function groupSeasonsByNumber(seasons) {
    const groups = {};
    let maxParsed = 0;
    const unparsed = [];
    seasons.forEach((season) => {
        const parsed = parseSeasonTitle(season.title);
        if (parsed.seasonNumber) {
            maxParsed = Math.max(maxParsed, parsed.seasonNumber);
            const key = parsed.seasonNumber;
            if (!groups[key]) groups[key] = [];
            groups[key].push({ ...season, _versionInfo: parsed.info });
        } else {
            unparsed.push(season);
        }
    });
    unparsed.forEach((season, i) => {
        const key = maxParsed + i + 1;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ ...season, _versionInfo: season.title || null });
    });
    return groups;
}

function parseDescription(description) {
    const result = { director: [], cast: [], synopsis: '' };
    if (!description) return result;
    const directorMatch = description.match(/کارگردان\s*:\s*([^\r\n]+)/);
    if (directorMatch) result.director = directorMatch[1].split(/[,،]/).map(d => d.trim()).filter(d => d.length > 0);
    const castMatch = description.match(/بازیگران\s*:\s*([^\r\n]+)/);
    if (castMatch) result.cast = castMatch[1].split(/[,،]/).map(c => c.trim()).filter(c => c.length > 0);
    const synopsisMarker = 'خلاصه داستان:';
    const synopsisIndex = description.indexOf(synopsisMarker);
    if (synopsisIndex !== -1) {
        let synopsis = description.substring(synopsisIndex + synopsisMarker.length);
        synopsis = synopsis.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/زیرنویس.*$/i, '').trim();
        result.synopsis = synopsis;
    }
    return result;
}

function toStremioMeta(item, type) {
    const parsed = parseDescription(item.description);
    return {
        id: item.id,
        type: type,
        name: item.title,
        poster: item.image,
        background: item.cover,
        description: parsed.synopsis,
        year: item.year,
        genres: item.genres ? item.genres.map(g => GENRE_MAP[g.title] || g.title) : [],
        runtime: item.duration,
        director: parsed.director.length > 0 ? parsed.director : undefined,
        cast: parsed.cast.length > 0 ? parsed.cast : undefined,
        country: item.country ? item.country.map(c => c.title).join(', ') : undefined
    };
}

function toStremioVideos(seasons, seriesId) {
    const videos = [];
    const groups = groupSeasonsByNumber(seasons);
    Object.entries(groups).sort(([a], [b]) => parseInt(a) - parseInt(b)).forEach(([seasonNumStr, versions]) => {
        const seasonNum = parseInt(seasonNumStr);
        const versionEpisodes = versions.map(v => (v.episodes || []).filter(ep => ep.title !== 'تیزر'));
        const maxEpisodes = Math.max(...versionEpisodes.map(eps => eps.length));
        for (let epIdx = 0; epIdx < maxEpisodes; epIdx++) {
            const episodeNum = epIdx + 1;
            let episodeTitle = null, thumbnail = undefined, overview = undefined, allSources = [];
            versions.forEach((version, vIdx) => {
                const eps = versionEpisodes[vIdx];
                if (eps[epIdx]) {
                    const ep = eps[epIdx];
                    if (!episodeTitle) episodeTitle = ep.title;
                    if (!thumbnail && ep.image) thumbnail = ep.image;
                    if (!overview && ep.description) overview = ep.description;
                    if (ep.sources) ep.sources.forEach(source => allSources.push({ ...source, _versionInfo: version._versionInfo }));
                }
            });
            videos.push({ id: `${seriesId}:${seasonNum}:${episodeNum}`, title: episodeTitle || `Episode ${episodeNum}`, season: seasonNum, episode: episodeNum, thumbnail, overview, _sources: allSources });
        }
    });
    return videos;
}

function toStremioStreams(sources) {
    if (!sources || sources.length === 0) return [];
    return sources.map(source => {
        let title = source.quality || 'Unknown';
        if (source._versionInfo) {
            const qualityBase = (source.quality || '').replace(/p$/i, '');
            if (qualityBase && source._versionInfo.includes(qualityBase)) title = source._versionInfo;
            else title = `${source.quality || 'Unknown'} - ${source._versionInfo}`;
        }
        return { name: 'FreeMovie', title, url: source.url, quality: source.quality };
    });
}

// Export to window for global access
window.FreeMovieAPI = {
    ...MovieService,
    ...SeriesService,
    ...MetadataService,
    ...DiscoveryService,
    translateGenre: (p) => GENRE_MAP[p] || p,
    toStremioMeta,
    toStremioVideos,
    toStremioStreams
};
