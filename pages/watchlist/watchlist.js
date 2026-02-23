// watchlist.js
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';

const proxify = (url) =>
    `https://odd-disk-9903.armin-apple816467.workers.dev/?url=${encodeURIComponent(url)}`;

let apiKeySwitcher;

async function loadWatchlist() {
    const movieContainer = document.getElementById('movie-watchlist');
    const tvContainer = document.getElementById('tv-watchlist');
    const emptyMessage = document.getElementById('empty-watchlist-message');

    const watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };

    movieContainer.innerHTML = '';
    tvContainer.innerHTML = '';

    const hasMovies = watchlist.movies.length > 0;
    const hasSeries = watchlist.series.length > 0;

    if (!hasMovies && !hasSeries) {
        emptyMessage.classList.remove('hidden');
    } else {
        emptyMessage.classList.add('hidden');

        // Load API Keys for OMDB
        if (typeof loadApiKeys === 'function') {
            apiKeySwitcher = await loadApiKeys();
        }

        watchlist.movies.forEach(id => fetchAndDisplayItem(id, 'movie', movieContainer));
        watchlist.series.forEach(id => fetchAndDisplayItem(id, 'tv', tvContainer));
    }
}

async function fetchAndDisplayItem(itemId, type, container) {
    try {
        const tmdbKey = localStorage.getItem('userTmdbToken') || '1dc4cbf81f0accf4fa108820d551dafc';
        const apiUrl = proxify(type === 'movie'
            ? `https://api.themoviedb.org/3/movie/${itemId}?api_key=${tmdbKey}&language=fa-IR`
            : `https://api.themoviedb.org/3/tv/${itemId}?api_key=${tmdbKey}&language=fa-IR`);

        const externalIdsUrl = proxify(type === 'movie'
            ? `https://api.themoviedb.org/3/movie/${itemId}/external_ids?api_key=${tmdbKey}`
            : `https://api.themoviedb.org/3/tv/${itemId}/external_ids?api_key=${tmdbKey}`);

        // Fetch TMDb data
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`خطای سرور (داده‌های ${type}): ${response.status}`);
        const data = await response.json();

        // Fetch IMDb ID
        const externalIdsRes = await fetch(externalIdsUrl);
        const externalIdsData = externalIdsRes.ok ? await externalIdsRes.json() : {};
        const imdbId = externalIdsData.imdb_id || '';

        let posterUrl = defaultPoster;
        if (imdbId && apiKeySwitcher) {
            try {
                const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                    (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
                );
                if (omdbData.Poster && omdbData.Poster !== 'N/A') {
                    posterUrl = omdbData.Poster.replace(/300(?=\.jpg$)/i, '');
                }
            } catch (e) { console.warn('OMDB poster fetch failed', e); }
        }

        const itemTitle = type === 'movie' ? (data.title || 'نامشخص') : (data.name || 'نامشخص');
        const overview = data.overview ? `${data.overview.slice(0, 80)}...` : 'بدون توضیحات';
        const score = data.vote_average ? data.vote_average.toFixed(1) : '—';
        const paramText = type === 'movie' ? `m=${itemId}` : `s=${itemId}`;

        const itemCard = `
            <div class="movie-card group relative overflow-hidden rounded-2xl glass-card transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl hover:shadow-amber-500/20 cursor-pointer">
                <div class="aspect-[2/3] relative overflow-hidden" onclick="window.location.href='/?${paramText}'">
                    <img src="${posterUrl}" alt="${itemTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
                    <div class="movie-card-overlay absolute inset-0 flex flex-col justify-end p-5">
                        <div class="movie-card-info">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <i class="fas fa-star text-[8px]"></i> ${score}
                                </span>
                                <span class="text-white/40 text-[10px] font-bold uppercase tracking-widest">${type === 'movie' ? 'فیلم' : 'سریال'}</span>
                            </div>
                            <h3 class="text-lg font-black text-white mb-2 leading-tight line-clamp-2 drop-shadow-lg">${itemTitle}</h3>
                            <p class="text-xs text-gray-300 mb-4 line-clamp-2 opacity-80">${overview}</p>
                            <div class="flex gap-2">
                                <button onclick="window.location.href='/?${paramText}'" class="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 text-[10px] font-black py-2 rounded-xl transition-all duration-300">
                                    جزئیات
                                </button>
                                <button onclick="removeFromWatchlist('${itemId}', '${type}')" class="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white backdrop-blur-md border border-red-500/20 text-[10px] font-black px-3 py-2 rounded-xl transition-all duration-300">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="absolute top-3 right-3 glass-card px-2 py-1 rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity z-20" onclick="window.location.href='/?${paramText}'">
                    <i class="fas fa-play text-[10px] text-amber-500"></i>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemCard);
    } catch (error) {
        console.error(`خطا در دریافت اطلاعات ${type === 'movie' ? 'فیلم' : 'سریال'} با شناسه ${itemId}:`, error.message);
    }
}

// تعریف تابع به‌صورت سراسری برای دسترسی از HTML
function removeFromWatchlist(itemId, type) {
    const watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
    const normalizedItemId = String(itemId);

    if (type === 'movie') {
        watchlist.movies = watchlist.movies.filter(id => String(id) !== normalizedItemId);
    } else if (type === 'tv' || type === 'series') {
        watchlist.movies = watchlist.movies.filter(id => String(id) !== normalizedItemId);
        watchlist.series = watchlist.series.filter(id => String(id) !== normalizedItemId);
    }

    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    if (window.showToast) {
        window.showToast('از واچ‌لیست حذف شد!', 'info');
    }
    loadWatchlist();
}

document.addEventListener('DOMContentLoaded', loadWatchlist);