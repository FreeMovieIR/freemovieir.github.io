// script.js
const defaultApiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // کلید پیش‌فرض TMDb
const userTmdbToken = localStorage.getItem('userTmdbToken'); // توکن کاربر
const apiKey = userTmdbToken || defaultApiKey; // اولویت با توکن کاربر
const language = 'fa';
const baseImageUrl = 'https://image.tmdb.org/t/p/w500';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';
const apiClient = window.FreeMovieApi;

// آدرس‌های API TMDb
const apiUrls = {
    now_playing: "https://api.themoviedb.org/3/trending/movie/week?api_key=1dc4cbf81f0accf4fa108820d551dafc&language=fa",
    tv_trending: "https://api.themoviedb.org/3/trending/tv/week?api_key=1dc4cbf81f0accf4fa108820d551dafc&language=fa"
};

// شیء کش برای ذخیره تصاویر
const imageCache = {};

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


// --- Homepage Status Badges ---
const HOMEPAGE_STATUS_BADGE_CACHE = new Map();

function homepageBadgeToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function homepageBadgeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function homepageBadgeGetAllReleaseDates(releaseDatesData) {
  const results = Array.isArray(releaseDatesData?.results) ? releaseDatesData.results : [];
  return results.flatMap(region => {
    const releaseDates = Array.isArray(region?.release_dates) ? region.release_dates : [];
    return releaseDates.map(item => ({
      ...item,
      region: region?.iso_3166_1 || ''
    }));
  });
}

function homepageBadgeHtml(label, variant) {
  const colors = {
    cinema: 'background:#dc2626;color:#fff;border:1px solid rgba(255,255,255,.35);',
    airing: 'background:#2563eb;color:#fff;border:1px solid rgba(255,255,255,.35);',
    soon: 'background:#9333ea;color:#fff;border:1px solid rgba(255,255,255,.35);'
  };

  return `
    <span
      class="homepage-status-badge"
      style="position:absolute;top:8px;right:8px;z-index:20;display:inline-flex;align-items:center;justify-content:center;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:800;line-height:1.2;box-shadow:0 4px 12px rgba(0,0,0,.45);${colors[variant] || colors.soon}"
      title="${label}"
    >${label}</span>
  `;
}

function homepageMovieBadgeFromReleaseDates(releaseDatesData) {
  const today = homepageBadgeToday();
  const releases = homepageBadgeGetAllReleaseDates(releaseDatesData);

  const cinemaTypes = [2, 3];
  const publicTypes = [4, 5, 6];

  const past = releases.filter(item => {
    const d = homepageBadgeDate(item.release_date);
    return d && d <= today;
  });

  const future = releases.filter(item => {
    const d = homepageBadgeDate(item.release_date);
    return d && d > today;
  });

  const hasPastCinema = past.some(item => cinemaTypes.includes(item.type));
  const hasPastPublic = past.some(item => publicTypes.includes(item.type));
  const hasFutureCinema = future.some(item => cinemaTypes.includes(item.type));

  if (hasPastCinema && !hasPastPublic) {
    return homepageBadgeHtml('اکران سینما', 'cinema');
  }

  if (!hasPastPublic && hasFutureCinema) {
    return homepageBadgeHtml('به‌زودی سینما', 'soon');
  }

  return '';
}

function homepageTvBadgeFromDetails(details, item) {
  const today = homepageBadgeToday();
  const firstAirDate = homepageBadgeDate(details?.first_air_date || item?.first_air_date);
  const status = details?.status || '';

  if (firstAirDate && firstAirDate > today) {
    return homepageBadgeHtml('به‌زودی', 'soon');
  }

  if (status === 'Returning Series' || status === 'In Production') {
    return homepageBadgeHtml('در حال پخش', 'airing');
  }

  return '';
}

