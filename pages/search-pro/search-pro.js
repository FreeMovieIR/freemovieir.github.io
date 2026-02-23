const tmdbApiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';
const language = 'fa-IR';
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';

let currentPage = 1;
let totalPages = 1;
let currentFilters = {};
let apiKeySwitcher;

// DOM Elements
const genreGrid = document.getElementById('genre-grid');
const countryGrid = document.getElementById('country-grid');
const searchButton = document.getElementById('advanced-search-button');
const resultsContainer = document.getElementById('movie-results');
const resultsLoader = document.getElementById('results-loader');
const loadMoreButton = document.getElementById('load-more-button');
const resultsHeader = document.getElementById('results-header');
const resultsCount = document.getElementById('results-count');

const genresData = [
  { id: 28, name: 'اکشن' }, { id: 12, name: 'ماجراجویی' }, { id: 16, name: 'انیمیشن' },
  { id: 35, name: 'کمدی' }, { id: 80, name: 'جنایی' }, { id: 18, name: 'درام' },
  { id: 10751, name: 'خانوادگی' }, { id: 14, name: 'فانتزی' }, { id: 27, name: 'ترسناک' },
  { id: 9648, name: 'رازآلود' }, { id: 10749, name: 'عاشقانه' }, { id: 878, name: 'علمی-تخیلی' },
  { id: 53, name: 'هیجان‌انگیز' }, { id: 10752, name: 'جنگی' }, { id: 37, name: 'وسترن' }
];

const countriesData = [
  { id: 'US', name: 'آمریکا' }, { id: 'IR', name: 'ایران' }, { id: 'GB', name: 'بریتانیا' },
  { id: 'FR', name: 'فرانسه' }, { id: 'JP', name: 'ژاپن' }, { id: 'KR', name: 'کره جنوبی' },
  { id: 'IN', name: 'هند' }, { id: 'DE', name: 'آلمان' }, { id: 'ES', name: 'اسپانیا' }
];

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof loadApiKeys === 'function') {
    apiKeySwitcher = await loadApiKeys();
  }

  renderFilterOptions();

  searchButton.addEventListener('click', () => {
    currentPage = 1;
    resultsContainer.innerHTML = '';
    currentFilters = getSelectedFilters();
    performAdvancedSearch();
  });

  loadMoreButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      performAdvancedSearch();
    }
  });
});

function renderFilterOptions() {
  // Render Genres
  genreGrid.innerHTML = genresData.map(genre => `
        <div class="relative group">
            <input type="checkbox" id="genre-${genre.id}" name="with-genres" value="${genre.id}" class="hidden">
            <label for="genre-${genre.id}" class="checkbox-label block w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-center text-gray-400 cursor-pointer hover:border-amber-500/50">
                ${genre.name}
            </label>
        </div>
    `).join('');

  // Render Countries
  countryGrid.innerHTML = countriesData.map(country => `
        <div class="relative group">
            <input type="checkbox" id="country-${country.id}" name="with-countries" value="${country.id}" class="hidden">
            <label for="country-${country.id}" class="checkbox-label block w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-center text-gray-400 cursor-pointer hover:border-amber-500/50">
                ${country.name}
            </label>
        </div>
    `).join('');
}

function getSelectedFilters() {
  const genreCheckboxes = document.querySelectorAll('input[name="with-genres"]:checked');
  const countryCheckboxes = document.querySelectorAll('input[name="with-countries"]:checked');
  const minVote = document.getElementById('min-vote').value;
  const year = document.getElementById('release-year').value;

  return {
    genres: Array.from(genreCheckboxes).map(cb => cb.value).join(','),
    countries: Array.from(countryCheckboxes).map(cb => cb.value).join(','),
    minVote: minVote || 0,
    year: year || ''
  };
}

async function performAdvancedSearch() {
  resultsLoader.classList.remove('hidden');
  loadMoreButton.classList.add('hidden');

  const tmdbKey = localStorage.getItem('userTmdbToken') || tmdbApiKey;
  const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
  let url = `${tmdbBase}/discover/movie?api_key=${tmdbKey}&language=${language}&page=${currentPage}&sort_by=popularity.desc&include_adult=false`;

  if (currentFilters.genres) url += `&with_genres=${currentFilters.genres}`;
  if (currentFilters.countries) url += `&with_origin_country=${currentFilters.countries}`;
  if (currentFilters.minVote) url += `&vote_average.gte=${currentFilters.minVote}`;
  if (currentFilters.year) url += `&primary_release_year=${currentFilters.year}`;

  const proxiedUrl = window.proxify ? window.proxify(url) : url;

  try {
    const response = await fetch(proxiedUrl);
    const data = await response.json();

    resultsLoader.classList.add('hidden');
    resultsHeader.classList.remove('hidden');
    resultsCount.textContent = `${data.total_results.toLocaleString('fa-IR')} مورد یافت شد`;

    if (data.results && data.results.length > 0) {
      totalPages = Math.min(data.total_pages, 500);
      renderResults(data.results);

      if (currentPage < totalPages) {
        loadMoreButton.classList.remove('hidden');
      }
    } else if (currentPage === 1) {
      showNoResults();
    }

  } catch (error) {
    console.error('Search error:', error);
    resultsLoader.classList.add('hidden');
    if (window.showToast) window.showToast('خطا در جستجو!', 'info');
  }
}

function renderResults(movies) {
  movies.forEach(movie => {
    const tmdbImgBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
    let posterUrl = movie.poster_path ? `${tmdbImgBase}/w300${movie.poster_path}` : defaultPoster;

    if (window.createMovieCard) {
      const cardHtml = window.createMovieCard(movie, posterUrl, 'movie');
      resultsContainer.insertAdjacentHTML('beforeend', cardHtml);
    }
  });
}

function showNoResults() {
  resultsContainer.innerHTML = `
        <div class="col-span-full py-20 text-center glass-card-premium rounded-3xl border border-dashed border-white/10">
            <i class="fas fa-search-minus text-gray-500 text-5xl mb-6"></i>
            <h3 class="text-xl text-gray-300 font-bold mb-2">نتیجه‌ای یافت نشد</h3>
            <p class="text-gray-500 text-sm">لطفاً فیلترها را تغییر بدهید.</p>
        </div>
    `;
}