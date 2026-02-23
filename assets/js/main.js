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
  showToast(msg, index === -1 ? 'success' : 'info');
};

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full font-bold shadow-2xl transition-all translate-y-[-100px] bg-base-800 text-white border border-white/10`;
  toast.innerHTML = `<div class="flex items-center gap-3">
    <i class="fas ${type === 'success' ? 'fa-check text-green-500' : 'fa-info-circle text-blue-500'}"></i>
    <span>${message}</span>
  </div>`;
  document.body.appendChild(toast);

  setTimeout(() => toast.style.transform = 'translate(-50%, 0)', 100);
  setTimeout(() => {
    toast.style.transform = 'translate(-50%, -100px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
// -----------------------

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
  const overview = item.overview ? `${item.overview.slice(0, 80)}...` : 'بدون توضیحات';
  const score = item.vote_average ? item.vote_average.toFixed(1) : '—';
  const paramText = type === 'movie' ? `m=${item.id}` : `s=${item.id}`;

  return `
    <div class="movie-card group relative overflow-hidden rounded-2xl glass-card transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl hover:shadow-amber-500/20 cursor-pointer" onclick="window.location.href='/?${paramText}'">
      <div class="aspect-[2/3] relative overflow-hidden">
        <img src="${poster}" alt="${title}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
        <div class="movie-card-overlay absolute inset-0 flex flex-col justify-end p-5">
          <div class="movie-card-info">
            <div class="flex items-center gap-2 mb-2">
              <span class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                <i class="fas fa-star text-[8px]"></i> ${score}
              </span>
              <span class="text-white/40 text-[10px] font-bold uppercase tracking-widest">${type}</span>
            </div>
            <h3 class="text-lg font-black text-white mb-2 leading-tight line-clamp-2 drop-shadow-lg">${title}</h3>
            <p class="text-xs text-gray-300 mb-4 line-clamp-2 opacity-80">${overview}</p>
            <button class="w-full bg-white/10 hover:bg-amber-500 hover:text-black hover:scale-105 backdrop-blur-md text-white border border-white/10 text-xs font-black py-2.5 rounded-xl transition-all duration-300">
              مشاهده جزئیات
            </button>
          </div>
        </div>
      </div>
      <div class="absolute top-3 right-3 glass-card px-2 py-1 rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <i class="fas fa-play text-[10px] text-amber-500"></i>
      </div>
    </div>
  `;
}

async function renderHero(movie) {
  const heroContainer = document.getElementById('hero-section');
  if (!heroContainer || !movie) return;

  const poster = await resolvePoster(movie.id, 'movie');
  const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : poster;
  const title = movie.title || 'فیری مووی';
  const overview = movie.overview || 'مرجع دانلود فیلم و سریال';

  heroContainer.classList.remove('animate-pulse');
  heroContainer.innerHTML = `
        <div class="absolute inset-0 z-0">
            <div class="absolute inset-0 bg-gradient-to-t from-base-950 via-base-950/60 to-transparent z-10"></div>
            <div class="absolute inset-0 bg-gradient-to-l from-base-950/80 via-transparent to-transparent z-10"></div>
            <img src="${backdrop}" alt="${title}" class="w-full h-full object-cover">
        </div>
        
        <div class="container mx-auto px-6 relative z-10 py-20">
            <div class="max-w-2xl space-y-6">
                <div class="flex items-center gap-3">
                    <span class="bg-amber-500 text-black text-xs font-black px-3 py-1 rounded-full uppercase tracking-tighter shadow-lg shadow-amber-500/20">پیشنهاد ویژه</span>
                    <span class="text-white/60 text-sm font-bold flex items-center gap-2">
                        <i class="fas fa-star text-amber-500"></i> ${movie.vote_average.toFixed(1)}
                    </span>
                </div>
                <h1 class="text-5xl md:text-7xl font-black text-white leading-tight tracking-tighter drop-shadow-2xl">
                    ${title}
                </h1>
                <p class="text-lg md:text-xl text-gray-300 leading-relaxed max-w-xl drop-shadow-lg line-clamp-3 md:line-clamp-none">
                    ${overview}
                </p>
                <div class="flex flex-wrap gap-4 pt-4">
                    <a href="/?m=${movie.id}" class="bg-amber-500 hover:bg-amber-400 text-black px-8 py-4 rounded-2xl font-black text-lg transition-all duration-300 hover:scale-105 flex items-center gap-3 shadow-xl shadow-amber-500/20">
                        <i class="fas fa-play"></i> تماشا کنید
                    </a>
                    <button onclick="toggleWatchlist('${movie.id}', 'movie')" class="watchlist-btn-${movie.id} bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 text-white px-8 py-4 rounded-2xl font-black text-lg transition-all duration-300 hover:scale-105 flex items-center gap-3">
                        <i id="wl-icon-${movie.id}" class="${isInWatchlist(movie.id, 'movie') ? 'fas text-amber-500' : 'far text-white'} fa-bookmark"></i> واچ‌لیست
                    </button>
                </div>
            </div>
        </div>
    `;

  // Listen to watchlist updates and update button state
  window.addEventListener('watchlistChanged', (e) => {
    if (String(e.detail.id) === String(movie.id)) {
      const icon = document.getElementById(`wl-icon-${movie.id}`);
      if (icon) {
        const added = isInWatchlist(movie.id, 'movie');
        icon.className = `${added ? 'fas text-amber-500' : 'far text-white'} fa-bookmark`;
      }
    }
  });
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

  const skeletonHTML = `
    <div class="animate-pulse bg-base-800 rounded-xl aspect-[2/3] w-full shadow-lg border border-gray-700/50"></div>
  `.repeat(4);
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
    const movies = movieData.results || [];
    const featuredMovie = movies[0];
    const otherMovies = movies.slice(1);

    if (featuredMovie) {
      await renderHero(featuredMovie);
    }

    const seenIds = new Set();
    await Promise.all([
      renderItems(otherMovies, movieContainer, 'movie', seenIds),
      renderItems(tvData.results || [], tvContainer, 'tv', seenIds)
    ]);
  } catch (error) {
    console.error('خطا در دریافت داده‌ها:', error);
    const errorHTML = `
      <div class="col-span-full flex flex-col items-center justify-center p-8 bg-red-900/20 border border-red-500/30 rounded-xl backdrop-blur-sm">
        <i class="fas fa-exclamation-circle text-red-500 text-5xl mb-4 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]"></i>
        <h3 class="text-xl font-bold text-red-400 mb-2">خطا در دریافت اطلاعات</h3>
        <p class="text-gray-300 text-center">متأسفانه در حال حاضر امکان دریافت اطلاعات از سرور وجود ندارد. لطفاً ارتباط خود را بررسی کرده و صفحه را رفرش کنید.</p>
        <button onclick="location.reload()" class="mt-4 px-6 py-2 bg-red-600/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-600/40 transition-colors">تلاش مجدد</button>
      </div>
    `;
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
    const posterUrl = await resolvePoster(id, type);

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
  const backdropUrl = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : posterUrl;

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
        <div class="glass-card p-4 rounded-2xl border-white/5 flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500"><i class="fas fa-tags"></i></div>
            <div><span class="text-gray-400 text-xs block mb-1">ژانر</span><strong class="text-white text-sm">${genres}</strong></div>
        </div>
        <div class="glass-card p-4 rounded-2xl border-white/5 flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><i class="fas fa-calendar-alt"></i></div>
            <div><span class="text-gray-400 text-xs block mb-1">سال تولید</span><strong class="text-white text-sm">${year || 'نامشخص'}</strong></div>
        </div>
    `;

  if (isMovie) {
    const director = data.credits?.crew?.find(c => c.job === 'Director')?.name || 'نامشخص';
    const runtime = data.runtime ? `${data.runtime} دقیقه` : 'نامشخص';
    metaHtml += `
            <div class="glass-card p-4 rounded-2xl border-white/5 flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500"><i class="fas fa-video"></i></div>
                <div><span class="text-gray-400 text-xs block mb-1">کارگردان</span><strong class="text-white text-sm">${director}</strong></div>
            </div>
            <div class="glass-card p-4 rounded-2xl border-white/5 flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500"><i class="fas fa-clock"></i></div>
                <div><span class="text-gray-400 text-xs block mb-1">مدت زمان</span><strong class="text-white text-sm">${runtime}</strong></div>
            </div>
        `;
  } else {
    const seasons = data.number_of_seasons || 'نامشخص';
    metaHtml += `
            <div class="glass-card p-4 rounded-2xl border-white/5 flex items-center gap-4">
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
                    <img src="https://m.media-amazon.com/images/G/01/imdb/images-ANDW73HA/favicon_desktop_32x32._CB1582158068_.png" class="w-6 h-6">
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
      dlHtml += `
                <div class="w-full glass-card p-4 rounded-2xl text-center">
                    <h3 class="font-bold text-amber-500 mb-2">فصل ${s}</h3>
                    <div class="flex gap-2 flex-wrap justify-center">
                        <a href="https://subtitle.saymyname.website/DL/filmgir/?i=${imdbId}&f=${s}&q=1" class="text-xs bg-white/10 px-3 py-2 rounded-lg hover:bg-white/20">کیفیت 1</a>
                        <a href="https://subtitle.saymyname.website/DL/filmgir/?i=${imdbId}&f=${s}&q=2" class="text-xs bg-white/10 px-3 py-2 rounded-lg hover:bg-white/20">کیفیت 2</a>
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
