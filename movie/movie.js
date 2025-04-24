
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
function updateDomWithMovieDetails(movieData, externalIdsData, videosData, finalPosterUrl) {
    const title = movieData.title || 'نامشخص';
    const year = movieData.release_date ? movieData.release_date.substring(0, 4) : 'نامشخص';
    const runTime = movieData.runtime ? `${movieData.runtime} دقیقه` : 'نامشخص';
    // Use TMDB backdrop, fallback to poster if needed, higher resolution
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
    const spokenLanguages = movieData.spoken_languages?.map(lang => lang.english_name).join(', ') || 'نامشخص'; // Using english_name for consistency
    const imdbId = externalIdsData?.imdb_id || '';

    // Find the official trailer (YouTube)
    let trailerVideo = null;
    if (videosData?.results?.length > 0) {
        trailerVideo = videosData.results.find(video =>
            video.site?.toLowerCase() === 'youtube' &&
            video.type?.toLowerCase() === 'trailer' &&
            video.official === true // Prefer official trailers
        );
        // Fallback to any YouTube trailer if no official one exists
        if (!trailerVideo) {
            trailerVideo = videosData.results.find(video =>
                video.site?.toLowerCase() === 'youtube' &&
                video.type?.toLowerCase() === 'trailer'
            );
        }
    }
    const trailerEmbedUrl = trailerVideo?.key ? `https://www.youtube.com/embed/${trailerVideo.key}` : null;

    // Update Text Content
    document.getElementById('title').textContent = `${title} (${year})`;
    document.getElementById('overview').innerHTML = `<strong>خلاصه داستان:</strong> ${overview}`;
    document.getElementById('genre').innerHTML = `<strong>ژانر:</strong> ${genres}`;
    document.getElementById('year').innerHTML = `<strong>سال تولید:</strong> ${year}`;
    document.getElementById('rating').innerHTML = `<strong>امتیاز:</strong> ${rating}/10`;
    document.getElementById('runTime').innerHTML = `<strong>مدت زمان:</strong> ${runTime}`;
    document.getElementById('spokenLanguages').innerHTML = `<strong>زبان‌ها:</strong> ${spokenLanguages}`;
    document.getElementById('budget').innerHTML = `<strong>بودجه:</strong> ${budget}`;
    document.getElementById('productionCountries').innerHTML = `<strong>محصول کشور:</strong> ${productionCountries}`;
    document.getElementById('director').innerHTML = `<strong>کارگردان:</strong> ${directorName}`;

    // Update IMDb Link
    const imdbLinkElement = document.getElementById('imdb-link');
    if (imdbLinkElement) {
        const imdbLinkHref = imdbId ? `https://www.imdb.com/title/${imdbId}/` : '#';
        imdbLinkElement.innerHTML = `
            <a href="${imdbLinkHref}" target="_blank" rel="noopener noreferrer" class="flex items-center text-yellow-500 hover:text-yellow-600 ${!imdbId ? 'opacity-50 cursor-not-allowed' : ''}">
                <img src="https://m.media-amazon.com/images/G/01/imdb/images-ANDW73HA/favicon_desktop_32x32._CB1582158068_.png" alt="IMDb Logo" class="w-5 h-5 ml-2">
                <span>صفحه IMDb ${!imdbId ? '(موجود نیست)' : ''}</span>
            </a>
        `;
        if (!imdbId) {
            imdbLinkElement.querySelector('a').onclick = (e) => e.preventDefault();
        }
    }

    // Update Poster (with preloading)
    const posterElement = document.getElementById('poster');
    if (posterElement) {
        posterElement.alt = `پوستر فیلم ${title}`;
        posterElement.src = defaultPoster; // Set default first
        if (finalPosterUrl && finalPosterUrl !== defaultPoster) {
            const tempImage = new Image();
            tempImage.onload = () => { posterElement.src = finalPosterUrl; };
            tempImage.onerror = () => { console.warn(`Failed to load poster: ${finalPosterUrl}. Keeping default.`); };
            tempImage.src = finalPosterUrl;
        }
    }

    // Update Background Image (using backdrop)
    // Add a default background color via CSS to #movie-bg for better UX
    const movieBgElement = document.getElementById('main-content-sections');
    if (movieBgElement) {
        movieBgElement.style.backgroundImage = `url('${finalPosterUrl}')`;
    }

    // Update Trailer Iframe
    const trailerContainer = document.getElementById('trailer-container'); // Assuming a container div now
    if (trailerContainer) {
        if (trailerEmbedUrl) {
            trailerContainer.innerHTML = `<iframe src="${trailerEmbedUrl}" title="تریلر فیلم ${title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full aspect-video max-w-3xl mx-auto rounded shadow-lg"></iframe>`;
            console.log(`Trailer embedded: ${trailerEmbedUrl}`);
        } else {
            trailerContainer.innerHTML = '<p class="text-yellow-500 text-center">تریلر رسمی در دسترس نیست</p>';
            console.log("No trailer available to embed.");
        }
    }

    // Update Meta Tags & Title
    document.title = `${title} (${year}) - فیری مووی`; // Update document title
    const metaDesc = overview.substring(0, 160) + (overview.length > 160 ? '...' : '') || `جزئیات و دانلود فیلم ${title}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', finalPosterUrl);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', finalPosterUrl);

    // Update Structured Data (JSON-LD)
    const schemaElement = document.getElementById('movie-schema');
    if (schemaElement) {
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'Movie',
            'name': title,
            'description': overview,
            'genre': genres !== 'نامشخص' ? genres.split(', ') : undefined,
            'image': finalPosterUrl,
            'datePublished': movieData.release_date || undefined, // Use full date if available
            'director': director ? { '@type': 'Person', 'name': directorName } : undefined,
            'duration': movieData.runtime ? `PT${movieData.runtime}M` : undefined, // ISO 8601 duration
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
        // Clean up undefined fields
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
           class="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition duration-200 text-sm font-medium flex items-center gap-1"
           rel="nofollow noopener" target="_blank">
            <span>دانلود (${index === 0 ? 'اصلی' : `کمکی ${index}`})</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        </a>
    `).join('');

    downloadLinksHtml += `
        <a href="${subtitleLink}"
           class="bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 transition duration-200 text-sm font-medium flex items-center gap-1"
           rel="nofollow noopener" target="_blank">
            <span>دریافت زیرنویس</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
        </a>
    `;

    // Add placeholder for the watchlist button (will be initialized separately)
    downloadLinksHtml += `
        <button id="add-to-watchlist" class="bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition duration-200 text-sm font-medium flex items-center gap-1 opacity-50" disabled>
             <span>واچ‌لیست</span>
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
         </button>
    `;


    downloadLinksContainer.innerHTML = `<div class="flex flex-wrap justify-center gap-3">${downloadLinksHtml}</div>`; // Wrap in a div for better layout
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
                    if(iconSvg) iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />';

                } else {
                    alert(`"${title}" از قبل در واچ‌لیست شما وجود دارد.`);
                    watchlistButton.disabled = true; // Ensure it's disabled
                    watchlistButton.classList.add('opacity-50', 'cursor-not-allowed');
                    watchlistButton.querySelector('span').textContent = 'در واچ‌لیست';
                    if(iconSvg) iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />';
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
    if(generalErrorContainer) generalErrorContainer.style.display = 'none';

    try {
        // 1. Define TMDB API URLs
        // Append credits and videos directly for fewer requests
        const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=${language}&append_to_response=credits,videos`;
        const externalIdsUrl = `https://api.themoviedb.org/3/movie/${movieId}/external_ids?api_key=${apiKey}`;

        // 2. Fetch TMDB data concurrently (Details+Credits+Videos, External IDs)
        console.log("Fetching TMDB data concurrently...");
        console.time("TMDB Concurrent Fetch");
        const [detailsRes, externalIdsRes] = await Promise.all([
            fetch(movieDetailsUrl),
            fetch(externalIdsUrl)
        ]);
        console.timeEnd("TMDB Concurrent Fetch");

        // Check responses immediately
        if (!detailsRes.ok) throw new Error(`خطای TMDB (جزئیات/عوامل/ویدیو): ${detailsRes.status} ${detailsRes.statusText}`);
        if (!externalIdsRes.ok) throw new Error(`خطای TMDB (شناسه‌های خارجی): ${externalIdsRes.status} ${externalIdsRes.statusText}`);

        // 3. Parse TMDB JSON data
        console.time("Parse TMDB JSON");
        const [movieData, externalIdsData] = await Promise.all([
            detailsRes.json(),
            externalIdsRes.json()
        ]);
        console.timeEnd("Parse TMDB JSON");

        // Extract IMDb ID
        const imdbId = externalIdsData?.imdb_id || '';
        const title = movieData.title || 'فیلم بدون نام'; // Get title early for logging/messages
        const year = movieData.release_date ? movieData.release_date.substring(0, 4) : 'نامشخص';


        // 4. Fetch OMDb poster (depends on IMDb ID)
        console.log(`Workspaceing OMDb poster for ${imdbId || 'N/A'}...`);
        console.time("OMDb Poster Fetch");
        const finalPosterUrl = await fetchOmdbPoster(imdbId); // Uses the function defined earlier
        console.timeEnd("OMDb Poster Fetch");


        // 5. Update DOM with all collected data
        console.log("All data fetched. Updating DOM...");
        console.time("DOM Update");
        // Pass movieData (which includes credits & videos), externalIdsData, and the final poster URL
        updateDomWithMovieDetails(movieData, externalIdsData, movieData.videos, finalPosterUrl); // Pass movieData.videos directly
        updateDownloadLinks(imdbId, year, title);
        setupWatchlistButton(movieId, title); // Setup listener AFTER download links HTML is set
        console.timeEnd("DOM Update");

    } catch (error) {
        console.error('خطا در دریافت و پردازش جزئیات فیلم:', error);
        if (generalErrorContainer) {
            generalErrorContainer.textContent = `متاسفانه مشکلی پیش آمد: ${error.message}`;
            generalErrorContainer.style.display = 'block';
        } else {
            alert(`خطا: ${error.message}`);
        }
        // Optionally hide main content sections on error
        document.getElementById('main-content-sections')?.classList.add('hidden');
        document.getElementById('download-links').innerHTML = `<p class="text-red-500 text-center">به دلیل خطا، لینک‌های دانلود بارگذاری نشدند.</p>`; // Clear links on error

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