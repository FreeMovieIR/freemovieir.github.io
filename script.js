// تنظیمات اولیه
const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // کلید API TMDb
const language = 'fa'; // زبان پارسی
const baseImageUrl = 'https://image.tmdb.org/t/p/w500'; // آدرس پایه تصاویر TMDb
const defaultPoster = 'https://m4tinbeigi-official.github.io/freemovie/images/default-freemovie-300.png'; // پوستر پیش‌فرض

// آدرس‌های API TMDb
const apiUrls = {
    now_playing: `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}&language=${language}`,
    tv_trending: `https://api.themoviedb.org/3/trending/tv/week?api_key=${apiKey}&language=${language}`
};

// شیء کش برای ذخیره تصاویر در حافظه
const imageCache = {};

// **تابع کشینگ تصاویر در `localStorage`**
function getCachedImage(id, fetchFunction) {
    const cachedData = localStorage.getItem(`poster_${id}`);
    if (cachedData) {
        console.log(`📌 بارگذاری از کش محلی: ${id}`);
        return Promise.resolve(cachedData);
    }

    return fetchFunction().then(poster => {
        if (poster !== defaultPoster) {
            localStorage.setItem(`poster_${id}`, poster);
            console.log(`✅ ذخیره در کش محلی: ${id}`);
        }
        return poster;
    });
}

let apiKeySwitcher;

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys();
    console.log('🔄 سوئیچر کلید API مقداردهی شد');
}

// **توابع مدیریت نوار پیشرفت**
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

// **دریافت پوستر از OMDB با استفاده از کش**
async function fetchPoster(imdbId) {
    return getCachedImage(imdbId, async () => {
        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
            key => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
        );
        return (omdbData.Poster && omdbData.Poster !== 'N/A') ? omdbData.Poster : defaultPoster;
    });
}

// **دریافت پوستر برای یک مورد (فیلم یا سریال)**
async function getPosterForItem(item, type) {
    let poster = defaultPoster;
    const detailsUrl = type === 'movie'
        ? `https://api.themoviedb.org/3/movie/${item.id}/external_ids?api_key=${apiKey}`
        : `https://api.themoviedb.org/3/tv/${item.id}/external_ids?api_key=${apiKey}`;
    try {
        const detailsRes = await fetch(detailsUrl);
        if (!detailsRes.ok) throw new Error(`خطای سرور (جزئیات ${type}): ${detailsRes.status}`);
        const detailsData = await detailsRes.json();
        const imdbId = detailsData.imdb_id || '';

        if (imdbId) {
            poster = await fetchPoster(imdbId);
        } else if (item.poster_path) {
            poster = `${baseImageUrl}${item.poster_path}`;
        }
    } catch (error) {
        console.warn(`⚠️ خطا در دریافت پوستر ${type} ${item.id}: ${error.message}`);
        if (item.poster_path) {
            poster = `${baseImageUrl}${item.poster_path}`;
        }
    }
    return poster;
}

// **دریافت و نمایش داده‌ها**
async function fetchAndDisplayContent() {
    const movieContainer = document.getElementById('new-movies');
    const tvContainer = document.getElementById('trending-tv');

    // **نمایش حالت اسکلتی هنگام بارگیری**
    const skeletonHTML = `<div class="skeleton w-full h-64 bg-gray-200 rounded-lg animate-pulse"></div>`.repeat(4);
    movieContainer.innerHTML = skeletonHTML;
    tvContainer.innerHTML = skeletonHTML;

    try {
        startLoadingBar(); // شروع نوار پیشرفت

        // **دریافت همزمان داده‌ها از TMDb**
        const [movieRes, tvRes] = await Promise.all([
            fetch(apiUrls.now_playing),
            fetch(apiUrls.tv_trending)
        ]);

        if (!movieRes.ok || !tvRes.ok) {
            throw new Error(`⚠️ خطای دریافت داده: ${movieRes.status}, ${tvRes.status}`);
        }

        const [movieData, tvData] = await Promise.all([
            movieRes.json(),
            tvRes.json()
        ]);

        const movies = movieData.results || [];
        const tvSeries = tvData.results || [];

        const seenIds = new Set();

        // **تابع تولید HTML کارت برای هر مورد**
        const createCardHTML = async (item, type) => {
            if (seenIds.has(item.id)) return '';
            seenIds.add(item.id);

            // دریافت پوستر از OMDB یا TMDb
            const poster = await getPosterForItem(item, type);
            const title = item.title || item.name || 'نامشخص';
            const overview = item.overview ? item.overview.slice(0, 100) + '...' : 'توضیحات موجود نیست';

            return `
                <div class="group relative">
                    <img src="${poster}" alt="${title}" class="w-full h-full rounded-lg shadow-lg" loading="lazy">
                    <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                        <h3 class="text-lg font-bold text-white">${title}</h3>
                        <p class="text-sm text-gray-200">${overview}</p>
                        <a href="/freemovie/${type === 'movie' ? 'movie' : 'series'}/index.html?id=${item.id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
                    </div>
                </div>
            `;
        };

        // **دریافت پوستر و تولید HTML همزمان**
        const [movieCards, tvCards] = await Promise.all([
            Promise.all(movies.map(movie => createCardHTML(movie, 'movie'))),
            Promise.all(tvSeries.map(tv => createCardHTML(tv, 'tv')))
        ]);

        // **افزودن تمامی کارت‌ها به DOM به صورت یکجا**
        movieContainer.innerHTML = movieCards.join('') || '<p class="text-center text-red-500">فیلمی یافت نشد!</p>';
        tvContainer.innerHTML = tvCards.join('') || '<p class="text-center text-red-500">سریالی یافت نشد!</p>';

    } catch (error) {
        console.error('⚠️ خطا در دریافت داده‌ها:', error);
        movieContainer.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد! لطفاً دوباره تلاش کنید.</p>';
        tvContainer.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد! لطفاً دوباره تلاش کنید.</p>';
    } finally {
        finishLoadingBar(); // پایان نوار پیشرفت
    }
}

