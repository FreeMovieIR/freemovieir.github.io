const apiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';
let apiKeySwitcher;

let page = 1;
let isLoading = false;

const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
const apiUrl = `${tmdbBase}/tv/airing_today?api_key=${apiKey}&language=fa-IR&page=`;
const imageCache = {};

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys();
    console.log('سوئیچر کلید API مقداردهی شد');
}

function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '0';
        setTimeout(() => loadingBar.style.width = '30%', 100);
    }
}

function finishLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '100%';
        setTimeout(() => loadingBar.style.width = '0', 300);
    }
}

async function fetchAiringToday(pageNum, isInitial = false) {
    if (isLoading) return;
    isLoading = true;
    const container = document.getElementById('airing-today');
    const loadingMore = document.getElementById('loading-more');

    if (!isInitial) loadingMore.classList.remove('hidden');
    startLoadingBar();

    try {
        const response = await fetch(`${apiUrl}${pageNum}`);
        if (!response.ok) throw new Error(`خطای سرور: ${response.status}`);
        const data = await response.json();
        const series = data.results || [];

        if (isInitial) container.innerHTML = '';

        for (const serie of series) {
            const poster = await window.resolvePoster(serie.id, 'tv', serie.poster_path);
            container.innerHTML += window.createMovieCard(serie, poster, 'tv');
        }
    } catch (error) {
        console.error('خطا در دریافت سریال‌ها:', error);
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
        page++;
        fetchAiringToday(page);
    }
}

function manageThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    if (!themeToggle) return;

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
    fetchAiringToday(page, true);
    manageThemeToggle();
    window.addEventListener('scroll', handleInfiniteScroll);
});