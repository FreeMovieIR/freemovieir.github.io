const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // کلید API TMDb
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';
let apiKeySwitcher;

// تنظیمات صفحه‌بندی
let moviePage = 1;
let tvPage = 1;
let isLoading = false;

const apiUrls = {
    upcomingMovies: `https://zxcode.ir/3/movie/upcoming?api_key=${apiKey}&language=fa-IR&page=`,
    upcomingTv: `https://zxcode.ir/3/tv/on_the_air?api_key=${apiKey}&language=fa-IR&page=`
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
            const type = containerId.includes('movie') ? 'movie' : 'tv';
            const poster = await window.resolvePoster(item.id, type, item.poster_path);

            // Special wrapper for daysLeft in upcoming page
            const cardHtml = window.createMovieCard(item, poster, type);
            const releaseDate = item.release_date || item.first_air_date || '';
            const daysLeft = releaseDate ? getDaysLeft(releaseDate) : 'نامشخص';

            const wrapper = document.createElement('div');
            wrapper.className = 'relative';
            wrapper.innerHTML = cardHtml + `<span class="days-left absolute top-3 right-3 z-30">${daysLeft}</span>`;

            container.appendChild(wrapper);
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