const t = (key) => window.i18n ? window.i18n.t(key) : key;

const defaultApiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';
const userTmdbToken = localStorage.getItem('userTmdbToken');
const apiKey = userTmdbToken || defaultApiKey;
const defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';

const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';

// Set language for TMDB API based on site language
const apiLang = (window.i18n && window.i18n.current === 'fa') ? 'fa-IR' : (window.i18n ? window.i18n.current : 'en-US');

const apiUrls = {
  now_playing: `${tmdbBase}/trending/movie/week?api_key=${apiKey}&language=${apiLang}`,
  tv_trending: `${tmdbBase}/trending/tv/week?api_key=${apiKey}&language=${apiLang}`
};

function translateStaticElements() {
  const elements = {
    'new-movies-heading': t('new_movies'),
    'trending-tv-heading': t('top_series'),
    'view-archive-btn-text': t('view_archive'),
    'all-archive-btn-text': t('all_archive'),
    'go-back-btn-text': t('back'),
    'details-overview-heading': t('storyline'),
    'details-type-badge': t('site_title'), // fallback
    'download-links-heading': t('download_links')
  };

  for (const [id, value] of Object.entries(elements)) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  }
}

const proxify = (url) => (window.proxify ? window.proxify(url) : url);

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
    const title = item.title || item.name || 'Untitled';
    const originalTitle = item.original_title || item.original_name || '';
    const overview = item.overview || t('footer_desc');
    const poster = await window.resolvePoster(item.id, 'hero', item.poster_path);
    const tmdbImageBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
    const backdrop = item.backdrop_path ? `${tmdbImageBase}/w1280${item.backdrop_path}` : poster;

    return `
            <div class="absolute inset-0 slider-item opacity-0 transition-all duration-1000 ease-in-out" data-index="${index}">
                <!-- Background Layer -->
                <div class="absolute inset-0 z-0">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#07090f] via-[#07090f]/40 to-transparent z-10"></div>
                    <div class="absolute inset-x-0 inset-y-0 bg-black/40 z-[1]"></div>
                    <img src="${backdrop}" alt="${title}" class="w-full h-full object-cover transition-transform duration-[20s] scale-100 group-active:scale-110">
                </div>
                
                <!-- Content Layer -->
                <div class="container mx-auto px-6 md:px-12 h-full flex items-center relative z-20">
                    <div class="max-w-4xl space-y-6 md:space-y-8 content-box transform translate-y-10 transition-all duration-700 opacity-0">
                        <div class="flex flex-wrap items-center gap-4">
                            <span class="bg-amber-500 text-black text-[10px] md:text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-xl shadow-amber-500/20">
                                ${t('featured')}
                            </span>
                            <div class="flex items-center gap-2 text-white font-bold backdrop-blur-md bg-white/5 px-3 py-1 rounded-xl border border-white/10 text-sm">
                                <i class="fas fa-star text-amber-500"></i>
                                ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}
                            </div>
                            <span class="text-white/40 text-[10px] font-black uppercase tracking-widest">
                                ${isMovie ? t('cinema') : t('tv_archive')}
                            </span>
                        </div>
                        
                        <div class="space-y-2">
                            <h1 class="text-4xl md:text-7xl font-black text-white leading-tight drop-shadow-2xl">
                                ${title}
                            </h1>
                            ${originalTitle && originalTitle !== title ? `<h2 class="text-xl md:text-2xl font-bold text-amber-500/80 tracking-tight">${originalTitle}</h2>` : ''}
                        </div>
                        
                        <p class="text-base md:text-lg text-gray-300 leading-relaxed max-w-2xl line-clamp-3 font-medium text-opacity-80">
                            ${overview}
                        </p>
                        
                        <div class="flex flex-wrap gap-4 pt-6">
                            <a href="/?${isMovie ? 'm' : 's'}=${item.id}" class="bg-white text-black px-8 md:px-10 py-3 md:py-4 rounded-2xl font-black text-sm md:text-base transition-all hover:scale-105 flex items-center gap-3">
                                <i class="fas fa-play"></i> ${t('view_details')}
                            </a>
                            <button onclick="window.toggleWatchlist('${item.id}', '${type}')" class="bg-white/5 backdrop-blur-md text-white border border-white/10 px-8 md:px-10 py-3 md:py-4 rounded-2xl font-black text-sm md:text-base hover:bg-white/10 transition-all">
                                <i class="far fa-bookmark ml-2"></i> ${t('add_watchlist')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
  };

  const itemsHtml = await Promise.all(sliderItems.map((_, i) => renderItem(i)));
  sliderContainer.innerHTML = itemsHtml.join('');

  if (dotsContainer) {
    dotsContainer.innerHTML = sliderItems.map((_, i) => `
            <button class="w-2 h-2 rounded-full bg-white/20 transition-all duration-300 slider-dot" data-index="${i}"></button>
        `).join('');
  }

  const showSlide = (index) => {
    const slides = document.querySelectorAll('.slider-item');
    const dots = document.querySelectorAll('.slider-dot');
    if (!slides.length) return;

    slides.forEach((slide, i) => {
      const box = slide.querySelector('.content-box');
      if (i === index) {
        slide.classList.add('opacity-100', 'z-10');
        slide.classList.remove('opacity-0', 'z-0');
        if (box) {
          box.classList.add('opacity-100', 'translate-y-0');
          box.classList.remove('opacity-0', 'translate-y-10');
        }
      } else {
        slide.classList.add('opacity-0', 'z-0');
        slide.classList.remove('opacity-100', 'z-10');
        if (box) {
          box.classList.add('opacity-0', 'translate-y-10');
          box.classList.remove('opacity-100', 'translate-y-0');
        }
      }
    });

    dots.forEach((dot, i) => {
      if (i === index) {
        dot.classList.add('bg-amber-500', 'w-8');
        dot.classList.remove('bg-white/20', 'w-2');
      } else {
        dot.classList.add('bg-white/20', 'w-2');
        dot.classList.remove('bg-amber-500', 'w-8');
      }
    });

    sliderIndex = index;
  };

  showSlide(0);
  clearInterval(sliderInterval);
  sliderInterval = setInterval(() => showSlide((sliderIndex + 1) % sliderItems.length), 10000);
  if (window.refreshRevealObserver) window.refreshRevealObserver();
}

async function fetchAndDisplayContent() {
  const movieGrid = document.getElementById('new-movies-grid');
  const tvGrid = document.getElementById('trending-tv-grid');
  if (!movieGrid || !tvGrid) return;

  try {
    // 1. Use SmartFetch (Automatic key rotation and service failover)
    const { movies, series, source } = await window.FreeMovieAPI.SmartFetch.fetchHomeContent();
    console.log(`Content loaded via ${source.toUpperCase()}`);

    // 2. Render Slider (Using first few items)
    sliderItems = [...movies.slice(0, 5), ...series.slice(0, 5)];
    renderSlider();


    // Cache content for next visit
    localStorage.setItem('homeCache_header', document.getElementById('shared-header')?.innerHTML || '');
    localStorage.setItem('homeCache_movies', movieContainer.innerHTML);
    localStorage.setItem('homeCache_tv', tvContainer.innerHTML);

  } catch (error) {
    console.error('FreeMovie API Fetch error:', error);
  }
}

// Routing logic
function handleRouting() {
  translateStaticElements();
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get('m');
  const seriesId = params.get('s');

  if (movieId || seriesId) {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('details-view').classList.remove('hidden');
    fetchDetails(movieId || seriesId, movieId ? 'movie' : 'tv');
  } else {
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('details-view').classList.add('hidden');
    fetchAndDisplayContent();
  }
}

async function fetchDetails(id, type) {
  const isMovie = type === 'movie';
  let data = null;
  let poster = null;

  try {
    // 1. Fetch Metadata via SmartFetch or Custom Logic
    const tmdbBase = window.CONFIG?.API?.TMDB || 'https://api.themoviedb.org/3';
    const lang = (window.i18n && window.i18n.current === 'fa') ? 'fa-IR' : 'en-US';
    const keys = window.CONFIG?.TMDB_KEYS || [window.CONFIG?.TMDB_DEFAULT_KEY];

    // We try keys for details too (Simple rotation here)
    for (const key of keys) {
      try {
        const url = `${tmdbBase}/${type}/${id}?api_key=${key}&language=${lang}&append_to_response=credits,videos,external_ids`;
        const res = await fetch(proxify(url));
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch (e) { continue; }
    }

    // 2. Fetch Seasons if Series
    if (type === 'tv' && window.FreeMovieAPI) {
      try {
        const seasons = await window.FreeMovieAPI.fetchSeasons(id);
        if (seasons) data = { ...data, seasons };
      } catch (e) { console.warn('FreeMovie seasons fetch failed', e); }
    }

    if (data) {
      poster = await window.resolvePoster(id, 'detail', data.poster_path || data.image);
      renderDetails(data, poster, type);
    }
  } catch (error) {
    console.error('Fatal error in fetchDetails:', error);
  }
}

function renderDetails(data, poster, type) {
  const utils = window.FreeMovieAPI.UIUtils;
  const displayTitle = utils.formatTitle(data);
  const isMovie = type === 'movie' || data.title;

  document.getElementById('details-title').textContent = displayTitle;
  document.getElementById('details-poster').src = poster;
  document.getElementById('details-type-badge').textContent = isMovie ? t('cinema') : t('tv_archive');
  document.getElementById('details-overview').textContent = data.overview || t('not_found');
  document.getElementById('rating-text').textContent = data.vote_average ? data.vote_average.toFixed(1) : '—';

  renderDownloadSection(data, isMovie ? 'movie' : 'series');
  document.title = `${displayTitle} | ${t('site_title')}`;
}

async function renderDownloadSection(data, type) {
  const container = document.getElementById('download-links');
  if (!container) return;
  container.innerHTML = `<div class="w-full flex justify-center py-10"><div class="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div></div>`;

  const links = await generateDownloadLinks(data, type);

  if (links.length === 0) {
    container.innerHTML = `<p class="text-gray-500 font-bold text-center w-full py-10">${t('not_found')}</p>`;
    return;
  }

  // Use the new download-grid class for better organization
  container.className = "download-grid mt-6";
  container.innerHTML = links.map(link => `
        <a href="${link.url}" target="_blank" class="glass-card-premium p-6 rounded-3xl border border-white/5 hover:border-amber-500/30 transition-all hover:scale-[1.02] group relative overflow-hidden flex flex-col justify-between">
            <div class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="flex items-center justify-between relative z-10">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                        <i class="fas ${link.icon || 'fa-download'} text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-white font-black text-sm uppercase tracking-wider">${link.label}</h4>
                        <p class="text-[10px] text-gray-500 font-bold uppercase mt-1 italic">${link.source || 'General Source'}</p>
                    </div>
                </div>
                <i class="fas fa-external-link-alt text-gray-700 group-hover:text-amber-500 transition-colors"></i>
            </div>
        </a>
    `).join('');
}

