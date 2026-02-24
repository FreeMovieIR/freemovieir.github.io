// watchlist.js
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';
let apiKeySwitcher;

async function loadWatchlist() {
    const movieContainer = document.getElementById('movies-watchlist');
    const tvContainer = document.getElementById('series-watchlist');
    const emptyMessage = document.getElementById('empty-watchlist');

    const watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };

    if (movieContainer) movieContainer.innerHTML = '';
    if (tvContainer) tvContainer.innerHTML = '';

    const hasMovies = watchlist.movies.length > 0;
    const hasSeries = watchlist.series.length > 0;

    const totalCount = watchlist.movies.length + watchlist.series.length;
    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) totalCountEl.textContent = totalCount.toLocaleString('fa-IR');

    if (!hasMovies && !hasSeries) {
        if (emptyMessage) emptyMessage.classList.remove('hidden');
    } else {
        if (emptyMessage) emptyMessage.classList.add('hidden');

        if (hasMovies) document.getElementById('movies-heading')?.classList.remove('hidden');
        if (hasSeries) document.getElementById('series-heading')?.classList.remove('hidden');

        if (typeof loadApiKeys === 'function' && !apiKeySwitcher) {
            apiKeySwitcher = await loadApiKeys();
        }

        watchlist.movies.forEach(id => fetchAndDisplayItem(id, 'movie', movieContainer));
        watchlist.series.forEach(id => fetchAndDisplayItem(id, 'tv', tvContainer));
    }
}

async function fetchAndDisplayItem(itemId, type, container) {
    if (!container) return;
    try {
        const tmdbKey = localStorage.getItem('userTmdbToken') || (window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc');
        const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
        const proxify = window.proxify || ((url) => url);

        const apiUrl = proxify(type === 'movie'
            ? `${tmdbBase}/movie/${itemId}?api_key=${tmdbKey}&language=fa-IR`
            : `${tmdbBase}/tv/${itemId}?api_key=${tmdbKey}&language=fa-IR`);

        const externalIdsUrl = proxify(type === 'movie'
            ? `${tmdbBase}/movie/${itemId}/external_ids?api_key=${tmdbKey}`
            : `${tmdbBase}/tv/${itemId}/external_ids?api_key=${tmdbKey}`);

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`TMDB Error: ${response.status}`);
        const data = await response.json();

        // Use global window.resolvePoster which handles Cache -> TMDB -> TVMaze -> OMDB
        const posterUrl = await window.resolvePoster(itemId, type, data.poster_path);
        const itemCard = window.createMovieCard(data, posterUrl, type);

        // Wrap in a container to add the trash button (since createMovieCard is generic)
        const wrapper = document.createElement('div');
        wrapper.className = 'relative group/wrapper';
        wrapper.innerHTML = itemCard;

        const trashBtn = document.createElement('button');
        trashBtn.onclick = (e) => {
            e.stopPropagation();
            window.removeFromWatchlist(itemId, type);
        };
        trashBtn.className = 'absolute top-3 left-3 bg-red-500/20 hover:bg-red-500 backdrop-blur-md text-white w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 opacity-0 group-hover/wrapper:opacity-100 z-30 shadow-lg border border-red-500/30 hover:scale-110';
        trashBtn.innerHTML = '<i class="fas fa-trash-alt text-sm"></i>';

        wrapper.appendChild(trashBtn);
        container.appendChild(wrapper);
    } catch (error) {
        console.error(`Error loading watchlist item ${itemId}:`, error);
    }
}

window.removeFromWatchlist = function (itemId, type) {
    const watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
    const normalizedItemId = String(itemId);

    if (type === 'movie') {
        watchlist.movies = watchlist.movies.filter(id => String(id) !== normalizedItemId);
    } else {
        watchlist.series = watchlist.series.filter(id => String(id) !== normalizedItemId);
    }

    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    if (window.showToast) {
        window.showToast('از واچ‌لیست حذف شد!', 'info');
    }
    loadWatchlist();
};

document.addEventListener('DOMContentLoaded', loadWatchlist);