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
}

async function fetchAndDisplayContent() {
  const movieContainer = document.getElementById('new-movies');
  const tvContainer = document.getElementById('trending-tv');
  if (!movieContainer || !tvContainer) return;

  try {
    const [movieRes, tvRes] = await Promise.all([
      fetch(proxify(apiUrls.now_playing)),
      fetch(proxify(apiUrls.tv_trending))
    ]);
    const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);

    const movies = movieData.results || [];
    const series = tvData.results || [];

    sliderItems = [...movies.slice(0, 3), ...series.slice(0, 2)];
    renderSlider();

    const seenIds = new Set();
    const movieHtml = await Promise.all(movies.slice(3).map(async (item) => {
      const poster = await window.resolvePoster(item.id, 'movie', item.poster_path);
      return window.createMovieCard(item, poster, 'movie');
    }));
    movieContainer.innerHTML = movieHtml.join('');

    const tvHtml = await Promise.all(series.slice(2).map(async (item) => {
      const poster = await window.resolvePoster(item.id, 'tv', item.poster_path);
      return window.createMovieCard(item, poster, 'tv');
    }));
    tvContainer.innerHTML = tvHtml.join('');

  } catch (error) {
    console.error('Fetch error:', error);
  }
}

// Routing logic
function handleRouting() {
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
  const url = `${tmdbBase}/${isMovie ? 'movie' : 'tv'}/${id}?api_key=${apiKey}&language=${apiLang}&append_to_response=credits,videos,external_ids`;

  try {
    const res = await fetch(proxify(url));
    const data = await res.json();
    const poster = await window.resolvePoster(id, 'detail', data.poster_path);
    renderDetails(data, poster, type);
  } catch (e) { console.error(e); }
}

function renderDetails(data, poster, type) {
  const title = data.title || data.name;
  document.getElementById('details-title').textContent = title;
  document.getElementById('details-poster').src = poster;
  document.getElementById('details-overview').textContent = data.overview || t('not_found');
  // ... Additional detail fields could be added here using t()
}

window.onload = handleRouting;
window.onpopstate = handleRouting;

function goBackHome() {
  window.history.pushState({}, '', '/');
  handleRouting();
}
