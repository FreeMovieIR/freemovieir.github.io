// search.js

// --- Configuration ---
const tmdbApiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';
const language = 'fa-IR';
const tmdbImageBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
const baseImageUrl = `${tmdbImageBase}/w500`;
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie.png';
const minQueryLength = 3;

// --- Globals ---
let apiKeySwitcher; // Will hold the instance for OMDB key switching

// --- DOM Element References ---
const searchInput = document.getElementById('search');
const searchButton = document.getElementById('search-button');
const searchTypeSelect = document.getElementById('search-type');
const movieSection = document.getElementById('movie-section');
const tvSection = document.getElementById('tv-section');
const movieResultsContainer = document.getElementById('movie-results');
const tvResultsContainer = document.getElementById('tv-results');
const movieTitleElement = document.getElementById('movie-title');
const tvTitleElement = document.getElementById('tv-title');

// --- OMDB Poster Caching & Fetching ---

/**
 * Initializes the API key switcher for OMDB.
 * Assumes `loadApiKeys` function is defined elsewhere and returns the switcher instance.
 */
async function initializeSwitcher() {
    try {
        if (typeof loadApiKeys === 'function') {
            apiKeySwitcher = await loadApiKeys();
            console.log("API Key Switcher for OMDB initialized.");
        } else {
            console.warn('loadApiKeys function is not defined. OMDB poster fetching may fail.');
            // Provide a fallback mechanism or default key if needed
            apiKeySwitcher = {
                fetchWithKeySwitch: async (urlBuilder) => {
                    console.warn("Using fallback fetch: No API key switcher.");
                    throw new Error("API Key Switcher not available."); // Or return default data
                }
            };
        }
    } catch (error) {
        console.error("Failed to initialize API Key Switcher:", error);
        // Handle initialization failure, maybe disable OMDB fetching
        apiKeySwitcher = null; // Indicate failure
    }
}


/**
 * Gets an image URL from cache or fetches it from OMDB via apiKeySwitcher.
 * @param {string} imdbId - The IMDb ID of the movie/show.
 * @param {string} itemTitle - Title for logging purposes.
 * @returns {Promise<string>} - A promise resolving to the poster URL (or default).
 */
async function getCachedOrFetchPoster(imdbId, itemTitle) {
    if (!imdbId) {
        console.warn(`No IMDb ID provided for ${itemTitle}, using default poster.`);
        return Promise.resolve(defaultPoster);
    }
    if (!apiKeySwitcher) {
        console.warn(`API Key Switcher not available for ${itemTitle}, using default poster.`);
        return Promise.resolve(defaultPoster);
    }

    const cacheKey = `omdb_poster_${imdbId}`;
    const cachedImage = localStorage.getItem(cacheKey);

    if (cachedImage && cachedImage !== defaultPoster) {
        return Promise.resolve(cachedImage);
    }

    try {
        // Use the apiKeySwitcher to handle fetching and key rotation
        const omdbBase = window.CONFIG ? window.CONFIG.API.OMDB : 'https://www.omdbapi.com';
        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
            (key) => `${omdbBase}/?i=${imdbId}&apikey=${key}`
        );

        const posterUrl = (omdbData && omdbData.Poster && omdbData.Poster !== 'N/A') ? omdbData.Poster : defaultPoster;

        localStorage.setItem(cacheKey, posterUrl);
        return posterUrl;

    } catch (error) {
        console.error(`Error fetching OMDB poster for ${itemTitle} (IMDb: ${imdbId}):`, error.message);
        // Don't cache error state, return default poster for this attempt
        return defaultPoster;
    }
}