async function buildHomepageStatusBadge(item, type) {
  if (!item?.id) return '';

  const cacheKey = `${type}:${item.id}`;
  if (HOMEPAGE_STATUS_BADGE_CACHE.has(cacheKey)) {
    return HOMEPAGE_STATUS_BADGE_CACHE.get(cacheKey);
  }

  let badge = '';

  try {
    if (type === 'movie') {
      const url = `https://api.themoviedb.org/3/movie/${item.id}/release_dates?api_key=${apiKey}`;
      const res = await apiClient.request(url);
      if (res.ok) {
        const data = await res.json();
        badge = homepageMovieBadgeFromReleaseDates(data);
      }
    }

    if (type === 'tv') {
      const url = `https://api.themoviedb.org/3/tv/${item.id}?api_key=${apiKey}&language=fa`;
      const res = await apiClient.request(url);
      if (res.ok) {
        const data = await res.json();
        badge = homepageTvBadgeFromDetails(data, item);
      }
    }
  } catch (error) {
    console.warn(`خطا در ساخت badge برای ${type} ${item.id}:`, error.message);
  }

  HOMEPAGE_STATUS_BADGE_CACHE.set(cacheKey, badge);
  return badge;
}

async function fetchAndDisplayContent() {
    const movieContainer = document.getElementById('new-movies');
    const tvContainer = document.getElementById('trending-tv');

    const skeletonHTML = '<div class="skeleton-card"></div>'.repeat(10);
    movieContainer.innerHTML = tvContainer.innerHTML = skeletonHTML;

    try {
        startLoadingBar();

const [movieRes, tvRes] = await Promise.all([
    apiClient.request(apiUrls.now_playing),
    apiClient.request(apiUrls.tv_trending)
]);


        if (!movieRes.ok || !tvRes.ok) throw new Error('خطا در دریافت داده‌ها');

        const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);

        movieContainer.innerHTML = tvContainer.innerHTML = '';
        const seenIds = new Set();

        const renderItems = async (items, container, type) => {
            const elements = await Promise.all(items.map(async item => {
                if (seenIds.has(item.id)) return '';
                seenIds.add(item.id);

                const title = item.title || item.name || 'نامشخص';
                const rawDate = item.release_date || item.first_air_date || '';
                const year = rawDate ? rawDate.slice(0, 4) : '';
                const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '';
                const overview = item.overview ? item.overview.slice(0, 120) + '…' : 'توضیحات موجود نیست';
                const link = `/${type === 'movie' ? 'movie' : 'series'}/index.html?id=${item.id}`;

                // پوستر مستقیم از TMDB (سریع و پایدار) با fallback به پروکسی و سپس تصویر پیش‌فرض
                const tmdbPoster = item.poster_path ? `${baseImageUrl}${item.poster_path}` : '';
                const proxiedPoster = tmdbPoster && window.FreeMovieApi ? window.FreeMovieApi.proxify(tmdbPoster) : '';
                const initialPoster = tmdbPoster || defaultPoster;
                const fallback1 = (proxiedPoster && proxiedPoster !== initialPoster) ? proxiedPoster : defaultPoster;
                const onError = `if(this.dataset.s==='2'){this.onerror=null;return;}if(this.dataset.s==='1'){this.dataset.s='2';this.src='${defaultPoster}';return;}this.dataset.s='1';this.src='${fallback1}';`;

                const homeStatusBadge = await buildHomepageStatusBadge(item, type);

                return `
                    <div class="movie-card group">
                        <a href="${link}" class="poster-wrap" aria-label="${title}">
                            ${homeStatusBadge}
                            <img src="${initialPoster}" alt="پوستر ${title}" loading="lazy" class="poster-img" onerror="${onError}">
                            <div class="poster-overlay">
                                <p class="overlay-text">${overview}</p>
                                <span class="overlay-btn">مشاهده جزئیات</span>
                            </div>
                        </a>
                        <div class="card-info">
                            <h3 class="card-title" title="${title}">${title}</h3>
                            <div class="card-meta">
                                ${rating ? `<span class="card-rating"><i class="fas fa-star"></i> ${rating}</span>` : '<span></span>'}
                                ${year ? `<span class="card-year">${year}</span>` : ''}
                            </div>
                            <a href="${link}" class="card-btn">مشاهده</a>
                        </div>
                    </div>
                `;
            }));
            container.innerHTML = elements.filter(Boolean).join('') || '<p class="text-center text-red-500 col-span-full">داده‌ای یافت نشد!</p>';
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

    if (closeButton && notice) {
        closeButton.addEventListener('click', () => {
        notice.classList.add('hidden');
        localStorage.setItem('disclaimerNoticeClosed', 'true');
    });
}

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
        manageFabButton();
        manageNotification();
        manageDisclaimerNotice();
        manageSupportPopup();
        manageThemeToggle();
    } catch (error) {
        console.error('خطا در بارگذاری اولیه:', error);
    }
});
