// search.js - Refactored for DRY & Professional API

const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : '/assets/images/default-freemovie-300.png';
const minQueryLength = 2;

// --- DOM References ---
const searchInput = document.getElementById('search');
const searchButton = document.getElementById('search-button');
const movieSection = document.getElementById('movie-section');
const tvSection = document.getElementById('tv-section');
const movieResultsContainer = document.getElementById('movie-results');
const tvResultsContainer = document.getElementById('tv-results');
const movieTitleElement = document.getElementById('movie-title');
const tvTitleElement = document.getElementById('tv-title');

function showLoading() {
    if (document.getElementById('loading-overlay')) return;
    const loadingHtml = `
          <div id="loading-overlay" class="fixed inset-0 bg-[#07090f]/80 backdrop-blur-xl flex items-center justify-center z-[100]">
               <div class="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                  <div class="relative w-24 h-24 mb-6">
                      <div class="absolute inset-0 border-4 border-amber-500/10 rounded-full"></div>
                      <div class="absolute inset-0 border-4 border-amber-500 rounded-full border-t-transparent animate-spin"></div>
                      <i class="fas fa-search absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-500 text-2xl"></i>
                  </div>
                  <p class="text-white text-xl font-black">${window.i18n.t('search_mobile')}</p>
              </div>
          </div>
      `;
    document.body.insertAdjacentHTML('beforeend', loadingHtml);
}

function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.remove();
}

async function searchMedia(query) {
    if (!query || query.trim().length < minQueryLength) {
        if (window.showToast) window.showToast(window.i18n.t('search_placeholder'), 'info');
        return;
    }

    showLoading();
    movieResultsContainer.innerHTML = '';
    tvResultsContainer.innerHTML = '';
    movieSection.classList.add('hidden');
    tvSection.classList.add('hidden');

    try {
        const { movies, series, source } = await window.FreeMovieAPI.SmartFetch.search(query);
        console.log(`Search results loaded via ${source.toUpperCase()}`);

        if (movies.length > 0) {
            movieSection.classList.remove('hidden');
            movieTitleElement.textContent = `نتایج فیلم برای "${query}"`;
            movies.forEach(item => {
                movieResultsContainer.innerHTML += window.createMovieCard(item, item.poster_path || item.image, 'movie');
            });
        }

        if (series.length > 0) {
            tvSection.classList.remove('hidden');
            tvTitleElement.textContent = `نتایج سریال برای "${query}"`;
            series.forEach(item => {
                tvResultsContainer.innerHTML += window.createMovieCard(item, item.poster_path || item.image, 'series');
            });
        }

        if (movies.length === 0 && series.length === 0) {
            movieSection.classList.remove('hidden');
            movieResultsContainer.innerHTML = `
                <div class="col-span-full py-20 text-center glass-card rounded-3xl">
                    <i class="fas fa-search text-gray-700 text-5xl mb-6"></i>
                    <h3 class="text-2xl font-black text-white">${window.i18n.t('not_found')}</h3>
                </div>
            `;
        }

        if (window.refreshRevealObserver) window.refreshRevealObserver();

    } catch (error) {
        console.error('Search error:', error);
        if (window.showToast) window.showToast('Error connecting to search server', 'error');
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) {
        searchInput.value = q;
        searchMedia(q);
    }

    searchButton.onclick = () => searchMedia(searchInput.value);
    searchInput.onkeypress = (e) => { if (e.key === 'Enter') searchMedia(searchInput.value); };
});
