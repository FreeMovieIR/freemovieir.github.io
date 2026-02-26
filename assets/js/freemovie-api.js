/**
 * FreeMovie API Integration Layer
 * Based on the Kotlin repository implementations
 */

const API_KEY = '4F5A9C3D9A86FA54EACEDDD635185'
const PRIMARY_SERVER = 'https://server-hi-speed-iran.info'
const HELPER_SERVERS = [
    'https://hostinnegar.com',
    'https://windowsdiba.info'
]

// Persian to English genre mapping
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
}

// Farsi ordinal to number mapping
const FARSI_ORDINALS = {
    'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5,
    'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10,
    'یازدهم': 11, 'دوازدهم': 12, 'سیزدهم': 13, 'چهاردهم': 14, 'پانزدهم': 15
}

// Cache for genre ID lookups
let genreCache = null

/**
 * Translate Persian genre to English
 */
function translateGenre(persianGenre) {
    return GENRE_MAP[persianGenre] || persianGenre
}

/**
 * Get genre ID by English name
 * @param {string} englishName - English genre name
 * @returns {Promise<number|null>} Genre ID or null
 */
async function getGenreId(englishName) {
    // Fetch and cache genres if not already cached
    if (!genreCache) {
        try {
            const genres = await fetchGenres()
            genreCache = new Map()
            genres.forEach(g => {
                const english = translateGenre(g.title)
                genreCache.set(english, g.id)
            })
        } catch (error) {
            console.error('Failed to fetch genres:', error.message)
            return null
        }
    }

    return genreCache.get(englishName) || null
}

/**
 * Parse a season title to extract actual season number and version info
 * Examples:
 *   "فصل اول 480 دوبله پارسی" → { seasonNumber: 1, info: "480 دوبله پارسی" }
 *   "فصل دوم زیرنویس" → { seasonNumber: 2, info: "زیرنویس" }
 */
function parseSeasonTitle(title) {
    if (!title) return { seasonNumber: null, info: null }

    // Match "فصل\s+(\S+)\s*(.*)"
    const match = title.match(/^فصل\s+(\S+)\s*(.*)/)
    if (match) {
        const ordinalOrNum = match[1]
        const rest = match[2].trim() || null

        // Check Farsi ordinal
        if (FARSI_ORDINALS[ordinalOrNum]) {
            return { seasonNumber: FARSI_ORDINALS[ordinalOrNum], info: rest }
        }

        // Check numeric (Western or Persian digits)
        const westernized = ordinalOrNum.replace(/[۰-۹]/g, d =>
            String.fromCharCode(d.charCodeAt(0) - '۰'.charCodeAt(0) + 48)
        )
        const num = parseInt(westernized)
        if (!isNaN(num)) {
            return { seasonNumber: num, info: rest }
        }
    }

    return { seasonNumber: null, info: title }
}

/**
 * Group API seasons by actual season number (parsed from title)
 * Multiple API "seasons" may be different versions (quality/dubbing) of the same actual season
 */
function groupSeasonsByNumber(seasons) {
    const groups = {}
    let maxParsed = 0
    const unparsed = []

    seasons.forEach((season, index) => {
        const parsed = parseSeasonTitle(season.title)
        if (parsed.seasonNumber) {
            maxParsed = Math.max(maxParsed, parsed.seasonNumber)
            const key = parsed.seasonNumber
            if (!groups[key]) groups[key] = []
            groups[key].push({ ...season, _versionInfo: parsed.info })
        } else {
            unparsed.push({ season, index })
        }
    })

    // Assign unparsed seasons sequential numbers after max parsed
    unparsed.forEach(({ season }, i) => {
        const key = maxParsed + i + 1
        if (!groups[key]) groups[key] = []
        groups[key].push({ ...season, _versionInfo: season.title || null })
    })

    return groups
}

/**
 * Execute request with fallback to helper servers
 */