function showLoading() {
    if (document.getElementById('loading-overlay')) return;
    const loadingHtml = `
          <div id="loading-overlay" class="fixed inset-0 bg-base-950/40 backdrop-blur-xl flex items-center justify-center z-[100] transition-all duration-700">
               <div class="flex flex-col items-center reveal-on-scroll active">
                  <div class="inline-block relative w-24 h-24 mb-6">
                      <div class="absolute top-0 left-0 w-full h-full border-4 border-amber-500/10 rounded-full"></div>
                      <div class="absolute top-0 left-0 w-full h-full border-4 border-amber-500 rounded-full border-t-transparent animate-spin shadow-[0_0_20px_rgba(245,158,11,0.3)]"></div>
                      <i class="fas fa-search absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-amber-500 text-2xl animate-pulse"></i>
                  </div>
                  <p class="text-white text-2xl font-black tracking-tighter text-gradient-amber">در حال جستجوی هوشمند...</p>
              </div>
          </div>
      `;
    document.body.insertAdjacentHTML('beforeend', loadingHtml);
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.remove();
}

/**
 * Creates the HTML string for a single result card.
 * Expects item object to have `posterUrl` pre-fetched.
 * @param {object} item - The movie or TV item object.
 * @param {'movie' | 'tv'} itemType - The type of the item.
 * @returns {string} - The HTML string for the result card.
 */
function createResultCard(item, itemType) {
    const id = item.id;
    const title = itemType === 'movie' ? (item.title || 'نامشخص') : (item.name || 'نامشخص');
    const overview = item.overview ? `${item.overview.slice(0, 80)}...` : 'بدون توضیحات';
    const score = item.vote_average ? item.vote_average.toFixed(1) : '—';
    const paramText = itemType === 'movie' ? `m=${id}` : `s=${id}`;
    const typeLabel = itemType === 'movie' ? 'فیلم' : 'سریال';

    return `
        <div class="movie-card group relative overflow-hidden rounded-2xl glass-card transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl hover:shadow-amber-500/20 cursor-pointer" data-item-id="${id}">
            <div class="aspect-[2/3] relative overflow-hidden" onclick="window.location.href='/?${paramText}'">
                <img src="${defaultPoster}" alt="${title}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" onerror="this.onerror=null; this.src='${defaultPoster}';">
                <div class="movie-card-overlay absolute inset-0 flex flex-col justify-end p-5">
                    <div class="movie-card-info">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                                <i class="fas fa-star text-[8px]"></i> ${score}
                            </span>
                            <span class="text-white/40 text-[10px] font-bold uppercase tracking-widest">${typeLabel}</span>
                        </div>
                        <h3 class="text-lg font-black text-white mb-2 leading-tight line-clamp-2 drop-shadow-lg">${title}</h3>
                        <p class="text-xs text-gray-300 mb-4 line-clamp-2 opacity-80">${overview}</p>
                        <button class="w-full bg-white/10 hover:bg-amber-500 hover:text-black hover:scale-105 backdrop-blur-md text-white border border-white/10 text-xs font-black py-2.5 rounded-xl transition-all duration-300">
                            مشاهده جزئیات
                        </button>
                    </div>
                </div>
            </div>
            <div class="absolute top-3 right-3 glass-card px-2 py-1 rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity z-20" onclick="window.location.href='/?${paramText}'">
                <i class="fas fa-play text-[10px] text-amber-500"></i>
            </div>
        </div>
    `;
}

/**
 * Displays initial results.
 */
function displayInitialResults(container, sectionElement, titleElement, items, itemType, query, notFoundMessage) {
    const typeLabel = itemType === 'movie' ? 'فیلم' : 'سریال';
    titleElement.textContent = `نتایج ${typeLabel} برای "${query}"`;

    if (items && items.length > 0) {
        const resultsHtml = items.map(item => window.createMovieCard(item, defaultPoster, itemType)).join('');
        container.innerHTML = resultsHtml;
        sectionElement.classList.remove('hidden');
    } else {
        container.innerHTML = `<p class="text-center text-gray-400 col-span-full">${notFoundMessage}</p>`;
        sectionElement.classList.remove('hidden'); // Show section even if empty to display message
    }
}

/**
 * Fetches the poster for a single item and updates the DOM.
 * @param {object} item - The movie or TV item object.
 * @param {'movie' | 'tv'} itemType - The type of the item.
 */
