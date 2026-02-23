const tmdbApiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';
const language = 'fa-IR';
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';

let includedGenres = new Set();
let excludedGenres = new Set();
let currentPage = 1;
let totalPages = 1;
let apiKeySwitcher;

// Base API endpoints
const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
const genreUrl = () => `${tmdbBase}/genre/movie/list?api_key=${localStorage.getItem('userTmdbToken') || tmdbApiKey}&language=${language}`;
const discoverBaseUrl = () => `${tmdbBase}/discover/movie?api_key=${localStorage.getItem('userTmdbToken') || tmdbApiKey}&language=${language}&include_adult=false&include_video=false`;

// DOM Elements
const includeContainer = document.getElementById('include-genres-container');
const excludeContainer = document.getElementById('exclude-genres-container');
const resultsContainer = document.getElementById('results-container');
const resultsLoader = document.getElementById('results-loader');
const searchBtn = document.getElementById('search-btn');
const ratingInput = document.getElementById('min-rating');
const ratingVal = document.getElementById('rating-val');
const sortSelect = document.getElementById('sort-by');
const pagination = document.getElementById('pagination');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof loadApiKeys === 'function') {
        apiKeySwitcher = await loadApiKeys();
    }
    await fetchGenres(); // Make sure genres are loaded before pre-selecting

    // Check for pre-selected genre from URL
    const urlParams = new URLSearchParams(window.location.search);
    const preGenreId = urlParams.get('genreId');
    if (preGenreId) {
        includedGenres.add(parseInt(preGenreId));
        const btn = document.querySelector(`#include-genres-container button[data-id="${preGenreId}"]`);
        if (btn) {
            btn.classList.add('selected-include');
            // Disable in exclude container
            const excludeBtn = document.querySelector(`#exclude-genres-container button[data-id="${preGenreId}"]`);
            if (excludeBtn) excludeBtn.classList.add('opacity-20', 'pointer-events-none');
        }
        performSearch(); // Auto-search if genre is specified
    }

    ratingInput.addEventListener('input', (e) => {
        ratingVal.textContent = parseFloat(e.target.value).toFixed(1);
    });

    searchBtn.addEventListener('click', () => {
        currentPage = 1;
        performSearch();
    });

    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            performSearch();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

async function fetchGenres() {
    try {
        const url = window.proxify ? window.proxify(genreUrl()) : genreUrl();
        const response = await fetch(url);
        const data = await response.json();

        if (data.genres) {
            renderGenreButtons(data.genres, includeContainer, 'include');
            renderGenreButtons(data.genres, excludeContainer, 'exclude');
        }
    } catch (error) {
        console.error('Error fetching genres:', error);
        includeContainer.innerHTML = '<p class="text-red-500 text-xs">خطا در ارتباط با سرور</p>';
    }
}

function renderGenreButtons(genres, container, type) {
    container.innerHTML = '';
    genres.forEach(genre => {
        const btn = document.createElement('button');
        btn.className = 'genre-btn px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs text-gray-400 hover:border-amber-500/50 hover:text-white cursor-pointer transition-all';
        btn.textContent = genre.name;
        btn.dataset.id = genre.id;

        btn.addEventListener('click', () => toggleGenre(btn, genre.id, type));
        container.appendChild(btn);
    });
}

function toggleGenre(btnElement, id, type) {
    const isInclude = type === 'include';
    const targetSet = isInclude ? includedGenres : excludedGenres;
    const oppositeSet = isInclude ? excludedGenres : includedGenres;
    const activeClass = isInclude ? 'selected-include' : 'selected-exclude';
    const oppositeContainerId = isInclude ? 'exclude-genres-container' : 'include-genres-container';

    if (targetSet.has(id)) {
        targetSet.delete(id);
        btnElement.classList.remove(activeClass);
        const oppositeBtn = document.querySelector(`#${oppositeContainerId} button[data-id="${id}"]`);
        if (oppositeBtn) oppositeBtn.classList.remove('opacity-20', 'pointer-events-none');
    } else {
        targetSet.add(id);
        btnElement.classList.add(activeClass);
        oppositeSet.delete(id);
        const oppositeBtn = document.querySelector(`#${oppositeContainerId} button[data-id="${id}"]`);
        if (oppositeBtn) {
            oppositeBtn.classList.remove('selected-include', 'selected-exclude');
            oppositeBtn.classList.add('opacity-20', 'pointer-events-none');
        }
    }
}

async function performSearch() {
    resultsContainer.innerHTML = '';
    resultsLoader.classList.remove('hidden');
    resultsLoader.classList.add('flex');
    pagination.classList.add('hidden');

    const sortOption = sortSelect.value;
    const minRating = ratingInput.value;

    let queryArgs = `&page=${currentPage}&sort_by=${sortOption}&vote_average.gte=${minRating}`;

    if (includedGenres.size > 0) {
        queryArgs += `&with_genres=${Array.from(includedGenres).join(',')}`;
    }
    if (excludedGenres.size > 0) {
        queryArgs += `&without_genres=${Array.from(excludedGenres).join(',')}`;
    }

    const searchUrl = discoverBaseUrl() + queryArgs;
    const proxiedUrl = window.proxify ? window.proxify(searchUrl) : searchUrl;

    try {
        const response = await fetch(proxiedUrl);
        const data = await response.json();

        resultsLoader.classList.add('hidden');
        resultsLoader.classList.remove('flex');

        if (data.results && data.results.length > 0) {
            totalPages = Math.min(data.total_pages, 500);
            renderResults(data.results);
            updatePagination();
        } else {
            showNoResults();
        }

    } catch (error) {
        console.error('Search error:', error);
        resultsLoader.classList.add('hidden');
        resultsLoader.classList.remove('flex');
        resultsContainer.innerHTML = `
            <div class="col-span-full py-16 text-center glass-card-premium rounded-3xl border border-red-500/20">
                <i class="fas fa-exclamation-triangle text-red-500 text-4xl mb-4"></i>
                <p class="text-red-400 font-bold">خطا در دریافت اطلاعات. لطفاً دوباره تلاش کنید.</p>
            </div>
        `;
    }
}

async function renderResults(movies) {
    resultsContainer.innerHTML = '';

    for (const movie of movies) {
        const tmdbImgBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
        let posterUrl = movie.poster_path ? `${tmdbImgBase}/w300${movie.poster_path}` : defaultPoster;

        // Use createMovieCard shared function
        if (window.createMovieCard) {
            const cardHtml = window.createMovieCard(movie, posterUrl, 'movie');
            resultsContainer.insertAdjacentHTML('beforeend', cardHtml);
        }
    }
}

function showNoResults() {
    resultsContainer.innerHTML = `
        <div class="col-span-full py-32 text-center glass-card-premium rounded-3xl border border-dashed border-white/10">
            <i class="fas fa-search-minus text-gray-500 text-5xl mb-6"></i>
            <h3 class="text-xl text-gray-300 font-bold mb-2">نتیجه‌ای یافت نشد</h3>
            <p class="text-gray-500 text-sm">فیلترهای خود را کمی تغییر دهید.</p>
        </div>
    `;
}

function updatePagination() {
    if (totalPages <= 1) {
        pagination.classList.add('hidden');
        return;
    }

    pagination.classList.remove('hidden');
    pageInfo.textContent = `صفحه ${currentPage} از ${totalPages}`;

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}
