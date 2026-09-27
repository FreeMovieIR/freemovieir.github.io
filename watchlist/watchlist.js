// watchlist.js
// Modernized, centralized watchlist view using WatchlistStore, FreeMovieUI and FreeMovieApi
const apiClient = window.FreeMovieApi;

async function loadWatchlist() {
    const moviesContainer = document.getElementById('movies-watchlist');
    const seriesContainer = document.getElementById('series-watchlist');
    const moviesHeading = document.getElementById('movies-heading');
    const seriesHeading = document.getElementById('series-heading');
    const emptyMessage = document.getElementById('empty-watchlist');

    if (!moviesContainer || !seriesContainer || !moviesHeading || !seriesHeading || !emptyMessage) {
        return;
    }

    const watchlist = window.WatchlistStore
        ? window.WatchlistStore.get()
        : { movies: [], series: [] };

    if (watchlist.movies.length === 0 && watchlist.series.length === 0) {
        moviesContainer.innerHTML = '';
        seriesContainer.innerHTML = '';
        moviesHeading.classList.add('hidden');
        seriesHeading.classList.add('hidden');
        emptyMessage.classList.remove('hidden');
        return;
    }

    emptyMessage.classList.add('hidden');
    moviesContainer.innerHTML = '<div class="skeleton w-full h-64 rounded-xl"></div>';
    seriesContainer.innerHTML = '<div class="skeleton w-full h-64 rounded-xl"></div>';

    let moviesCount = 0;
    let seriesCount = 0;

    const movieCards = [];
    const seriesCards = [];

    const moviePromises = watchlist.movies.map(async (movieId) => {
        try {
            const data = await apiClient.json(apiClient.tmdbUrl(`movie/${movieId}`));
            const card = window.FreeMovieUI.createMediaCard({
                id: movieId,
                title: data.title || data.original_title,
                posterPath: data.poster_path,
                rating: data.vote_average,
                year: data.release_date ? data.release_date.slice(0, 4) : '',
                type: 'movie',
                customBadge: 'فیلم'
            });
            // Append delete button
            attachDeleteButton(card, movieId, 'movie');
            movieCards.push(card);
            moviesCount++;
        } catch (e) {
            console.error(`Failed loading movie ${movieId}:`, e);
        }
    });

    const seriesPromises = watchlist.series.map(async (seriesId) => {
        try {
            const data = await apiClient.json(apiClient.tmdbUrl(`tv/${seriesId}`));
            const card = window.FreeMovieUI.createMediaCard({
                id: seriesId,
                title: data.name || data.original_name,
                posterPath: data.poster_path,
                rating: data.vote_average,
                year: data.first_air_date ? data.first_air_date.slice(0, 4) : '',
                type: 'series',
                customBadge: 'سریال'
            });
            attachDeleteButton(card, seriesId, 'series');
            seriesCards.push(card);
            seriesCount++;
        } catch (e) {
            console.error(`Failed loading series ${seriesId}:`, e);
        }
    });

    await Promise.allSettled([...moviePromises, ...seriesPromises]);

    moviesContainer.innerHTML = '';
    seriesContainer.innerHTML = '';

    movieCards.forEach(c => moviesContainer.appendChild(c));
    seriesCards.forEach(c => seriesContainer.appendChild(c));

    moviesHeading.classList.toggle('hidden', moviesCount === 0);
    seriesHeading.classList.toggle('hidden', seriesCount === 0);

    if (moviesCount === 0 && seriesCount === 0) {
        emptyMessage.classList.remove('hidden');
    }
}

function attachDeleteButton(cardElement, itemId, type) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mt-2 w-full py-1 text-xs font-medium text-red-400 hover:text-white hover:bg-red-600/80 rounded transition border border-red-500/20';
    btn.textContent = 'حذف از واچ‌لیست';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.WatchlistStore) {
            window.WatchlistStore.remove(itemId, type);
            loadWatchlist();
        }
    });
    const infoSection = cardElement.querySelector('.flex.flex-col.flex-1.p-3');
    if (infoSection) {
        infoSection.appendChild(btn);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadWatchlist();
});
