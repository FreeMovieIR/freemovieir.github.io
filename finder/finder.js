const tmdbApiKey = '1dc4cbf81f0accf4fa108820d551dafc';
const language = 'fa-IR';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';

let includedGenres = new Set();
let excludedGenres = new Set();
let currentPage = 1;
let totalPages = 1;

// Base API endpoints
const genreUrl = `https://api.themoviedb.org/3/genre/movie/list?api_key=${tmdbApiKey}&language=${language}`;
const discoverBaseUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${tmdbApiKey}&language=${language}&include_adult=false&include_video=false`;

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
document.addEventListener('DOMContentLoaded', () => {
    fetchGenres();

    // Rating slider listener
    ratingInput.addEventListener('input', (e) => {
        ratingVal.textContent = parseFloat(e.target.value).toFixed(1);
    });

    // Search button listener
    searchBtn.addEventListener('click', () => {
        currentPage = 1; // reset page on new search
        performSearch();
    });

    // Pagination listeners
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
        const response = await fetch(genreUrl);
        const data = await response.json();

        if (data.genres) {
            renderGenreButtons(data.genres, includeContainer, 'include');
            renderGenreButtons(data.genres, excludeContainer, 'exclude');
        }
    } catch (error) {
        console.error('Error fetching genres:', error);
        includeContainer.innerHTML = '<p class="text-red-500 text-sm">خطا در ارتباط با سرور</p>';
    }
}

function renderGenreButtons(genres, container, type) {
    container.innerHTML = '';
    genres.forEach(genre => {
        const btn = document.createElement('button');
        btn.className = 'genre-btn px-4 py-2 bg-base-800 border border-gray-700 rounded-full text-sm text-gray-300 hover:border-accent hover:text-white cursor-pointer';
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
    const oppositeClass = isInclude ? 'selected-exclude' : 'selected-include';
    const activeClass = isInclude ? 'selected-include' : 'selected-exclude';
    const oppositeContainerId = isInclude ? 'exclude-genres-container' : 'include-genres-container';

    if (targetSet.has(id)) {
        // Deselect
        targetSet.delete(id);
        btnElement.classList.remove(activeClass);
        // Re-enable opposite
        const oppositeBtn = document.querySelector(`#${oppositeContainerId} button[data-id="${id}"]`);
        if (oppositeBtn) oppositeBtn.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        // Select
        targetSet.add(id);
        btnElement.classList.add(activeClass);
        // Disable opposite
        oppositeSet.delete(id);
        const oppositeBtn = document.querySelector(`#${oppositeContainerId} button[data-id="${id}"]`);
        if (oppositeBtn) {
            oppositeBtn.classList.remove(oppositeClass);
            oppositeBtn.classList.add('opacity-50', 'pointer-events-none');
        }
    }
}

async function performSearch() {
    // Show loader
    resultsContainer.innerHTML = '';
    resultsLoader.classList.remove('hidden');
    resultsLoader.classList.add('flex');
    pagination.classList.add('hidden');

    const sortOption = sortSelect.value;
    const minRating = ratingInput.value;

    // Build query parameters
    let queryArgs = `&page=${currentPage}&sort_by=${sortOption}&vote_average.gte=${minRating}`;

    if (includedGenres.size > 0) {
        queryArgs += `&with_genres=${Array.from(includedGenres).join(',')}`;
    }
    if (excludedGenres.size > 0) {
        queryArgs += `&without_genres=${Array.from(excludedGenres).join(',')}`;
    }

    const searchUrl = discoverBaseUrl + queryArgs;

    try {
        const response = await fetch(searchUrl);
        const data = await response.json();

        resultsLoader.classList.add('hidden');
        resultsLoader.classList.remove('flex');

        if (data.results && data.results.length > 0) {
            totalPages = Math.min(data.total_pages, 500); // TMDB limits to 500 pages
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
            <div class="col-span-full py-16 text-center bg-red-900/20 border border-red-500/50 rounded-xl">
                <i class="fas fa-exclamation-triangle text-red-500 text-4xl mb-4"></i>
                <p class="text-red-400 font-bold">خطا در دریافت اطلاعات. لطفاً دوباره تلاش کنید.</p>
            </div>
        `;
    }
}

function renderResults(movies) {
    let html = '';
    movies.forEach(movie => {
        const title = movie.title || movie.name || 'نامشخص';
        const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : defaultPoster;
        const overview = movie.overview ? `${movie.overview.slice(0, 80)}...` : 'بدون توضیحات';
        const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '—';
        const route = 'movie'; // discover endpoint is explicitly movies here

        html += `
            <div class="group relative overflow-hidden rounded-xl shadow-[0_10px_20px_rgba(0,0,0,0.5)] transform transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl hover:shadow-accent/20 cursor-pointer border border-gray-700/50" onclick="window.location.href='/${route}/index.html?id=${movie.id}'">
                <img src="${poster}" alt="${title}" loading="lazy" class="w-full aspect-[2/3] object-cover transition-transform duration-700 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-base-900 via-base-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 lg:translate-y-4 group-hover:translate-y-0">
                    <h3 class="text-lg font-bold text-white mb-1 drop-shadow-md truncate">${title}</h3>
                    <p class="text-xs text-gray-300 mb-4 line-clamp-3">${overview}</p>
                    <a href="/${route}/index.html?id=${movie.id}" class="mt-auto w-full text-center bg-gradient-to-r from-accent to-yellow-500 text-base-900 font-bold py-2 rounded-lg hover:from-yellow-400 hover:to-yellow-300 transition-colors shadow-[0_0_10px_rgba(255,193,7,0.4)] block text-sm">مشاهده</a>
                </div>
                <div class="absolute top-2 right-2 bg-base-900/80 backdrop-blur-md rounded-lg px-2 py-1 flex items-center gap-1 border border-white/10 shadow-lg">
                    <i class="fas fa-star text-accent text-xs drop-shadow-[0_0_5px_rgba(255,193,7,0.8)]"></i>
                    <span class="text-white text-xs font-bold">${rating}</span>
                </div>
            </div>
        `;
    });

    resultsContainer.innerHTML = html;
}

function showNoResults() {
    resultsContainer.innerHTML = `
        <div class="col-span-full py-16 text-center bg-base-800/50 border border-gray-700 rounded-xl">
            <i class="fas fa-search-minus text-gray-500 text-5xl mb-4"></i>
            <h3 class="text-xl text-gray-300 font-bold mb-2">متاسفانه فیلمی با این مشخصات پیدا نشد!</h3>
            <p class="text-gray-500 text-sm">لطفاً فیلترها رو کمی تغییر بدید و دوباره امتحان کنید.</p>
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
