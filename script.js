// script.js
const defaultApiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // کلید پیش‌فرض TMDb
const userTmdbToken = localStorage.getItem('userTmdbToken'); // توکن کاربر
const apiKey = userTmdbToken || defaultApiKey; // اولویت با توکن کاربر
const language = 'fa';
const baseImageUrl = 'https://image.tmdb.org/t/p/w500';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';
function proxify(url) {
  return `https://odd-disk-9903.armin-apple816467.workers.dev/?url=${encodeURIComponent(url)}`;
}


// آدرس‌های API TMDb
const apiUrls = {
    now_playing: "https://api.themoviedb.org/3/trending/movie/week?api_key=1dc4cbf81f0accf4fa108820d551dafc&language=fa",
    tv_trending: "https://api.themoviedb.org/3/trending/tv/week?api_key=1dc4cbf81f0accf4fa108820d551dafc&language=fa"
};

// شیء کش برای ذخیره تصاویر
const imageCache = {};

function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        // شروع از 5% تا 60% (شبیه‌سازی پیشرفت)
        loadingBar.style.width = '5%';
        // افزایش تدریجی تا 60% تا وقتی داده میاد
        setTimeout(() => loadingBar.style.width = '60%', 100);
    }
}

// تابع برای دریافت یا ذخیره تصویر از/در کش
function getCachedImage(id, fetchFunction) {
    if (imageCache[id] && imageCache[id] !== defaultPoster) {
        console.log(`تصویر کش‌شده برای شناسه ${id} بارگذاری شد`);
        return Promise.resolve(imageCache[id]);
    }
    return fetchFunction().then(poster => {
        if (poster !== defaultPoster) {
            imageCache[id] = poster;
            console.log(`تصویر برای شناسه ${id} در کش ذخیره شد`);
        } else {
            console.log(`تصویر پیش‌فرض ${defaultPoster} کش نشد`);
        }
        return poster;
    });
}

let apiKeySwitcher;

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys();
    console.log('سوئیچر کلید API مقداردهی شد');
}

// توابع مدیریت نوار پیشرفت
function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '0';
        setTimeout(() => {
            loadingBar.style.width = '30%';
        }, 100);
    }
}

function updateLoadingBar(percentage) {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = percentage + '%';
    }
}

function finishLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '100%';
        setTimeout(() => {
            loadingBar.style.width = '0';
        }, 300);
    }
}

async function fetchAndDisplayContent() {
    const movieContainer = document.getElementById('new-movies');
    const tvContainer = document.getElementById('trending-tv');

    const skeletonHTML = '<div class="skeleton w-full"></div>'.repeat(4);
    movieContainer.innerHTML = tvContainer.innerHTML = skeletonHTML;

    try {
        startLoadingBar();

const proxify = url =>
  `https://odd-disk-9903.armin-apple816467.workers.dev/?url=${encodeURIComponent(url)}`;


const [movieRes, tvRes] = await Promise.all([
    fetch(proxify(apiUrls.now_playing)),
    fetch(proxify(apiUrls.tv_trending))
]);


        if (!movieRes.ok || !tvRes.ok) throw new Error('خطا در دریافت داده‌ها');

        const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);

        movieContainer.innerHTML = tvContainer.innerHTML = '';
        const seenIds = new Set();

        const renderItems = async (items, container, type) => {
            const elements = await Promise.all(items.map(async item => {
                if (seenIds.has(item.id)) return '';
                seenIds.add(item.id);

                let poster = defaultPoster;
                const detailsUrl = proxify(`https://api.themoviedb.org/3/${type}/${item.id}/external_ids?api_key=${apiKey}`);

                try {
                    const detailsRes = await fetch(detailsUrl);
                    if (detailsRes.ok) {
                        const detailsData = await detailsRes.json();
                        const imdbId = detailsData.imdb_id || '';
                        if (imdbId) {
                            poster = await getCachedImage(imdbId, async () => {
                                const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                                    key => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
                                );
                                return omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`خطا در دریافت پوستر ${type} ${item.id}:`, error.message);
                }

                return `
                    <div class="group relative">
                        <img src="${poster}" alt="${item.title || item.name || 'نامشخص'}" class="w-full h-full rounded-lg shadow-lg">
                        <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                            <h3 class="text-lg font-bold text-white">${item.title || item.name || 'نامشخص'}</h3>
                            <p class="text-sm text-gray-200">${item.overview ? item.overview.slice(0, 100) + '...' : 'توضیحات موجود نیست'}</p>
                            <a href="/${type === 'movie' ? 'movie' : 'series'}/index.html?id=${item.id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
                        </div>
                    </div>
                `;
            }));
            container.innerHTML = elements.filter(Boolean).join('') || '<p class="text-center text-red-500">داده‌ای یافت نشد!</p>';
        };

        await Promise.all([
            renderItems(movieData.results || [], movieContainer, 'movie'),
            renderItems(tvData.results || [], tvContainer, 'tv')
        ]);
    } catch (error) {
        console.error('خطا در دریافت داده‌ها:', error);
        movieContainer.innerHTML = tvContainer.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد! لطفاً دوباره تلاش کنید.</p>';
    } finally {
        finishLoadingBar();
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
            const twitterImageUrl = 'https://freemovieir.github.io/images/story.png';
            downloadImage(twitterImageUrl, 'freemovie-twitter-support.jpg');
        });
    }

    if (downloadInstagramButton) {
        downloadInstagramButton.addEventListener('click', () => {
            const instagramImageUrl = 'https://freemovieir.github.io/images/tweet.png';
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

    if (!fab) {
        console.error('عنصر fab یافت نشد');
        return;
    }
    if (!fabOptions) {
        console.error('عنصر fabOptions یافت نشد');
        return;
    }

    fab.addEventListener('click', function(event) {
        event.stopPropagation();
        console.log('دکمه FAB کلیک شد، وضعیت فعلی hidden:', fabOptions.classList.contains('hidden'));
        fabOptions.classList.toggle('hidden');
    });

    document.addEventListener('click', function(event) {
        if (!fab.contains(event.target) && !fabOptions.contains(event.target)) {
            fabOptions.classList.add('hidden');
            console.log('کلیک خارج از FAB، منو بسته شد');
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

function manageAvailabilityNotice() {
    const notice = document.getElementById('availability-notice');
    const closeButton = document.getElementById('close-availability');

    if (!notice) {
        console.warn('عنصر availability-notice یافت نشد');
        return;
    }

    if (!localStorage.getItem('availabilityNoticeClosed')) {
        notice.classList.remove('hidden');
    } else {
        notice.classList.add('hidden');
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            notice.classList.add('hidden');
            localStorage.setItem('availabilityNoticeClosed', 'true');
            console.log('اطلاعیه بسته شد');
        });
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