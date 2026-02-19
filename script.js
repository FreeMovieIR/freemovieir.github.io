const defaultApiKey = '1dc4cbf81f0accf4fa108820d551dafc';
const userTmdbToken = localStorage.getItem('userTmdbToken');
const apiKey = userTmdbToken || defaultApiKey;
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';

const apiUrls = {
  now_playing: `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}&language=fa`,
  tv_trending: `https://api.themoviedb.org/3/trending/tv/week?api_key=${apiKey}&language=fa`
};

const imageCache = {};
let apiKeySwitcher;

const proxify = (url) =>
  `https://odd-disk-9903.armin-apple816467.workers.dev/?url=${encodeURIComponent(url)}`;

function startLoadingBar() {
  const loadingBar = document.getElementById('loading-bar');
  if (!loadingBar) return;

  loadingBar.style.width = '0';
  setTimeout(() => {
    loadingBar.style.width = '30%';
  }, 100);
}

function finishLoadingBar() {
  const loadingBar = document.getElementById('loading-bar');
  if (!loadingBar) return;

  loadingBar.style.width = '100%';
  setTimeout(() => {
    loadingBar.style.width = '0';
  }, 300);
}

function getCachedImage(id, fetchFunction) {
  if (imageCache[id] && imageCache[id] !== defaultPoster) {
    return Promise.resolve(imageCache[id]);
  }

  return fetchFunction().then((poster) => {
    if (poster !== defaultPoster) {
      imageCache[id] = poster;
    }
    return poster;
  });
}

async function initializeSwitcher() {
  apiKeySwitcher = await loadApiKeys();
}

function createContentCard(item, poster, type) {
  const title = item.title || item.name || 'نامشخص';
  const overview = item.overview ? `${item.overview.slice(0, 100)}...` : 'توضیحات موجود نیست';
  const route = type === 'movie' ? 'movie' : 'series';

  return `
    <div class="group relative">
      <img src="${poster}" alt="${title}" class="w-full h-full rounded-lg shadow-lg">
      <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
        <h3 class="text-lg font-bold text-white">${title}</h3>
        <p class="text-sm text-gray-200">${overview}</p>
        <a href="/${route}/index.html?id=${item.id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
      </div>
    </div>
  `;
}

async function resolvePoster(itemId, type) {
  const detailsUrl = proxify(
    `https://api.themoviedb.org/3/${type}/${itemId}/external_ids?api_key=${apiKey}`
  );

  try {
    const detailsRes = await fetch(detailsUrl);
    if (!detailsRes.ok) return defaultPoster;

    const detailsData = await detailsRes.json();
    const imdbId = detailsData.imdb_id || '';
    if (!imdbId) return defaultPoster;

    return await getCachedImage(imdbId, async () => {
      const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
        (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
      );
      return omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
    });
  } catch (error) {
    console.warn(`خطا در دریافت پوستر ${type} ${itemId}:`, error.message);
    return defaultPoster;
  }
}

async function renderItems(items, container, type, seenIds) {
  const elements = await Promise.all(
    items.map(async (item) => {
      if (seenIds.has(item.id)) return '';
      seenIds.add(item.id);

      const poster = await resolvePoster(item.id, type);
      return createContentCard(item, poster, type);
    })
  );

  container.innerHTML =
    elements.filter(Boolean).join('') || '<p class="text-center text-red-500">داده‌ای یافت نشد!</p>';
}

async function fetchAndDisplayContent() {
  const movieContainer = document.getElementById('new-movies');
  const tvContainer = document.getElementById('trending-tv');
  if (!movieContainer || !tvContainer) return;

  const skeletonHTML = '<div class="skeleton w-full"></div>'.repeat(4);
  movieContainer.innerHTML = skeletonHTML;
  tvContainer.innerHTML = skeletonHTML;

  try {
    startLoadingBar();

    const [movieRes, tvRes] = await Promise.all([
      fetch(proxify(apiUrls.now_playing)),
      fetch(proxify(apiUrls.tv_trending))
    ]);

    if (!movieRes.ok || !tvRes.ok) {
      throw new Error('خطا در دریافت داده‌ها');
    }

    const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);
    const seenIds = new Set();

    await Promise.all([
      renderItems(movieData.results || [], movieContainer, 'movie', seenIds),
      renderItems(tvData.results || [], tvContainer, 'tv', seenIds)
    ]);
  } catch (error) {
    console.error('خطا در دریافت داده‌ها:', error);
    const errorHTML = '<p class="text-center text-red-500">خطایی رخ داد! لطفاً دوباره تلاش کنید.</p>';
    movieContainer.innerHTML = errorHTML;
    tvContainer.innerHTML = errorHTML;
  } finally {
    finishLoadingBar();
  }
}

