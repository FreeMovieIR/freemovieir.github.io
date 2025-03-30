const apiKey = '1dc4cbf81f0accf4fa108820d551dafc';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';
let apiKeySwitcher;

let page = 1;
let isLoading = false;

const apiUrl = `https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&language=fa-IR&page=`;
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

async function getCachedImage(id, fetchFunction) {
    if (imageCache[id] && imageCache[id] !== defaultPoster) {
        return imageCache[id];
    }
    const poster = await fetchFunction();
    if (poster !== defaultPoster) imageCache[id] = poster;
    return poster;
}

async function fetchTopRated(pageNum, isInitial = false) {
    if (isLoading) return;
    isLoading = true;
    const container = document.getElementById('top-rated');
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
            let poster = defaultPoster.replace(/300(?=\.jpg$)/i, '');
            const detailsUrl = `https://api.themoviedb.org/3/tv/${serie.id}/external_ids?api_key=${apiKey}`;
            try {
                const detailsRes = await fetch(detailsUrl);
                if (!detailsRes.ok) throw new Error(`خطای جزئیات: ${detailsRes.status}`);
                const detailsData = await detailsRes.json();
                const imdbId = detailsData.imdb_id || '';
                if (imdbId) {
                    poster = await getCachedImage(imdbId, async () => {
                        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                            (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
                        );
                        return omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
                    });
                }
            } catch (error) {
                console.warn(`خطا در دریافت پوستر ${serie.id}:`, error.message);
            }

            const title = serie.name || 'نامشخص';
            const overview = serie.overview ? serie.overview.slice(0, 100) + '...' : 'توضیحات موجود نیست';
            const rating = serie.vote_average ? serie.vote_average.toFixed(1) : 'N/A';

            container.innerHTML += `
                <div class="group relative">
                    <img src="${poster}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg">
                    <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                        <h3 class="text-lg font-bold text-white">${title}</h3>
                        <p class="text-sm text-gray-200">امتیاز: ${rating}</p>
                        <p class="text-sm text-gray-200">${overview}</p>
                        <a href="/series/index.html?id=${serie.id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
                    </div>
                </div>
            `;
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
        fetchTopRated(page);
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
    fetchTopRated(page, true);
    manageThemeToggle();
    window.addEventListener('scroll', handleInfiniteScroll);
});