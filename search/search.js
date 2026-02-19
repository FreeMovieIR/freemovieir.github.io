// search.js

// --- Configuration ---
const tmdbApiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // TMDb API key
const language = 'fa-IR';
const baseImageUrl = 'https://image.tmdb.org/t/p/w500'; // Base URL for TMDb images ( fallback if OMDB fails )
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie.png';
const minQueryLength = 3;

// --- Globals ---
let apiKeySwitcher; // Will hold the instance for OMDB key switching

// --- DOM Element References ---
const searchInput = document.getElementById('search');
const searchButton = document.getElementById('search-button');
const searchTypeSelect = document.getElementById('search-type');
const movieSection = document.getElementById('movie-results').closest('.search-column');
const tvSection = document.getElementById('tv-results').closest('.search-column');
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
        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
            (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
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
         <div id="loading-overlay" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50" aria-live="assertive">
              <div class="flex flex-col items-center">
                 <div class="popcorn mb-6">
                     <svg width="80" height="80" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="16" y="32" width="32" height="24" rx="4" fill="#ffaa07" stroke="#1f2937" stroke-width="2"/><rect x="12" y="28" width="40" height="8" rx="2" fill="#ffaa07"/><path d="M16 32 L48 32" stroke="#1f2937" stroke-width="2"/><path d="M16 36 L48 36" stroke="#1f2937" stroke-width="1"/><circle cx="24" cy="24" r="6" fill="#ffaa07" class="popcorn-piece" style="animation: pop 1.5s infinite ease-in-out;"/><circle cx="32" cy="20" r="5" fill="#ffaa07" class="popcorn-piece" style="animation: pop 1.5s infinite ease-in-out 0.2s;"/><circle cx="40" cy="24" r="6" fill="#ffaa07" class="popcorn-piece" style="animation: pop 1.5s infinite ease-in-out 0.4s;"/></svg>
                 </div>
                 <p class="text-white text-lg font-semibold">در حال دریافت نتایج...</p>
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
    const date = itemType === 'movie' ? item.release_date : item.first_air_date;
    const year = date ? date.substring(0, 4) : 'نامشخص';
    const encodedTitle = title.replace(/"/g, '&quot;');

    return `
         <div class="group relative overflow-hidden rounded-lg shadow-lg bg-gray-800" data-item-id="${id}">
             <img src="${defaultPoster}" alt="پوستر ${encodedTitle}" class="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" onerror="this.onerror=null; this.src='${defaultPoster}';">
             <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-100 group-hover:opacity-100 transition-opacity duration-300"></div>
             <div class="absolute inset-0 bg-black bg-opacity-70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end items-center text-center p-3">
                 <h3 class="text-base sm:text-lg font-bold text-white mb-1">${title}</h3>
                 <p class="text-sm text-gray-300 mb-2">${year}</p>
                 <a href="${itemType === 'movie' ? `../movie/index.html?id=${id}` : `../series/index.html?id=${id}`}" class="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors z-50">
                     مشاهده جزئیات
                 </a>
             </div>
              <div class="absolute bottom-0 left-0 right-0 p-2 bg-black bg-opacity-60 group-hover:opacity-0 transition-opacity duration-300">
                  <h3 class="text-sm font-bold text-white truncate" title="${encodedTitle}">${title}</h3>
                  <p class="text-xs text-gray-300">${year}</p>
              </div>
         </div>
     `;
}

/**
 * Displays initial results.
 */
function displayInitialResults(container, sectionElement, titleElement, items, itemType, query, notFoundMessage) {
    titleElement.textContent = `نتایج جستجو ${itemType === 'movie' ? 'فیلم' : 'سریال'} برای "${query}"`;

    if (items && items.length > 0) {
        const resultsHtml = items.map(item => createResultCard(item, itemType)).join('');
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
    const externalIdsUrl = `https://api.themoviedb.org/3/${itemType}/${itemId}/external_ids?api_key=${tmdbApiKey}`;
    let imdbId = null;

    try {
        const response = await fetch(externalIdsUrl);
        if (response.ok) {
            const idsData = await response.json();
            imdbId = idsData.imdb_id;
        } else {
            console.warn(`Failed to fetch external IDs for ${itemType} ${itemId}: ${response.status}`);
            return; // If no external IDs, can't fetch from OMDB
        }

        if (imdbId) {
            const posterUrl = await getCachedOrFetchPoster(imdbId, itemTitle);
            const imgElement = document.querySelector(`div[data-item-id="${itemId}"] img`);
            if (imgElement) {
                imgElement.src = posterUrl;
            }
        } else {
            console.warn(`No IMDb ID found for ${itemTitle} (ID: ${itemId}), using default poster.`);
            // Default poster is already set, no need to change
        }

    } catch (error) {
        console.error(`Error fetching and setting poster for ${itemType} ${itemTitle} (ID: ${itemId}):`, error);
    }
}

/**
 * Main function to search media based on query and type.
 */
async function searchMedia(query, searchType) {
    const cleanedQuery = query.trim().toLowerCase();
    if (cleanedQuery.length < minQueryLength) {
        alert(`لطفاً حداقل ${minQueryLength} کاراکتر وارد کنید.`);
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
        if (!response.ok) {
            throw new Error(`خطای API: ${response.status}`);
        }
        const data = await response.json();
        const allResults = data.results || [];

        let movieItems = [];
        let tvItems = [];

        if (searchType === 'movie' || searchType === 'all') {
            movieItems = allResults.filter(item => item.media_type === 'movie');
        }
        if (searchType === 'tv' || searchType === 'all') {
            tvItems = allResults.filter(item => item.media_type === 'tv');
        }

        // Display initial results with default posters
        if (searchType === 'movie' || searchType === 'all') {
            displayInitialResults(movieResultsContainer, movieSection, movieTitleElement, movieItems, 'movie', cleanedQuery, 'فیلمی با این مشخصات یافت نشد.');
            // Fetch and set posters asynchronously
            movieItems.forEach(movie => fetchAndSetPoster(movie, 'movie'));
        }
        if (searchType === 'tv' || searchType === 'all') {
            displayInitialResults(tvResultsContainer, tvSection, tvTitleElement, tvItems, 'tv', cleanedQuery, 'سریالی با این مشخصات یافت نشد.');
            // Fetch and set posters asynchronously
            tvItems.forEach(tv => fetchAndSetPoster(tv, 'tv'));
        }

        if (searchType === 'all' && movieItems.length === 0 && tvItems.length === 0) {
            console.log("هیچ نتیجه‌ای (نه فیلم، نه سریال) یافت نشد.");
        }

    } catch (error) {
        console.error('خطا در دریافت اطلاعات جستجو:', error);
        movieSection.classList.remove('hidden');
        movieResultsContainer.innerHTML = `<p class="text-center text-red-500 col-span-full">خطایی در هنگام جستجو رخ داد. لطفاً دوباره تلاش کنید.</p>`;
        tvSection.classList.add('hidden');
        movieTitleElement.textContent = 'خطا در جستجو';
        tvTitleElement.textContent = 'نتایج جستجو سریال'; // Reset
    } finally {
        hideLoading();
    }
}



function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

// --- Event Listeners & Initial Setup ---
function handleSearch() {
    const query = searchInput.value;
    const selectedType = searchTypeSelect.value;
    searchMedia(query, selectedType);
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

    const initialQuery = getQueryParam('q');
    if (initialQuery) {
        searchInput.value = initialQuery;
        handleSearch();
    }

    // Mobile menu toggle
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
        document.getElementById('mobile-menu')?.classList.toggle('hidden');
    });
});