function setupDismissableNotice({ noticeId, closeButtonId, storageKey }) {
  const notice = document.getElementById(noticeId);
  const closeButton = document.getElementById(closeButtonId);
  if (!notice || !closeButton) return;

  if (!localStorage.getItem(storageKey)) {
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }

  closeButton.addEventListener('click', () => {
    notice.classList.add('hidden');
    localStorage.setItem(storageKey, 'true');
  });
}

function manageNotification() {
  const supportButton = document.getElementById('support-button');

  setupDismissableNotice({
    noticeId: 'notification',
    closeButtonId: 'close-notification',
    storageKey: 'notificationClosed'
  });

  if (!supportButton) return;
  supportButton.addEventListener('click', () => {
    window.open(
      'https://twitter.com/intent/tweet?text=من از فیری مووی حمایت می‌کنم! یک سایت عالی برای تماشای فیلم و سریال: https://b2n.ir/freemovie',
      '_blank'
    );
  });
}

function manageDisclaimerNotice() {
  setupDismissableNotice({
    noticeId: 'disclaimer-notice',
    closeButtonId: 'close-disclaimer',
    storageKey: 'disclaimerNoticeClosed'
  });
}

function manageAvailabilityNotice() {
  setupDismissableNotice({
    noticeId: 'availability-notice',
    closeButtonId: 'close-availability',
    storageKey: 'availabilityNoticeClosed'
  });
}

function downloadImage(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function manageSupportPopup() {
  const popup = document.getElementById('support-popup');
  const closeButton = document.getElementById('close-popup');
  const tweetButton = document.getElementById('tweet-support');
  const downloadTwitterButton = document.getElementById('download-twitter');
  const downloadInstagramButton = document.getElementById('download-instagram');
  if (!popup) return;

  if (localStorage.getItem('isPopupShown') !== 'true') {
    popup.classList.remove('hidden');
    localStorage.setItem('isPopupShown', 'true');
  }

  closeButton?.addEventListener('click', () => popup.classList.add('hidden'));

  tweetButton?.addEventListener('click', () => {
    const tweetText = encodeURIComponent(
      'من از فیری مووی حمایت می‌کنم! یک سایت عالی برای تماشای فیلم و سریال: https://b2n.ir/freemovie'
    );
    window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
  });

  downloadTwitterButton?.addEventListener('click', () => {
    downloadImage('https://freemovieir.github.io/images/story.png', 'freemovie-twitter-support.jpg');
  });

  downloadInstagramButton?.addEventListener('click', () => {
    downloadImage('https://freemovieir.github.io/images/tweet.png', 'freemovie-instagram-support.jpg');
  });

  popup.addEventListener('click', (event) => {
    if (event.target === popup) {
      popup.classList.add('hidden');
    }
  });
}

function manageFabButton() {
  const fab = document.getElementById('fab');
  const fabOptions = document.getElementById('fabOptions');
  if (!fab || !fabOptions) return;

  fab.addEventListener('click', (event) => {
    event.stopPropagation();
    fabOptions.classList.toggle('hidden');
  });

  document.addEventListener('click', (event) => {
    if (!fab.contains(event.target) && !fabOptions.contains(event.target)) {
      fabOptions.classList.add('hidden');
    }
  });
}

function manageThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

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
  try {
    await initializeSwitcher();
    await fetchAndDisplayContent();
    manageFabButton();
    manageNotification();
    manageDisclaimerNotice();
    manageAvailabilityNotice();
    manageSupportPopup();
    manageThemeToggle();
  } catch (error) {
    console.error('خطا در بارگذاری اولیه:', error);
  }
});