function manageNotification() {
    const notification = document.getElementById('notification');
    const closeButton = document.getElementById('close-notification');
    const supportButton = document.getElementById('support-button');

    if (!notification) {
        console.warn('عنصر notification یافت نشد');
        return;
    }

    if (!localStorage.getItem('notificationClosed')) {
        notification.classList.remove('hidden');
    }

    closeButton.addEventListener('click', () => {
        notification.classList.add('hidden');
        localStorage.setItem('notificationClosed', 'true');
    });

    supportButton.addEventListener('click', () => {
        window.open('https://twitter.com/intent/tweet?text=من از فیری مووی حمایت می‌کنم! یک سایت عالی برای تماشای فیلم و سریال: https://b2n.ir/freemovie', '_blank');
    });
}

function manageDisclaimerNotice() {
    const notice = document.getElementById('disclaimer-notice');
    const closeButton = document.getElementById('close-disclaimer');

    if (!notice) {
        console.warn('عنصر disclaimer-notice یافت نشد');
        return;
    }

    if (!localStorage.getItem('disclaimerNoticeClosed')) {
        notice.classList.remove('hidden');
    } else {
        notice.classList.add('hidden');
    }

    closeButton.addEventListener('click', () => {
        notice.classList.add('hidden');
        localStorage.setItem('disclaimerNoticeClosed', 'true');
    });
}

// تابع کمکی برای دانلود تصاویر
function downloadImage(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log(`${filename} دانلود شد`);
}

// تابع مدیریت پاپ‌آپ حمایت
function manageSupportPopup() {
    const popup = document.getElementById('support-popup');
    const closeButton = document.getElementById('close-popup');
    const tweetButton = document.getElementById('tweet-support');
    const downloadTwitterButton = document.getElementById('download-twitter');
    const downloadInstagramButton = document.getElementById('download-instagram');

    if (!popup) {
        console.error('عنصر support-popup یافت نشد');
        return;
    }

    console.log('تابع manageSupportPopup اجرا شد');

    const isPopupShown = localStorage.getItem('isPopupShown') === 'true';
    if (!isPopupShown) {
        popup.classList.remove('hidden');
        localStorage.setItem('isPopupShown', 'true');
        console.log('پاپ‌آپ برای اولین بار نمایش داده شد');
    } else {
        console.log('پاپ‌آپ قبلاً نمایش داده شده است');
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            popup.classList.add('hidden');
            console.log('پاپ‌آپ بسته شد');
        });
    }

    if (tweetButton) {
        tweetButton.addEventListener('click', () => {
            const tweetText = encodeURIComponent('من از فیری مووی حمایت می‌کنم! یک سایت عالی برای تماشای فیلم و سریال: https://b2n.ir/freemovie');
            window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
            console.log('دکمه توییت کلیک شد');
        });
    }

    if (downloadTwitterButton) {
        downloadTwitterButton.addEventListener('click', () => {
            const twitterImageUrl = 'https://github.com/m4tinbeigi-official/freemovie/images/story.png';
            downloadImage(twitterImageUrl, 'freemovie-twitter-support.jpg');
        });
    }

    if (downloadInstagramButton) {
        downloadInstagramButton.addEventListener('click', () => {
            const instagramImageUrl = 'https://github.com/m4tinbeigi-official/freemovie/images/tweet.png';
            downloadImage(instagramImageUrl, 'freemovie-instagram-support.jpg');
        });
    }

    popup.addEventListener('click', (event) => {
        if (event.target === popup) {
            popup.classList.add('hidden');
            console.log('پاپ‌آپ با کلیک خارج بسته شد');
        }
    });
}

function manageFabButton() {
    const fab = document.getElementById('fab');
    const fabOptions = document.getElementById('fabOptions');

    if (!fab || !fabOptions) {
        console.warn('عناصر fab یا fabOptions یافت نشدند');
        return;
    }

    fab.addEventListener('click', function(event) {
        event.stopPropagation();
        fabOptions.classList.toggle('hidden');
        console.log('دکمه FAB کلیک شد');
    });

    document.addEventListener('click', function(event) {
        if (!fab.contains(event.target) && !fabOptions.contains(event.target)) {
            fabOptions.classList.add('hidden');
        }
    });
}

function manageThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    if (!themeToggle) {
        console.warn('عنصر theme-toggle یافت نشد');
        return;
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark');
        const isDark = body.classList.contains('dark');
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        console.log('تم تغییر کرد به:', isDark ? 'تاریک' : 'روشن');
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        body.classList.remove('dark');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

// اجرای توابع پس از بارگذاری صفحه
document.addEventListener('DOMContentLoaded', async () => {
    console.log('صفحه بارگذاری شد');
    try {
        await initializeSwitcher();
        await fetchAndDisplayContent();
        manageNotification();
        manageDisclaimerNotice();
        manageSupportPopup();
        manageFabButton();
        manageThemeToggle();
    } catch (error) {
        console.error('خطا در بارگذاری اولیه:', error);
    }
});
