const apiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';
let apiKeySwitcher;

let moviePage = 1;
let isLoading = false;

const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
const apiUrl = `${tmdbBase}/movie/upcoming?api_key=${apiKey}&language=fa-IR&page=`;
const imageCache = {};

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys();
    console.log('سوئیچر کلید API مقداردهی شد');
}

function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    loadingBar.style.width = '30%';
}

function finishLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    loadingBar.style.width = '100%';
    setTimeout(() => loadingBar.style.width = '0', 300);
}

function getDaysLeft(releaseDate) {
    const today = new Date();
    const release = new Date(releaseDate);
    const diffTime = release - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? `${diffDays} روز دیگر` : 'منتشر شده';
}

async function getCachedImage(id, fetchFunction) {
    if (imageCache[id] && imageCache[id] !== defaultPoster) {
        return imageCache[id];
    }
    const poster = await fetchFunction();
    if (poster !== defaultPoster) imageCache[id] = poster;
    return poster;
}

async function fetchMovies(page, isInitial = false) {
    if (isLoading) return;
    isLoading = true;
    const container = document.getElementById('upcoming-movies');
    const loadingMore = document.getElementById('loading-more');

    if (!isInitial) loadingMore.classList.remove('hidden');
    startLoadingBar();

    try {
        const response = await fetch(`${apiUrl}${page}`);
        if (!response.ok) throw new Error(`خطای سرور: ${response.status}`);
        const data = await response.json();
        const movies = data.results || [];

        if (isInitial) container.innerHTML = '';

        for (const movie of movies) {
            let poster = defaultPoster;
            const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
            const detailsUrl = `${tmdbBase}/movie/${movie.id}/external_ids?api_key=${apiKey}`;
            try {
                const detailsRes = await fetch(detailsUrl);
                if (!detailsRes.ok) throw new Error(`خطای جزئیات: ${detailsRes.status}`);
                const detailsData = await detailsRes.json();
                const imdbId = detailsData.imdb_id || '';
                if (imdbId) {
                    poster = await getCachedImage(imdbId, async () => {
                        const omdbBase = window.CONFIG ? window.CONFIG.API.OMDB : 'https://www.omdbapi.com';
                        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                            (key) => `${omdbBase}/?i=${imdbId}&apikey=${key}`
                        );
                        return omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
                    });
                }
            } catch (error) {
                console.warn(`خطا در دریافت پوستر ${movie.id}:`, error.message);
            }

            const title = movie.title || 'نامشخص';
            const releaseDate = movie.release_date || '';
            const daysLeft = releaseDate ? getDaysLeft(releaseDate) : 'نامشخص';
            const overview = movie.overview ? movie.overview.slice(0, 100) + '...' : 'توضیحات موجود نیست';

            container.innerHTML += `
                <div class="group relative">
                    <img src="${poster}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg">
                    <span class="days-left">${daysLeft}</span>
                    <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                        <h3 class="text-lg font-bold text-white">${title}</h3>
                        <p class="text-sm text-gray-200">تاریخ انتشار: ${releaseDate || 'نامشخص'}</p>
                        <p class="text-sm text-gray-200">${overview}</p>
                        <a href="/pages/movie/index.html?id=${movie.id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('خطا در دریافت داده‌ها (فیلم‌ها):', error);
        container.innerHTML += '<p class="text-center text-red-500">خطایی رخ داد!</p>';
    } finally {
        isLoading = false;
        loadingMore.classList.add('hidden');
        finishLoadingBar();
    }
}

function handleInfiniteScroll() {
    const scrollPosition = window.innerHeight + window.scrollY;
    const documentHeight = document.documentElement.offsetHeight;

    if (scrollPosition >= documentHeight - 200 && !isLoading) {
        moviePage++;
        fetchMovies(moviePage);
    }
}

function manageThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark');
        const isDark = body.classList.contains('dark');
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        body.classList.remove('dark');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeSwitcher();
    fetchMovies(moviePage, true);
    manageThemeToggle();
    window.addEventListener('scroll', handleInfiniteScroll);
});