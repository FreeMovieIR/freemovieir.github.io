
// --- Configuration Constants ---
const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // TMDb API key (Replace with your key)
const language = 'fa-IR';
const baseImageUrl = 'https://image.tmdb.org/t/p/'; // Base URL for TMDB images
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie.png'; // Default poster fallback
const defaultBackdrop = 'https://freemovieir.github.io/images/default-freemovie.png'; // Default backdrop fallback
const movieId = new URLSearchParams(window.location.search).get('id');

let apiKeySwitcher; // Global variable for OMDb API key management

async function initializeSwitcher() {
    try {
        if (typeof loadApiKeys !== 'function') {
            throw new Error("`loadApiKeys` function is not defined.");
        }
        apiKeySwitcher = await loadApiKeys();
        if (!apiKeySwitcher || typeof apiKeySwitcher.fetchWithKeySwitch !== 'function') {
            throw new Error("API Key Switcher initialization failed or is invalid.");
        }
        console.log("API Key Switcher Initialized successfully for movie details.");
    } catch (error) {
        console.error("Fatal Error: Failed to initialize API Key Switcher:", error);
        throw new Error(`Initialization failed: ${error.message}`);
    }
}

// Assuming fetchOmdbPoster is defined elsewhere (like in the previous script)
// If not, include its definition here:
async function fetchOmdbPoster(imdbId) {
    if (!imdbId) {
        console.warn("Skipping OMDb fetch: No IMDb ID provided.");
        return defaultPoster;
    }
    if (!apiKeySwitcher) {
        console.error("Cannot fetch OMDb poster: apiKeySwitcher is not initialized.");
        return defaultPoster;
    }
    try {
        console.log(`Workspaceing OMDb poster for IMDb ID: ${imdbId}`);
        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
            (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
        );
        if (omdbData && omdbData.Response === "True" && omdbData.Poster && omdbData.Poster !== 'N/A') {
            console.log(`OMDb poster found for ${imdbId}: ${omdbData.Poster}`);
            return omdbData.Poster.replace(/_SX300\.jpg$|_@_SX300\.jpg$/i, '.jpg');
        } else {
            console.warn(`OMDb response indicates no poster found for ${imdbId}. Response:`, omdbData?.Error || "No poster data");
            return defaultPoster;
        }
    } catch (error) {
        console.error(`Error fetching OMDb poster for ${imdbId}:`, error.message);
        return defaultPoster;
    }
}


// --- DOM Update Functions ---

/**
 * Updates the main DOM elements with movie details.
 * @param {object} movieData - Data from TMDB movie endpoint (including credits).
 * @param {object} externalIdsData - Data from TMDB external_ids endpoint.
 * @param {object} videosData - Data from TMDB videos endpoint.
 * @param {string} finalPosterUrl - The determined poster URL (OMDb or default).
 */
