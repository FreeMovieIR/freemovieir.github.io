const defaultApiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';
const userTmdbToken = localStorage.getItem('userTmdbToken');
const apiKey = userTmdbToken || defaultApiKey;
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';

const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
const apiUrls = {
  now_playing: `${tmdbBase}/trending/movie/week?api_key=${apiKey}&language=fa`,
  tv_trending: `${tmdbBase}/trending/tv/week?api_key=${apiKey}&language=fa`
};

// imageCache removed
let apiKeySwitcher;

// --- Watchlist Logic ---
function getWatchlist() {
  return JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
}

function saveWatchlist(watchlist) {
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
}

function isInWatchlist(id, type) {
  const watchlist = getWatchlist();
  const normalizedId = String(id);
  const collection = type === 'movie' ? watchlist.movies : watchlist.series;
  return collection.some(i => String(i) === normalizedId);
}

window.toggleWatchlist = function (id, type) {
  const watchlist = getWatchlist();
  const normalizedId = String(id);
  const collection = type === 'movie' ? watchlist.movies : watchlist.series;
  const index = collection.findIndex(i => String(i) === normalizedId);

  if (index === -1) {
    collection.push(normalizedId);
  } else {
    collection.splice(index, 1);
  }

  saveWatchlist(watchlist);

  // Dispatch event so UI can update seamlessly
  window.dispatchEvent(new CustomEvent('watchlistChanged', { detail: { id, type } }));

  // Show small notification
  const msg = index === -1 ? 'به واچ‌لیست اضافه شد!' : 'از واچ‌لیست حذف شد!';
  if (window.showToast) window.showToast(msg, index === -1 ? 'success' : 'info');
};

// -----------------------

const proxify = (url) => (window.proxify ? window.proxify(url) : url);
const createContentCard = (item, poster, type) => (window.createMovieCard ? window.createMovieCard(item, poster, type) : '');

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

// getCachedImage removed

async function initializeSwitcher() {
  apiKeySwitcher = await loadApiKeys();
}

// Shared createMovieCard is used via window.createMovieCard alias above

// --- Advanced Slider Logic ---
let sliderItems = [];
let sliderIndex = 0;
let sliderInterval;