async function fetchAndSetPoster(item, itemType) {
    const itemId = item.id;
    const itemTitle = itemType === 'movie' ? item.title : item.name;

    try {
        const posterUrl = await window.resolvePoster(itemId, itemType, item.poster_path);
        const imgElement = document.querySelector(`div[data-id="${itemId}"] img`);
        if (imgElement) {
            imgElement.src = posterUrl;
        }
    } catch (error) {
        console.error(`Error updating poster for ${itemId}:`, error);
    }
}

/**
 * Main function to search media based on query and type.
 */
async function searchMedia(query) {
    const cleanedQuery = query.trim().toLowerCase();
    if (cleanedQuery.length < minQueryLength) {
        if (window.showToast) {
            window.showToast(`حداقل ${minQueryLength} حرف وارد کنید.`, 'info');
        }
        return;
    }

    showLoading();
    movieResultsContainer.innerHTML = '';
    tvResultsContainer.innerHTML = '';
    movieSection.classList.add('hidden');
    tvSection.classList.add('hidden');

    const encodedQuery = encodeURIComponent(cleanedQuery);
    const searchMultiUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbApiKey}&language=${language}&query=${encodedQuery}`;

    try {
        const response = await fetch(searchMultiUrl);
        if (!response.ok) throw new Error(`خطای API: ${response.status}`);

        const data = await response.json();
        const allResults = data.results || [];

        const movieItems = allResults.filter(item => item.media_type === 'movie');
        const tvItems = allResults.filter(item => item.media_type === 'tv');

        // Professional Results Header Cleanup
        if (movieItems.length > 0) {
            movieSection.classList.add('search-results-section');
            displayInitialResults(movieResultsContainer, movieSection, movieTitleElement, movieItems, 'movie', cleanedQuery, 'فیلمی یافت نشد.');
            movieItems.forEach(movie => fetchAndSetPoster(movie, 'movie'));
        }

        if (tvItems.length > 0) {
            tvSection.classList.add('search-results-section', 'tv');
            displayInitialResults(tvResultsContainer, tvSection, tvTitleElement, tvItems, 'tv', cleanedQuery, 'سریالی یافت نشد.');
            tvItems.forEach(tv => fetchAndSetPoster(tv, 'tv'));
        }

        if (movieItems.length === 0 && tvItems.length === 0) {
            movieSection.classList.remove('hidden');
            movieResultsContainer.innerHTML = `
                <div class="col-span-full py-20 text-center glass-card-premium rounded-[2.5rem] border border-white/5">
                    <i class="fas fa-search text-gray-600 text-5xl mb-6"></i>
                    <h3 class="text-2xl font-black text-white">نتیجه‌ای یافت نشد</h3>
                    <p class="text-gray-400 mt-2">پوزش می‌طلبیم، اما اثری با عنوان "${query}" در آرشیو یافت نگردید.</p>
                </div>
            `;
        }

    } catch (error) {
        console.error('Search error:', error);
        movieSection.classList.remove('hidden');
        movieResultsContainer.innerHTML = `<p class="text-center text-red-500 py-10">خطایی در برقراری ارتباط با سرور رخ داد.</p>`;
    } finally {
        hideLoading();
    }
}

// --- Event Listeners & Initial Setup ---
function handleSearch() {
    searchMedia(searchInput.value);
}

searchButton.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    console.log("صفحه جستجو آماده است. در حال مقداردهی اولیه سوییچر کلید...");
    // Initialize the OMDB API key switcher before allowing searches
    await initializeSwitcher();

    movieSection.classList.add('hidden');
    tvSection.classList.add('hidden');
    movieTitleElement.textContent = 'نتایج جستجو فیلم';
    tvTitleElement.textContent = 'نتایج جستجو سریال';

    // Handle query parameter from URL
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get('q');
    if (queryParam) {
        searchInput.value = queryParam;
        searchMedia(queryParam, 'all');
    }

    // Mobile menu toggle
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
        document.getElementById('mobile-menu')?.classList.toggle('hidden');
    });
});