function updateDomWithMovieDetails(movieData, movieDataEnglish, externalIdsData, videosData, finalPosterUrl) {
    const title = movieData.title || 'نامشخص';
    const titleEnglish = movieDataEnglish.title || title;
    const year = movieData.release_date ? movieData.release_date.substring(0, 4) : 'نامشخص';
    const runTime = movieData.runtime ? `${movieData.runtime} دقیقه` : 'نامشخص';
    const backdropPath = movieData.backdrop_path || movieData.poster_path;
    const backdropUrl = backdropPath ? `${baseImageUrl}w1280${backdropPath}` : defaultBackdrop;
    const overview = movieData.overview || 'خلاصه‌ای در دسترس نیست.';
    const genres = movieData.genres?.map(g => g.name).join(', ') || 'نامشخص';
    const rating = movieData.vote_average ? Number(movieData.vote_average).toFixed(1) : 'بدون امتیاز';
    const voteCount = movieData.vote_count || '0';
    const budget = movieData.budget > 0 ? `${movieData.budget.toLocaleString()} دلار` : 'نامشخص';
    const director = movieData.credits?.crew?.find(crew => crew.job === 'Director');
    const directorName = director?.name || 'کارگردان مشخص نیست';
    const productionCountries = movieData.production_countries?.map(c => c.name).join(', ') || 'نامشخص';
    const spokenLanguages = movieData.spoken_languages?.map(lang => lang.english_name).join(', ') || 'نامشخص';
    const imdbId = externalIdsData?.imdb_id || '';

    // Find the official trailer (TMDb first)
    let trailerEmbedUrl = null;
    if (videosData?.results?.length > 0) {
        const trailerVideo = videosData.results.find(video =>
            video.site?.toLowerCase() === 'youtube' &&
            video.type?.toLowerCase() === 'trailer' &&
            video.official === true
        ) || videosData.results.find(video =>
            video.site?.toLowerCase() === 'youtube' &&
            video.type?.toLowerCase() === 'trailer'
        );
        if (trailerVideo) {
            trailerEmbedUrl = `https://www.youtube.com/embed/${trailerVideo.key}`;
        }
    }

    // Update Trailer Iframe or Link
    const trailerContainer = document.getElementById('trailer-container');
    if (trailerContainer) {
        if (trailerEmbedUrl) {
            // اگر تریلر از TMDb پیدا شد، مستقیماً نمایش داده می‌شود
            trailerContainer.innerHTML = `
                <iframe 
                    src="${trailerEmbedUrl}" 
                    title="تریلر فیلم ${title}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen 
                    class="w-full aspect-video max-w-3xl mx-auto rounded shadow-lg"
                ></iframe>
            `;
            console.log(`Trailer embedded from TMDb: ${trailerEmbedUrl}`);
        } else {
            // اگر تریلری در TMDb نبود، یک لینک به جستجوی YouTube نمایش داده می‌شود
            const searchQuery = encodeURIComponent(`${titleEnglish} ${year} official trailer`);
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
            trailerContainer.innerHTML = `
                <p class="text-yellow-500 text-center">تریلر رسمی در دسترس نیست. برای مشاهده تریلرهای احتمالی، <a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">اینجا کلیک کنید</a>.</p>
            `;
            console.log(`No TMDb trailer found for ${title}. Provided link to YouTube search: ${youtubeSearchUrl}`);
        }
    }

    // Update Text Content
    document.getElementById('title').textContent = title;
    document.getElementById('overview').textContent = overview;
    document.getElementById('genre-val').textContent = genres;
    document.getElementById('year-val').textContent = year;
    document.getElementById('rating-text').textContent = `${rating}/10`;
    document.getElementById('runTime-val').textContent = runTime;
    document.getElementById('director-val').textContent = directorName;

    const imdbLinkElement = document.getElementById('imdb-link');
    if (imdbLinkElement) {
        const imdbLinkHref = imdbId ? `https://www.imdb.com/title/${imdbId}/` : '#';
        imdbLinkElement.innerHTML = `
            <a href="${imdbLinkHref}" target="_blank" rel="noopener noreferrer" class="glass-card flex items-center justify-between p-4 rounded-2xl border-white/5 hover:bg-white/10 transition-all duration-300 group/imdb ${!imdbId ? 'opacity-50 cursor-not-allowed' : ''}">
                <div class="flex items-center gap-3">
                    <img src="https://m.media-amazon.com/images/G/01/imdb/images-ANDW73HA/favicon_desktop_32x32._CB1582158068_.png" alt="IMDb Logo" class="w-6 h-6 grayscale group-hover/imdb:grayscale-0 transition-all">
                    <span class="text-white font-bold">مشاهده در IMDb</span>
                </div>
                <i class="fas fa-external-link-alt text-xs text-gray-500 group-hover/imdb:text-amber-500 transition-colors"></i>
            </a>
        `;
        if (!imdbId) {
            imdbLinkElement.querySelector('a').onclick = (e) => e.preventDefault();
        }
    }

    const posterElement = document.getElementById('poster');
    if (posterElement) {
        posterElement.alt = `پوستر فیلم ${title}`;
        if (finalPosterUrl && finalPosterUrl !== defaultPoster) {
            posterElement.src = finalPosterUrl;
        }
    }

    const movieBgElement = document.getElementById('main-content-sections');
    if (movieBgElement) {
        movieBgElement.style.background = `linear-gradient(to bottom, rgba(7, 9, 15, 0.8), #07090f), url('${backdropUrl}')`;
        movieBgElement.style.backgroundSize = 'cover';
        movieBgElement.style.backgroundPosition = 'center';
        movieBgElement.style.backgroundAttachment = 'fixed';
    }

    document.title = `${title} (${year}) - فیری مووی`;
    const metaDesc = overview.substring(0, 160) + (overview.length > 160 ? '...' : '') || `جزئیات و دانلود فیلم ${title}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', finalPosterUrl);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', finalPosterUrl);

    const schemaElement = document.getElementById('movie-schema');
    if (schemaElement) {
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'Movie',
            'name': title,
            'description': overview,
            'genre': genres !== 'نامشخص' ? genres.split(', ') : undefined,
            'image': finalPosterUrl,
            'datePublished': movieData.release_date || undefined,
            'director': director ? { '@type': 'Person', 'name': directorName } : undefined,
            'duration': movieData.runtime ? `PT${movieData.runtime}M` : undefined,
            'countryOfOrigin': productionCountries !== 'نامشخص' ? productionCountries.split(', ') : undefined,
            'aggregateRating': (rating !== 'بدون امتیاز' && voteCount !== '0') ? {
                '@type': 'AggregateRating',
                'ratingValue': rating,
                'bestRating': '10',
                'ratingCount': voteCount
            } : undefined,
            'trailer': trailerEmbedUrl ? {
                '@type': 'VideoObject',
                'name': `تریلر فیلم ${title}`,
                'description': `تریلر رسمی فیلم ${title}`,
                'thumbnailUrl': backdropUrl,
                'embedUrl': trailerEmbedUrl,
                'uploadDate': movieData.release_date || undefined
            } : undefined,
            'url': window.location.href
        };
        Object.keys(schema).forEach(key => schema[key] === undefined && delete schema[key]);
        if (schema.director && !schema.director.name) delete schema.director;
        schemaElement.textContent = JSON.stringify(schema, null, 2);
        console.log("Schema.org JSON-LD updated.");
    }
}

/**
 * Generates and updates download links and subtitle link.
 * @param {string} imdbId - IMDb ID of the movie.
 * @param {string} year - Release year of the movie.
 * @param {string} title - Title of the movie.
 */
function updateDownloadLinks(imdbId, year, title) {
    const downloadLinksContainer = document.getElementById('download-links');
    if (!downloadLinksContainer) return;

    if (!imdbId || !year) {
        downloadLinksContainer.innerHTML = '<p class="text-yellow-500 text-center">اطلاعات لازم برای ایجاد لینک دانلود موجود نیست.</p>';
        return;
    }

    const imdbShort = imdbId.replace('tt', '');
    const encodedTitle = encodeURIComponent(title);
    const subtitleLink = `http://subtitlestar.com/go-to.php?imdb-id=${imdbId}&movie-name=${encodedTitle}`; // Ensure this URL is correct

    // Define download server URLs (replace with actual URLs if different)
    const serverBaseUrls = [
        'https://berlin.saymyname.website',
        'https://tokyo.saymyname.website',
        'https://nairobi.saymyname.website'
    ];
    const downloadPath = `/Movies/${year}/${imdbShort}`; // Ensure this path structure is correct

    let downloadLinksHtml = serverBaseUrls.map((baseUrl, index) => `
        <a href="${baseUrl}${downloadPath}"
           class="bg-amber-500 hover:bg-amber-400 text-black px-6 py-4 rounded-2xl font-black text-sm transition-all duration-300 hover:scale-105 flex items-center justify-center gap-3 shadow-xl shadow-amber-500/10 flex-1 min-w-[150px]"
           rel="nofollow noopener" target="_blank">
            <i class="fas fa-download"></i>
            <span>دانلود (${index === 0 ? 'اصلی' : `کمکی ${index}`})</span>
        </a>
    `).join('');

    downloadLinksHtml += `
        <a href="${subtitleLink}"
           class="bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 text-white px-6 py-4 rounded-2xl font-black text-sm transition-all duration-300 hover:scale-105 flex items-center justify-center gap-3 flex-1 min-w-[150px]"
           rel="nofollow noopener" target="_blank">
            <i class="fas fa-language text-amber-500"></i>
            <span>دریافت زیرنویس</span>
        </a>
    `;

    // Add placeholder for the watchlist button (will be initialized separately)
    downloadLinksHtml += `
        <button id="add-to-watchlist" class="glass-card text-white px-6 py-4 rounded-2xl font-black text-sm transition-all duration-300 hover:scale-105 flex items-center justify-center gap-3 flex-1 min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed">
             <i class="fas fa-bookmark text-amber-500"></i>
             <span>واچ‌لیست</span>
         </button>
    `;

    downloadLinksContainer.innerHTML = `<div class="flex flex-wrap items-center gap-4 w-full">${downloadLinksHtml}</div>`; // Wrap in a div for better layout
    console.log("Download links generated.");
}