async function executeRequest(primaryUrl) {
    // Try primary server first
    try {
        const response = await fetch(primaryUrl, { timeout: 30000 })
        if (response.ok) {
            return await response.json()
        }
        throw new Error(`Primary server returned: ${response.status}`)
    } catch (primaryError) {
        // Try helper servers
        for (const helperServer of HELPER_SERVERS) {
            try {
                const helperUrl = primaryUrl.replace(/^https?:\/\/[^/]+/, helperServer)
                const response = await fetch(helperUrl, { timeout: 30000 })
                if (response.ok) {
                    return await response.json()
                }
            } catch (helperError) {
                continue
            }
        }
        throw primaryError
    }
}

// Dynamic language helper for TMDB API based on site language
function getApiLang() {
    return (window.i18n && window.i18n.current === 'fa') ? 'fa-IR' : (window.i18n ? window.i18n.current : 'en-US');
}

/**
 * Fetch movies list
 * @param {number} page - Page number (0-indexed)
 * @param {number} genreId - Genre ID (0 for all)
 * @param {string} filterType - 'created', 'year', or 'imdb'
 */
async function fetchMovies(page = 0, genreId = 0, filterType = 'created') {
    const url = `${PRIMARY_SERVER}/api/movie/by/filtres/${genreId}/${filterType}/${page}/${API_KEY}`
    return await executeRequest(url)
}

/**
 * Fetch series list
 * @param {number} page - Page number (0-indexed)
 * @param {number} genreId - Genre ID (0 for all)
 * @param {string} filterType - 'created', 'year', or 'imdb'
 */
async function fetchSeries(page = 0, genreId = 0, filterType = 'created') {
    const url = `${PRIMARY_SERVER}/api/serie/by/filtres/${genreId}/${filterType}/${page}/${API_KEY}`
    return await executeRequest(url)
}

/**
 * Fetch seasons and episodes for a series
 * @param {number} seriesId - Series ID
 */
async function fetchSeasons(seriesId) {
    const url = `${PRIMARY_SERVER}/api/season/by/serie/${seriesId}/${API_KEY}/`
    return await executeRequest(url)
}

/**
 * Search for movies and series
 * @param {string} query - Search query
 */
async function search(query) {
    const encodedQuery = encodeURIComponent(query).replace(/%20/g, '%20')
    const url = `${PRIMARY_SERVER}/api/search/${encodedQuery}/${API_KEY}/`
    const result = await executeRequest(url)
    return result.posters || []
}

/**
 * Fetch all genres
 */
async function fetchGenres() {
    const url = `${PRIMARY_SERVER}/api/genre/all/${API_KEY}`
    return await executeRequest(url)
}

/**
 * Fetch all countries
 */
async function fetchCountries() {
    const url = `${PRIMARY_SERVER}/api/country/all/${API_KEY}/`
    return await executeRequest(url)
}

/**
 * Fetch posters by country
 * @param {number} countryId - Country ID
 * @param {number} page - Page number
 * @param {string} filterType - 'created', 'year', or 'imdb'
 */
async function fetchPostersByCountry(countryId, page = 0, filterType = 'created') {
    const url = `${PRIMARY_SERVER}/api/poster/by/filtres/0/${countryId}/${filterType}/${page}/${API_KEY}`
    return await executeRequest(url)
}

/**
 * Parse description to extract director, cast, and synopsis
 */
function parseDescription(description) {
    const result = {
        director: [],
        cast: [],
        synopsis: ''
    }

    if (!description) return result

    // Extract director (کارگردان)
    const directorMatch = description.match(/کارگردان\s*:\s*([^\r\n]+)/)
    if (directorMatch) {
        result.director = directorMatch[1]
            .split(/[,،]/)
            .map(d => d.trim())
            .filter(d => d.length > 0)
    }

    // Extract cast (بازیگران)
    const castMatch = description.match(/بازیگران\s*:\s*([^\r\n]+)/)
    if (castMatch) {
        result.cast = castMatch[1]
            .split(/[,،]/)
            .map(c => c.trim())
            .filter(c => c.length > 0)
    }

    // Extract synopsis (خلاصه داستان)
    const synopsisMarker = 'خلاصه داستان:'
    const synopsisIndex = description.indexOf(synopsisMarker)

    if (synopsisIndex !== -1) {
        let synopsis = description.substring(synopsisIndex + synopsisMarker.length)
        // Clean up and remove trailing markers like "زیرنویس چسبیده پارسی"
        synopsis = synopsis
            .replace(/\r\n/g, '\n')
            .replace(/\n{2,}/g, '\n')
            .replace(/زیرنویس.*$/i, '')
            .trim()
        result.synopsis = synopsis
    }

    return result
}