async function renderSlider() {
  const sliderContainer = document.getElementById('hero-slider');
  const dotsContainer = document.getElementById('slider-dots');
  if (!sliderContainer || sliderItems.length === 0) return;

  const renderItem = async (index) => {
    const item = sliderItems[index];
    const isMovie = item.title !== undefined;
    const type = isMovie ? 'movie' : 'series';
    const title = item.title || item.name;
    const overview = item.overview || 'مرجع دانلود فیلم و سریال رایگان';
    const poster = await window.resolvePoster(item.id, 'hero', item.poster_path);
    const tmdbImageBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
    const backdrop = item.backdrop_path ? `${tmdbImageBase}/w1280${item.backdrop_path}` : poster;

    return `
            <div class="absolute inset-0 transition-all duration-1000 opacity-0 transform scale-110 slider-item" data-index="${index}">
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10"></div>
                <div class="absolute inset-0 bg-gradient-to-l from-black/80 via-transparent to-transparent z-10"></div>
                <img src="${backdrop}" alt="${title}" class="w-full h-full object-cover transition-transform duration-[10s] scale-100 group-hover:scale-110">
                
                <div class="container mx-auto px-6 h-full flex items-center relative z-20">
                    <div class="max-w-3xl space-y-8 translate-y-10 transition-all duration-1000 opacity-0 content-box">
                        <div class="flex items-center gap-4">
                            <span class="bg-amber-500 text-black text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-xl shadow-amber-500/20">پیشنهاد ویژه</span>
                            <div class="flex items-center gap-2 text-white/80 font-bold backdrop-blur-md bg-white/5 px-3 py-1 rounded-lg border border-white/10">
                                <i class="fas fa-star text-amber-500 text-xs"></i>
                                ${item.vote_average.toFixed(1)}
                            </div>
                            <span class="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">${isMovie ? 'Movie' : 'TV Series'}</span>
                        </div>
                        <h1 class="text-6xl md:text-8xl font-black text-white leading-tight tracking-tighter drop-shadow-2xl">
                            ${title}
                        </h1>
                        <p class="text-lg md:text-2xl text-gray-300 leading-relaxed max-w-2xl line-clamp-3 drop-shadow-lg">
                            ${overview}
                        </p>
                        <div class="flex flex-wrap gap-5 pt-6">
                            <a href="/?${isMovie ? 'm' : 's'}=${item.id}" class="bg-white text-black px-10 py-5 rounded-[2rem] font-black text-xl transition-all duration-500 hover:scale-110 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center gap-4 group">
                                <i class="fas fa-play text-sm group-hover:scale-125 transition-transform"></i> تماشای جزئیات
                            </a>
                            <button onclick="window.toggleWatchlist('${item.id}', '${type}')" class="glass-card-premium text-white px-10 py-5 rounded-[2rem] font-black text-xl transition-all duration-500 hover:bg-white/10 hover:scale-110 flex items-center gap-4 border-white/10">
                                <i class="${isInWatchlist(item.id, type) ? 'fas text-amber-500' : 'far'} fa-bookmark"></i> واچ‌لیست
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
  };

  // Pre-render all items
  const itemsHtml = await Promise.all(sliderItems.map((_, i) => renderItem(i)));
  sliderContainer.innerHTML = itemsHtml.join('');

  // Render Dots
  if (dotsContainer) {
    dotsContainer.innerHTML = sliderItems.map((_, i) => `
            <button class="w-3 h-3 rounded-full bg-white/20 transition-all duration-500 slider-dot" data-index="${i}"></button>
        `).join('');
  }

  const showSlide = (index) => {
    const slides = document.querySelectorAll('.slider-item');
    const dots = document.querySelectorAll('.slider-dot');

    slides.forEach((slide, i) => {
      if (i === index) {
        slide.classList.remove('opacity-0', 'scale-110', 'pointer-events-none');
        slide.classList.add('opacity-100', 'scale-100');
        slide.querySelector('.content-box').classList.remove('opacity-0', 'translate-y-10');
      } else {
        slide.classList.add('opacity-0', 'scale-110', 'pointer-events-none');
        slide.classList.remove('opacity-100', 'scale-100');
        slide.querySelector('.content-box').classList.add('opacity-0', 'translate-y-10');
      }
    });

    dots.forEach((dot, i) => {
      if (i === index) {
        dot.classList.add('bg-amber-500', 'w-10');
        dot.classList.remove('bg-white/20', 'w-3');
      } else {
        dot.classList.remove('bg-amber-500', 'w-10');
        dot.classList.add('bg-white/20', 'w-3');
      }
    });

    sliderIndex = index;
  };

  // Initial show
  showSlide(0);

  // Auto rotate
  clearInterval(sliderInterval);
  sliderInterval = setInterval(() => {
    const next = (sliderIndex + 1) % sliderItems.length;
    showSlide(next);
  }, 8000);

  // Controls
  document.getElementById('slider-next')?.addEventListener('click', () => {
    showSlide((sliderIndex + 1) % sliderItems.length);
  });
  document.getElementById('slider-prev')?.addEventListener('click', () => {
    showSlide((sliderIndex - 1 + sliderItems.length) % sliderItems.length);
  });
}

// Global resolvePoster and Preload are now managed by layout-shared.js

// Global resolvePoster is now centralized in layout-shared.js

async function buildItemsHtml(items, type, seenIds) {
  const elements = await Promise.all(
    items.map(async (item) => {
      if (seenIds.has(item.id)) return '';
      seenIds.add(item.id);

      // Use global window.resolvePoster
      const poster = await window.resolvePoster(item.id, type, item.poster_path);
      return createContentCard(item, poster, type);
    })
  );

  return elements.filter(Boolean).join('') || '<p class="text-center text-red-500">داده‌ای یافت نشد!</p>';
}

async function fetchAndDisplayContent() {
  const movieContainer = document.getElementById('new-movies');
  const tvContainer = document.getElementById('trending-tv');
  if (!movieContainer || !tvContainer) return;

  // Ultra-fast DOM caching
  const cachedMovies = localStorage.getItem('homeCache_movies');
  const cachedTv = localStorage.getItem('homeCache_tv');

  const skeletonHTML = '<div class="animate-pulse bg-white/5 rounded-3xl aspect-[2/3] w-full border border-white/5"></div>'.repeat(4);

  if (cachedMovies) movieContainer.innerHTML = cachedMovies;
  else movieContainer.innerHTML = skeletonHTML;

  if (cachedTv) tvContainer.innerHTML = cachedTv;
  else tvContainer.innerHTML = skeletonHTML;

  try {
    startLoadingBar();

    // Fetch data in background
    const [movieRes, tvRes] = await Promise.all([
      fetch(proxify(apiUrls.now_playing)),
      fetch(proxify(apiUrls.tv_trending))
    ]);

    if (!movieRes.ok || !tvRes.ok) throw new Error('Network response was not ok');

    const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);

    const movies = movieData.results || [];
    const series = tvData.results || [];

    // sliderItems: 2 movies and 2 series
    sliderItems = [...movies.slice(0, 2), ...series.slice(0, 2)];
    renderSlider();

    const otherMovies = movies.slice(2);
    const otherSeries = series.slice(2);

    const seenIds = new Set();
    const [movieHtml, tvHtml] = await Promise.all([
      buildItemsHtml(otherMovies, 'movie', seenIds),
      buildItemsHtml(otherSeries, 'tv', seenIds)
    ]);

    if (movieContainer.innerHTML !== movieHtml) {
      movieContainer.innerHTML = movieHtml;
      localStorage.setItem('homeCache_movies', movieHtml);
    }
    if (tvContainer.innerHTML !== tvHtml) {
      tvContainer.innerHTML = tvHtml;
      localStorage.setItem('homeCache_tv', tvHtml);
    }
  } catch (error) {
    console.error('Fetch error:', error);
    if (!cachedMovies || !cachedTv) {
      const errorHTML = `
          <div class="col-span-full py-20 text-center glass-card-premium rounded-[2.5rem] border border-red-500/20">
            <i class="fas fa-exclamation-circle text-red-500 text-5xl mb-6 shadow-xl shadow-red-500/20"></i>
            <h3 class="text-2xl font-black text-white mb-2">خطا در اتصال به سرور</h3>
            <p class="text-gray-400">متأسفانه امکان دریافت اطلاعات در این لحظه میسر نیست.</p>
            <button onclick="location.reload()" class="mt-8 px-8 py-3 bg-red-500/10 text-red-500 border border-red-500/30 rounded-2xl hover:bg-red-500 hover:text-white transition-all">تلاش دوباره</button>
          </div>
        `;
      movieContainer.innerHTML = errorHTML;
      tvContainer.innerHTML = errorHTML;
    }
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
    const text = window.CONFIG ? window.CONFIG.LINKS.DEFAULT_SUPPORT_TEXT : 'من از فیری مووی حمایت می‌کنم!';
    const intent = window.CONFIG ? window.CONFIG.LINKS.TWITTER_INTENT : 'https://twitter.com/intent/tweet?text=';
    window.open(`${intent}${encodeURIComponent(text)}`, '_blank');
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
    const text = window.CONFIG ? window.CONFIG.LINKS.DEFAULT_SUPPORT_TEXT : 'من از فیری مووی حمایت می‌کنم!';
    const intent = window.CONFIG ? window.CONFIG.LINKS.TWITTER_INTENT : 'https://twitter.com/intent/tweet?text=';
    window.open(`${intent}${encodeURIComponent(text)}`, '_blank');
  });

  downloadTwitterButton?.addEventListener('click', () => {
    const img = window.CONFIG ? window.CONFIG.ASSETS.STORY_IMAGE : 'https://freemovieir.github.io/images/story.png';
    downloadImage(img, 'freemovie-twitter-support.jpg');
  });

  downloadInstagramButton?.addEventListener('click', () => {
    const img = window.CONFIG ? window.CONFIG.ASSETS.TWEET_IMAGE : 'https://freemovieir.github.io/images/tweet.png';
    downloadImage(img, 'freemovie-instagram-support.jpg');
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

// --- Routing and Details Fetch Logic ---

async function fetchDetails(id, type) {
  const isMovie = type === 'movie';
  const baseUrl = `https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${id}?api_key=${apiKey}&language=fa-IR&append_to_response=credits,videos,external_ids`;

  try {
    startLoadingBar();
    const res = await fetch(baseUrl);
    if (!res.ok) throw new Error("Item not found");

    const data = await res.json();
    const imdbId = data.external_ids?.imdb_id || '';
    const posterUrl = await window.resolvePoster(id, 'detail', data.poster_path);

    renderDetailsView(data, posterUrl, imdbId, type);
  } catch (err) {
    console.error(err);
    document.getElementById('general-error-message').textContent = 'خطا در دریافت اطلاعات. لطفا دوباره تلاش کنید.';
    document.getElementById('general-error-message').classList.remove('hidden');
  } finally {
    finishLoadingBar();
  }
}

function renderDetailsView(data, posterUrl, imdbId, type) {
  const isMovie = type === 'movie';
  const title = data.title || data.name || 'بدون نام';
  const year = isMovie ? (data.release_date?.substring(0, 4)) : (data.first_air_date?.substring(0, 4));
  const overview = data.overview || 'خلاصه داستانی در دسترس نیست.';
  const genres = data.genres?.map(g => g.name).join(', ') || 'نامشخص';
  const rating = data.vote_average?.toFixed(1) || '—';
  const tmdbImageBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
  const backdropUrl = data.backdrop_path ? `${tmdbImageBase}/original${data.backdrop_path}` : posterUrl;

  // Update Document Meta
  document.title = `${title} (${year || ''}) - فیری مووی`;
  const metaDesc = overview.substring(0, 150) + '...';
  document.querySelector('meta[name="description"]')?.setAttribute('content', metaDesc);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  document.querySelector('meta[property="og:image"]')?.setAttribute('content', backdropUrl);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', metaDesc);
  document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', document.title);
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', metaDesc);
  document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', backdropUrl);

  // Background and poster
  const detailsBg = document.getElementById('main-content-sections');
  if (detailsBg) {
    detailsBg.style.backgroundImage = `url('${backdropUrl}')`;
    detailsBg.style.backgroundSize = 'cover';
    detailsBg.style.backgroundPosition = 'center top';
  }
  document.getElementById('details-poster').src = posterUrl;
  document.getElementById('details-poster').classList.add('reveal-on-scroll');

  // Text Data
  document.getElementById('details-title').textContent = title;
  document.getElementById('rating-text').textContent = rating;
  document.getElementById('details-overview').textContent = overview;
  document.getElementById('details-type-badge').textContent = isMovie ? 'فیلم' : 'سریال';

  // Metadata Grid
  const metaGrid = document.getElementById('details-meta-grid');

  // Watchlist Button setup for detail page
  const wlBtn = document.getElementById('details-watchlist-btn');
  if (wlBtn) {
    const isAdded = isInWatchlist(data.id, type);
    wlBtn.innerHTML = `<i class="${isAdded ? 'fas text-amber-500' : 'far text-white'} fa-bookmark text-xl"></i>`;
    wlBtn.onclick = () => {
      window.toggleWatchlist(data.id, type);
      const newlyAdded = isInWatchlist(data.id, type);
      wlBtn.innerHTML = `<i class="${newlyAdded ? 'fas text-amber-500' : 'far text-white'} fa-bookmark text-xl"></i>`;
    };
  }

  let metaHtml = `
    <div class="glass-card-premium p-4 rounded-2xl border-white/5 flex items-center gap-4 reveal-on-scroll">
            <div class="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500"><i class="fas fa-tags"></i></div>
            <div><span class="text-gray-400 text-xs block mb-1">ژانر</span><strong class="text-white text-sm">${genres}</strong></div>
        </div>
        <div class="glass-card-premium p-4 rounded-2xl border-white/5 flex items-center gap-4 reveal-on-scroll">
            <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><i class="fas fa-calendar-alt"></i></div>
            <div><span class="text-gray-400 text-xs block mb-1">سال تولید</span><strong class="text-white text-sm">${year || 'نامشخص'}</strong></div>
        </div>
    `;

  if (isMovie) {
    const director = data.credits?.crew?.find(c => c.job === 'Director')?.name || 'نامشخص';
    const runtime = data.runtime ? `${data.runtime} دقیقه` : 'نامشخص';
    metaHtml += `
            <div class="glass-card-premium p-4 rounded-2xl border-white/5 flex items-center gap-4 reveal-on-scroll">
                <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500"><i class="fas fa-video"></i></div>
                <div><span class="text-gray-400 text-xs block mb-1">کارگردان</span><strong class="text-white text-sm">${director}</strong></div>
            </div>
            <div class="glass-card-premium p-4 rounded-2xl border-white/5 flex items-center gap-4 reveal-on-scroll">
                <div class="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500"><i class="fas fa-clock"></i></div>
                <div><span class="text-gray-400 text-xs block mb-1">مدت زمان</span><strong class="text-white text-sm">${runtime}</strong></div>
            </div>
        `;
  } else {
    const seasons = data.number_of_seasons || 'نامشخص';
    metaHtml += `
            <div class="glass-card-premium p-4 rounded-2xl border-white/5 flex items-center gap-4 reveal-on-scroll">
                <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500"><i class="fas fa-tv"></i></div>
                <div><span class="text-gray-400 text-xs block mb-1">تعداد فصل‌ها</span><strong class="text-white text-sm">${seasons}</strong></div>
            </div>
         `;
  }
  metaGrid.innerHTML = metaHtml;

  // IMDb Link
  const imdbLinkEl = document.getElementById('imdb-link');
  if (imdbId) {
    imdbLinkEl.innerHTML = `
            <a href="https://www.imdb.com/title/${imdbId}/" target="_blank" class="glass-card flex items-center justify-between p-4 rounded-2xl border-white/5 hover:bg-white/10 transition-all duration-300">
                <div class="flex items-center gap-3">
                    <img src="${window.CONFIG ? window.CONFIG.ASSETS.FAVICON_IMDB : 'https://m.media-amazon.com/images/G/01/imdb/images-ANDW73HA/favicon_desktop_32x32._CB1582158068_.png'}" class="w-6 h-6">
                    <span class="text-white font-bold">مشاهده در IMDb</span>
                </div>
                <i class="fas fa-external-link-alt text-xs text-amber-500"></i>
            </a>
        `;
  } else {
    imdbLinkEl.innerHTML = '';
  }

  // Trailer
  let trailerUrl = null;
  if (data.videos?.results) {
    const trailer = data.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    if (trailer) trailerUrl = `https://www.youtube.com/embed/${trailer.key}`;
  }

  document.getElementById('trailer-container').innerHTML = trailerUrl
    ? `<iframe src="${trailerUrl}" class="w-full aspect-video rounded-3xl" allowfullscreen></iframe>`
    : `<p class="text-amber-500 text-center py-8">تریلر در دسترس نیست</p>`;

  // Download Links
  const downloadContainer = document.getElementById('download-links');
  if (isMovie) {
    const imdbShort = imdbId.replace('tt', '');
    downloadContainer.innerHTML = `
            <a href="https://berlin.saymyname.website/Movies/${year}/${imdbShort}" target="_blank" class="bg-amber-500 text-black px-6 py-4 rounded-2xl font-black flex-1 flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors"><i class="fas fa-download"></i> دانلود مستقیم</a>
            <a href="http://subtitlestar.com/go-to.php?imdb-id=${imdbId}" target="_blank" class="glass-card text-white px-6 py-4 rounded-2xl font-black flex-1 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"><i class="fas fa-language"></i> زیرنویس</a>
        `;
  } else {
    let dlHtml = '';
    const seasons = data.number_of_seasons || 1;
    for (let s = 1; s <= seasons; s++) {
      const subProxy = window.CONFIG ? window.CONFIG.LINKS.SUBTITLE_PROXY : 'https://subtitle.saymyname.website/DL/filmgir';
      dlHtml += `
                <div class="w-full glass-card p-4 rounded-2xl text-center">
                    <h3 class="font-bold text-amber-500 mb-2">فصل ${s}</h3>
                    <div class="flex gap-2 flex-wrap justify-center">
                        <a href="${subProxy}/?i=${imdbId}&f=${s}&q=1" class="text-xs bg-white/10 px-3 py-2 rounded-lg hover:bg-white/20">کیفیت 1</a>
                        <a href="${subProxy}/?i=${imdbId}&f=${s}&q=2" class="text-xs bg-white/10 px-3 py-2 rounded-lg hover:bg-white/20">کیفیت 2</a>
                    </div>
                </div>
            `;
    }
    downloadContainer.innerHTML = dlHtml;
  }

  // View Switch
  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('details-view').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Check Routes via URL Search Params
async function handleRouting() {
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get('m');
  const seriesId = params.get('s');

  if (movieId) {
    await fetchDetails(movieId, 'movie');
  } else if (seriesId) {
    await fetchDetails(seriesId, 'series');
  } else {
    // Only fetch main content if on home route
    await fetchAndDisplayContent();
  }
}

// Support browser back navigation
window.addEventListener('popstate', async () => {
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get('m');
  const seriesId = params.get('s');

  if (movieId || seriesId) {
    // We went back to a details page
    await handleRouting();
  } else {
    // We went back to home
    document.getElementById('details-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    document.title = 'فیری مووی - دانلود و تماشای جدیدترین فیلم‌ها و سریال‌ها';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// Manual Back Button
window.goBackHome = function () {
  const params = new URLSearchParams(window.location.search);
  if (params.has('m') || params.has('s')) {
    history.pushState(null, '', '/');
  }
  document.getElementById('details-view').classList.add('hidden');
  document.getElementById('home-view').classList.remove('hidden');
  document.title = 'فیری مووی - دانلود و تماشای جدیدترین فیلم‌ها و سریال‌ها';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializeSwitcher();
    await handleRouting();
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