/**
 * Sets up the watchlist button functionality.
 * @param {string} currentMovieId - The ID of the current movie.
 * @param {string} title - The title of the movie for messages.
 */
function setupWatchlistButton(currentMovieId, title) {
    // Re-use the exact same function from the series details script if it's shared
    // Or copy its logic here, adapted for movies:
    const watchlistButton = document.getElementById('add-to-watchlist');
    if (!watchlistButton) {
        console.warn("Watchlist button element not found after generating links.");
        return;
    }

    const storageKey = 'watchlist';
    let watchlist = { movies: [], series: [] };
    const normalizedMovieId = String(currentMovieId);

    try {
        const storedWatchlist = localStorage.getItem(storageKey);
        if (storedWatchlist) {
            watchlist = JSON.parse(storedWatchlist);
            if (!Array.isArray(watchlist.movies)) watchlist.movies = [];
            if (!Array.isArray(watchlist.series)) watchlist.series = [];
        }
    } catch (error) {
        console.error("Error reading watchlist from localStorage:", error);
        watchlist = { movies: [], series: [] };
    }

    const isInWatchlist = watchlist.movies.includes(normalizedMovieId);

    // Update button appearance and state
    watchlistButton.disabled = isInWatchlist;
    watchlistButton.classList.toggle('opacity-50', isInWatchlist);
    watchlistButton.classList.toggle('cursor-not-allowed', isInWatchlist);
    watchlistButton.querySelector('span').textContent = isInWatchlist ? 'در واچ‌لیست' : 'افزودن به واچ‌لیست';
    // Change icon based on state (optional)
    const iconSvg = watchlistButton.querySelector('svg');
    if (iconSvg) {
        iconSvg.innerHTML = isInWatchlist
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />' // Checkmark icon
            : '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />'; // Plus icon
    }


    if (!isInWatchlist) {
        watchlistButton.addEventListener('click', () => {
            try {
                let currentWatchlist = { movies: [], series: [] };
                const storedWatchlist = localStorage.getItem(storageKey);
                if (storedWatchlist) {
                    currentWatchlist = JSON.parse(storedWatchlist);
                    if (!Array.isArray(currentWatchlist.movies)) currentWatchlist.movies = [];
                    if (!Array.isArray(currentWatchlist.series)) currentWatchlist.series = [];
                }

                if (!currentWatchlist.movies.includes(normalizedMovieId)) {
                    currentWatchlist.movies.push(normalizedMovieId);
                    localStorage.setItem(storageKey, JSON.stringify(currentWatchlist));
                    alert(`"${title}" با موفقیت به واچ‌لیست اضافه شد!`);

                    // Update button state immediately after adding
                    watchlistButton.disabled = true;
                    watchlistButton.classList.add('opacity-50', 'cursor-not-allowed');
                    watchlistButton.querySelector('span').textContent = 'در واچ‌لیست';
                    if (iconSvg) iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />';

                } else {
                    alert(`"${title}" از قبل در واچ‌لیست شما وجود دارد.`);
                    watchlistButton.disabled = true; // Ensure it's disabled
                    watchlistButton.classList.add('opacity-50', 'cursor-not-allowed');
                    watchlistButton.querySelector('span').textContent = 'در واچ‌لیست';
                    if (iconSvg) iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />';
                }
            } catch (error) {
                console.error("Error saving to watchlist:", error);
                alert("خطا در ذخیره واچ‌لیست.");
            }
        }, { once: true }); // Listener runs only once
    }
    console.log(`Watchlist button setup complete. Is in watchlist: ${isInWatchlist}`);
}