/**
 * Transform API movie/series to Stremio meta format
 */
function toStremioMeta(item, type) {
    const parsed = parseDescription(item.description)

    return {
        id: item.id,
        type: type,
        name: item.title,
        poster: item.image,
        background: item.cover,
        description: parsed.synopsis,
        year: item.year,
        // imdbRating omitted - no valid IMDB ID available for linking
        genres: item.genres ? item.genres.map(g => translateGenre(g.title)) : [],
        runtime: item.duration,
        director: parsed.director.length > 0 ? parsed.director : undefined,
        cast: parsed.cast.length > 0 ? parsed.cast : undefined,
        country: item.country ? item.country.map(c => c.title).join(', ') : undefined
    }
}

/**
 * Transform seasons/episodes to Stremio videos format
 * Groups API seasons by actual season number and merges sources from different versions
 */
function toStremioVideos(seasons, seriesId) {
    const videos = []
    const groups = groupSeasonsByNumber(seasons)

    Object.entries(groups)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .forEach(([seasonNumStr, versions]) => {
            const seasonNum = parseInt(seasonNumStr)

            // Get filtered episodes (no trailers) for each version
            const versionEpisodes = versions.map(v =>
                (v.episodes || []).filter(ep => ep.title !== 'تیزر')
            )
            const maxEpisodes = Math.max(...versionEpisodes.map(eps => eps.length))

            for (let epIdx = 0; epIdx < maxEpisodes; epIdx++) {
                const episodeNum = epIdx + 1
                let episodeTitle = null
                let thumbnail = undefined
                let overview = undefined
                let allSources = []

                versions.forEach((version, vIdx) => {
                    const eps = versionEpisodes[vIdx]
                    if (eps[epIdx]) {
                        const ep = eps[epIdx]
                        if (!episodeTitle) episodeTitle = ep.title
                        if (!thumbnail && ep.image) thumbnail = ep.image
                        if (!overview && ep.description) overview = ep.description

                        // Collect sources tagged with version info
                        if (ep.sources) {
                            ep.sources.forEach(source => {
                                allSources.push({
                                    ...source,
                                    _versionInfo: version._versionInfo
                                })
                            })
                        }
                    }
                })

                videos.push({
                    id: `${seriesId}:${seasonNum}:${episodeNum}`,
                    title: episodeTitle || `Episode ${episodeNum}`,
                    season: seasonNum,
                    episode: episodeNum,
                    thumbnail,
                    overview,
                    _sources: allSources
                })
            }
        })

    return videos
}

/**
 * Get streams from sources array
 * Matches Android display: quality shown directly, version info appended when available
 */
function toStremioStreams(sources) {
    if (!sources || sources.length === 0) {
        return []
    }

    return sources.map(source => {
        let title = source.quality || 'Unknown'

        if (source._versionInfo) {
            // Check if version info already contains the quality number
            // e.g., quality="480p" and versionInfo="480 دوبله پارسی"
            const qualityBase = (source.quality || '').replace(/p$/i, '')
            if (qualityBase && source._versionInfo.includes(qualityBase)) {
                title = source._versionInfo
            } else {
                title = `${source.quality || 'Unknown'} - ${source._versionInfo}`
            }
        }

        return {
            name: 'FreeMovie',
            title,
            url: source.url,
            quality: source.quality
        }
    })
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_KEY,
        PRIMARY_SERVER,
        HELPER_SERVERS,
        executeRequest,
        fetchMovies,
        fetchSeries,
        fetchSeasons,
        search,
        fetchGenres,
        fetchCountries,
        fetchPostersByCountry,
        getGenreId,
        parseSeasonTitle,
        groupSeasonsByNumber,
        toStremioMeta,
        toStremioVideos,
        toStremioStreams
    }
} else {
    window.FreeMovieAPI = {
        fetchMovies,
        fetchSeries,
        fetchSeasons,
        search,
        fetchGenres,
        translateGenre,
        getGenreId
    }
}
