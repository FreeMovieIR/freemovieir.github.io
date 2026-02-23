// watchlist.js
const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // TMDb API key
const language = 'fa-IR'; // Language set to Persian (Iran)
const baseImageUrl = 'https://image.tmdb.org/t/p/w500'; // TMDb base image URL for posters
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie.png'; // Default poster fallback

let apiKeySwitcher;

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys(); // استفاده از loadApiKeys سراسری
}

async function loadWatchlist() {
    const moviesContainer = document.getElementById('movies-watchlist');
    const seriesContainer = document.getElementById('series-watchlist');
    const moviesHeading = document.getElementById('movies-heading');
    const seriesHeading = document.getElementById('series-heading');
    const emptyMessage = document.getElementById('empty-watchlist');

    if (!moviesContainer || !seriesContainer || !moviesHeading || !seriesHeading || !emptyMessage) {
        console.error('عناصر واچ‌لیست در HTML یافت نشدند.');
        return;
    }

    // Display skeleton placeholders while loading
    moviesContainer.innerHTML = '<div class="skeleton w-full h-64"></div>';
    seriesContainer.innerHTML = '<div class="skeleton w-full h-64"></div>';

    const watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
    const normalizedWatchlist = {
        movies: Array.isArray(watchlist.movies) ? watchlist.movies : [],
        series: Array.isArray(watchlist.series) ? watchlist.series : [],
    };

    if (normalizedWatchlist.movies.length === 0 && normalizedWatchlist.series.length === 0) {
        moviesContainer.innerHTML = '';
        seriesContainer.innerHTML = '';
        moviesHeading.classList.add('hidden');
        seriesHeading.classList.add('hidden');
        emptyMessage.classList.remove('hidden');
        return;
    }

    emptyMessage.classList.add('hidden');
    moviesContainer.innerHTML = '';
    seriesContainer.innerHTML = '';

    let moviesCount = 0;
    let seriesCount = 0;

    const moviePromises = normalizedWatchlist.movies.map(movieId =>
        fetchAndDisplayItem(movieId, 'movie', moviesContainer)
            .then(() => moviesCount++)
            .catch(() => { })
    );
    const seriesPromises = normalizedWatchlist.series.map(seriesId =>
        fetchAndDisplayItem(seriesId, 'series', seriesContainer)
            .then(() => seriesCount++)
            .catch(() => { })
    );

    await Promise.all([...moviePromises, ...seriesPromises]).catch(error => {
        console.error('خطا در بارگذاری واچ‌لیست:', error);
    });

    moviesHeading.classList.toggle('hidden', moviesCount === 0);
    seriesHeading.classList.toggle('hidden', seriesCount === 0);

    if (moviesCount === 0 && seriesCount === 0) {
        emptyMessage.classList.remove('hidden');
    }
}

async function fetchAndDisplayItem(itemId, type, container) {
    try {
        const apiUrl = type === 'movie'
            ? `https://zxcode.ir/3/movie/${itemId}?api_key=${apiKey}&language=${language}`
            : `https://zxcode.ir/3/tv/${itemId}?api_key=${apiKey}&language=${language}`;

        const externalIdsUrl = type === 'movie'
            ? `https://zxcode.ir/3/movie/${itemId}/external_ids?api_key=${apiKey}`
            : `https://zxcode.ir/3/tv/${itemId}/external_ids?api_key=${apiKey}`;

        // Fetch TMDb data
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`خطای سرور (داده‌های ${type}): ${response.status}`);
        const data = await response.json();

        // Fetch IMDb ID and poster from OMDB
        let poster = defaultPoster;
        const externalIdsRes = await fetch(externalIdsUrl);
        if (!externalIdsRes.ok) throw new Error(`خطای سرور (شناسه‌های خارجی): ${externalIdsRes.status}`);
        const externalIdsData = await externalIdsRes.json();
        const imdbId = externalIdsData.imdb_id || '';
        if (imdbId) {
            const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
            );
            poster = omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
        }

        // Remove "300" before ".jpg"
        let posterUrl = poster;
        posterUrl = posterUrl.replace(/300(?=\.jpg$)/i, '');

        const itemTitle = type === 'movie' ? (data.title || 'نامشخص') : (data.name || 'نامشخص');
        const overview = data.overview ? `${data.overview.slice(0, 80)}...` : 'بدون توضیحات';
        const score = data.vote_average ? data.vote_average.toFixed(1) : '—';
        const route = type === 'movie' ? 'movie' : 'series';

        const itemCard = `
            <div class="movie-card group relative overflow-hidden rounded-2xl glass-card transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl hover:shadow-amber-500/20 cursor-pointer">
                <div class="aspect-[2/3] relative overflow-hidden" onclick="window.location.href='/${route}/index.html?id=${itemId}'">
                    <img src="${posterUrl}" alt="${itemTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
                    <div class="movie-card-overlay absolute inset-0 flex flex-col justify-end p-5">
                        <div class="movie-card-info">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <i class="fas fa-star text-[8px]"></i> ${score}
                                </span>
                                <span class="text-white/40 text-[10px] font-bold uppercase tracking-widest">${type}</span>
                            </div>
                            <h3 class="text-lg font-black text-white mb-2 leading-tight line-clamp-2 drop-shadow-lg">${itemTitle}</h3>
                            <p class="text-xs text-gray-300 mb-4 line-clamp-2 opacity-80">${overview}</p>
                            <div class="flex gap-2">
                                <button onclick="window.location.href='/${route}/index.html?id=${itemId}'" class="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 text-[10px] font-black py-2 rounded-xl transition-all duration-300">
                                    جزئیات
                                </button>
                                <button onclick="removeFromWatchlist('${itemId}', '${type}')" class="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white backdrop-blur-md border border-red-500/20 text-[10px] font-black px-3 py-2 rounded-xl transition-all duration-300">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="absolute top-3 right-3 glass-card px-2 py-1 rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity z-20" onclick="window.location.href='/${route}/index.html?id=${itemId}'">
                    <i class="fas fa-play text-[10px] text-amber-500"></i>
                </div>
            </div>
        `;
        container.innerHTML += itemCard;
    } catch (error) {
        console.error(`خطا در دریافت اطلاعات ${type === 'movie' ? 'فیلم' : 'سریال'} با شناسه ${itemId}:`, error.message);
        throw error;
    }
}

// تعریف تابع به‌صورت سراسری برای دسترسی از HTML
function removeFromWatchlist(itemId, type) {
    const watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
    const normalizedItemId = String(itemId);

    if (type === 'movie') {
        watchlist.movies = watchlist.movies.filter(id => String(id) !== normalizedItemId);
    } else if (type === 'series') {
        watchlist.series = watchlist.series.filter(id => String(id) !== normalizedItemId);
    }

    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    alert('آیتم از واچ‌لیست حذف شد!');
    loadWatchlist();
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeSwitcher();
    loadWatchlist();
});