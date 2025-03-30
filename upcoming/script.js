const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // کلید API TMDb
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';
let apiKeySwitcher;

// تنظیمات صفحه‌بندی
let moviePage = 1;
let tvPage = 1;
let isLoading = false;

const apiUrls = {
    upcomingMovies: `https://api.themoviedb.org/3/movie/upcoming?api_key=${apiKey}&language=fa-IR&page=`,
    upcomingTv: `https://api.themoviedb.org/3/tv/on_the_air?api_key=${apiKey}&language=fa-IR&page=`
};

// کش تصاویر
const imageCache = {};

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys();
    console.log('سوئیچر کلید API مقداردهی شد');
}

// مدیریت نوار پیشرفت
function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    loadingBar.style.width = '30%';
}

function finishLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    loadingBar.style.width = '100%';
    setTimeout(() => loadingBar.style.width = '0', 300);
}

// محاسبه روزهای باقی‌مانده
function getDaysLeft(releaseDate) {
    const today = new Date();
    const release = new Date(releaseDate);
    const diffTime = release - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? `${diffDays} روز دیگر` : 'منتشر شده';
}

// دریافت تصویر از کش یا OMDB
async function getCachedImage(id, fetchFunction) {
    if (imageCache[id] && imageCache[id] !== defaultPoster) {
        return imageCache[id];
    }
    const poster = await fetchFunction();
    if (poster !== defaultPoster) imageCache[id] = poster;
    return poster;
}

// دریافت و نمایش محتوا
async function fetchContent(containerId, url, page, isInitial = false) {
    if (isLoading) return;
    isLoading = true;
    const container = document.getElementById(containerId);
    const loadingMore = document.getElementById('loading-more');

    if (!isInitial) loadingMore.classList.remove('hidden');
    startLoadingBar();

    try {
        const response = await fetch(`${url}${page}`);
        if (!response.ok) throw new Error(`خطای سرور: ${response.status}`);
        const data = await response.json();
        const items = data.results || [];

        if (isInitial) container.innerHTML = ''; // پاکسازی اسکلتون‌ها

        for (const item of items) {
            let poster = defaultPoster.replace(/300(?=\.jpg$)/i, '');
            const detailsUrl = `https://api.themoviedb.org/3/${containerId.includes('movie') ? 'movie' : 'tv'}/${item.id}/external_ids?api_key=${apiKey}`;
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
                console.warn(`خطا در دریافت پوستر ${item.id}:`, error.message);
            }

            const title = item.title || item.name || 'نامشخص';
            const releaseDate = item.release_date || item.first_air_date || '';
            const daysLeft = releaseDate ? getDaysLeft(releaseDate) : 'نامشخص';
            const overview = item.overview ? item.overview.slice(0, 100) + '...' : 'توضیحات موجود نیست';

            container.innerHTML += `
                <div class="group relative">
                    <img src="${poster}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg">
                    <span class="days-left">${daysLeft}</span>
                    <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                        <h3 class="text-lg font-bold text-white">${title}</h3>
                        <p class="text-sm text-gray-200">تاریخ انتشار: ${releaseDate || 'نامشخص'}</p>
                        <p class="text-sm text-gray-200">${overview}</p>
                        <a href="/freemovie/${containerId.includes('movie') ? 'movie' : 'series'}/index.html?id=${item.id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error(`خطا در دریافت داده‌ها (${containerId}):`, error);
        container.innerHTML += '<p class="text-center text-red-500">خطایی رخ داد!</p>';
    } finally {
        isLoading = false;
        loadingMore.classList.add('hidden');
        finishLoadingBar();
    }
}

// مدیریت اسکرول بی‌نهایت
function handleInfiniteScroll() {
    const scrollPosition = window.innerHeight + window.scrollY;
    const documentHeight = document.documentElement.offsetHeight;

    if (scrollPosition >= documentHeight - 200 && !isLoading) {
        moviePage++;
        tvPage++;
        fetchContent('upcoming-movies', apiUrls.upcomingMovies, moviePage);
        fetchContent('upcoming-tv', apiUrls.upcomingTv, tvPage);
    }
}

// مدیریت تم
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

// اجرای اولیه
document.addEventListener('DOMContentLoaded', async () => {
    await initializeSwitcher();
    fetchContent('upcoming-movies', apiUrls.upcomingMovies, moviePage, true);
    fetchContent('upcoming-tv', apiUrls.upcomingTv, tvPage, true);
    manageThemeToggle();
    window.addEventListener('scroll', handleInfiniteScroll);
});