/**
 * Generate download links based on API data and patterns (Cleaned up)
 */
async function generateDownloadLinks(data, type) {
  const links = [];
  const isMovie = type === 'movie';
  const almasBase = window.CONFIG?.API?.ALMAS_MOVIE ? `https://${window.CONFIG.API.ALMAS_MOVIE}` : "https://dl1.almasmovie.xyz";

  // 1. Priority: API Sources (Real Data from Kotlin-style repositories)
  if (data.sources && Array.isArray(data.sources)) {
    data.sources.forEach(source => {
      links.push({
        label: source.quality || 'Download',
        url: source.url,
        source: "Hi-Speed Server",
        icon: source.quality?.includes('1080') ? "fa-film" : "fa-video"
      });
    });
  }

  // 2. Series Logic: Seasons & Episodes (Enhanced)
  if (!isMovie && data.seasons && window.FreeMovieAPI) {
    try {
      const videos = window.FreeMovieAPI.toStremioVideos(data.seasons, data.id);
      // Show latest 8 episodes
      videos.slice(0, 8).forEach(vid => {
        if (vid._sources) {
          vid._sources.forEach(src => {
            links.push({
              label: `S${vid.season.toString().padStart(2, '0')}E${vid.episode.toString().padStart(2, '0')} - ${src.quality}`,
              url: src.url,
              source: "Direct Stream",
              icon: "fa-tv"
            });
          });
        }
      });
    } catch (e) { console.warn('Error processing FreeMovie seasons', e); }
  }

  // 3. Pattern-based Fallbacks (Only if no real sources found to keep it clean)
  if (links.length === 0) {
    const titleEn = (data.original_title || data.original_name || data.title || '').replace(/[^a-zA-Z0-9]/g, '.');
    const year = data.year || (isMovie ? data.release_date?.substring(0, 4) : data.first_air_date?.substring(0, 4));

    if (isMovie) {
      const patterns = [
        { suffix: '1080p.HardSub', icon: 'fa-film' },
        { suffix: '720p.HardSub', icon: 'fa-video' },
        { suffix: '1080p.Dubbed', icon: 'fa-microphone' }
      ];
      patterns.forEach(p => {
        links.push({
          label: p.suffix,
          url: `${almasBase}/Movies/${year}/${titleEn}/${titleEn}.${p.suffix}.mkv`,
          source: "Almas Movie",
          icon: p.icon
        });
      });
    } else {
      // Basic series fallback
      ['1080p', '720p'].forEach(q => {
        links.push({
          label: `S01E01.${q}.WEB-DL`,
          url: `${almasBase}/Series/${titleEn}/S01/${q}/${titleEn}.S01E01.${q}.mkv`,
          source: "Almas Movie",
          icon: "fa-tv"
        });
      });
    }
  }

  return links;
}