// --- Main Function ---
async function getMovieDetails() {
    if (!movieId) {
        console.error('Movie ID is missing in the URL!');
        document.getElementById('main-content').innerHTML = '<p class="text-red-500 text-center mt-10 text-lg font-bold">خطا: شناسه فیلم در URL وجود ندارد!</p>';
        return;
    }
    showLoading();
    const generalErrorContainer = document.getElementById('general-error-message');
    if (generalErrorContainer) generalErrorContainer.style.display = 'none';

    try {
        // Define TMDB API URLs for Persian and English
        const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=${language}&append_to_response=credits,videos`;
        const movieDetailsEnglishUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=en-US`;
        const externalIdsUrl = `https://api.themoviedb.org/3/movie/${movieId}/external_ids?api_key=${apiKey}`;

        console.log("Fetching TMDB data concurrently...");
        console.time("TMDB Concurrent Fetch");
        const [detailsRes, detailsEnglishRes, externalIdsRes] = await Promise.all([
            fetch(movieDetailsUrl),
            fetch(movieDetailsEnglishUrl),
            fetch(externalIdsUrl)
        ]);
        console.timeEnd("TMDB Concurrent Fetch");

        if (!detailsRes.ok) throw new Error(`خطای TMDB (جزئیات/عوامل/ویدیو): ${detailsRes.status} ${detailsRes.statusText}`);
        if (!detailsEnglishRes.ok) throw new Error(`خطای TMDB (جزئیات انگلیسی): ${detailsEnglishRes.status} ${detailsEnglishRes.statusText}`);
        if (!externalIdsRes.ok) throw new Error(`خطای TMDB (شناسه‌های خارجی): ${externalIdsRes.status} ${externalIdsRes.statusText}`);

        console.time("Parse TMDB JSON");
        const [movieData, movieDataEnglish, externalIdsData] = await Promise.all([
            detailsRes.json(),
            detailsEnglishRes.json(),
            externalIdsRes.json()
        ]);
        console.timeEnd("Parse TMDB JSON");

        const imdbId = externalIdsData?.imdb_id || '';
        const title = movieData.title || 'فیلم بدون نام';
        const year = movieData.release_date ? movieData.release_date.substring(0, 4) : 'نامشخص';

        console.log(`Fetching OMDb poster for ${imdbId || 'N/A'}...`);
        console.time("OMDb Poster Fetch");
        const finalPosterUrl = await fetchOmdbPoster(imdbId);
        console.timeEnd("OMDb Poster Fetch");

        console.log("All data fetched. Updating DOM...");
        console.time("DOM Update");
        updateDomWithMovieDetails(movieData, movieDataEnglish, externalIdsData, movieData.videos, finalPosterUrl);
        updateDownloadLinks(imdbId, year, title);
        setupWatchlistButton(movieId, title);
        console.timeEnd("DOM Update");

    } catch (error) {
        console.error('خطا در دریافت و پردازش جزئیات فیلم:', error);
        if (generalErrorContainer) {
            generalErrorContainer.textContent = `متاسفانه مشکلی پیش آمد: ${error.message}`;
            generalErrorContainer.style.display = 'block';
        } else {
            alert(`خطا: ${error.message}`);
        }
        document.getElementById('main-content-sections')?.classList.add('hidden');
        document.getElementById('download-links').innerHTML = `<p class="text-red-500 text-center">به دلیل خطا، لینک‌های دانلود بارگذاری نشدند.</p>`;
    } finally {
        hideLoading();
        console.log("getMovieDetails processing finished.");
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Movie details page DOM loaded.");
    try {
        console.log("Initializing API Key Switcher...");
        await initializeSwitcher();
        console.log("Initialization complete. Fetching movie details...");
        await getMovieDetails();
    } catch (initializationError) {
        console.error("Critical Initialization Error:", initializationError);
        hideLoading();
        document.getElementById('main-content').innerHTML = `<div class="text-center mt-10 p-4 bg-red-800 text-white rounded">... خطای اساسی ...</div>`; // Display critical error
    }
});