// Quotes System
async function initQuotes() {
  const quoteText = document.getElementById('quote-text');
  const quoteAuthor = document.getElementById('quote-author');
  const quoteMovie = document.getElementById('quote-movie');
  if (!quoteText) return;

  try {
    const res = await fetch('/assets/data/quotes.json');
    const quotes = await res.json();
    const random = quotes[Math.floor(Math.random() * quotes.length)];

    quoteText.textContent = random.text;
    quoteAuthor.textContent = random.author;
    quoteMovie.textContent = random.movie;
  } catch (e) { console.error('Quotes error:', e); }
}

// Announcements System
function initAnnouncements() {
  const bar = document.getElementById('announcement-bar');
  const text = document.getElementById('notification-text');
  if (!bar || !text) return;

  const news = [
    "به فیری مووی خوش آمدید! بخش جدید دیالوگ‌های ماندگار اضافه شد.",
    "نسخه جدید مترجم زیرنویس به زودی منتشر می‌شود.",
    "امکان تماشای آنلاین فیلم‌ها به زودی فعال خواهد شد."
  ];
  let i = 0;
  setInterval(() => {
    text.style.opacity = 0;
    setTimeout(() => {
      text.textContent = news[++i % news.length];
      text.style.opacity = 1;
    }, 500);
  }, 10000);
}

window.onload = () => {
  handleRouting();
  initQuotes();
  initAnnouncements();

  // Header scroll effect
  const header = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
};
window.onpopstate = handleRouting;

function goBackHome() {
  window.history.pushState({}, '', '/');
  handleRouting();
}
