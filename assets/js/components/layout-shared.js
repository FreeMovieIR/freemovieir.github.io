(function () {
  const headerTarget = document.getElementById('shared-header');
  const footerTarget = document.getElementById('shared-footer');

  // Shared Utils
  window.defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';

  window.proxify = function (url) {
    return `https://odd-disk-9903.armin-apple816467.workers.dev/?url=${encodeURIComponent(url)}`;
  };

  // Shared Toast Notification
  window.showToast = function (message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed top-10 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full font-bold shadow-2xl transition-all translate-y-[-100px] glass-card-premium text-white border border-amber-500/30`;
    toast.innerHTML = `<div class="flex items-center gap-3">
    <i class="fas ${type === 'success' ? 'fa-check text-amber-500' : 'fa-info-circle text-blue-500'}"></i>
    <span class="text-sm tracking-tighter">${message}</span>
  </div>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.style.transform = 'translate(-50%, 0)', 100);
    setTimeout(() => {
      toast.style.transform = 'translate(-50%, -100px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // Shared Card Generator
  window.createMovieCard = function (item, poster, type) {
    const title = item.title || item.name || 'نامشخص';
    const overview = item.overview ? `${item.overview.slice(0, 80)}...` : 'بدون توضیحات';
    const score = item.vote_average ? item.vote_average.toFixed(1) : '—';
    const paramText = type === 'movie' ? `m=${item.id}` : `s=${item.id}`;
    const routeLabel = type === 'movie' ? 'فیلم' : 'سریال';

    return `
    <div class="movie-card group relative overflow-hidden rounded-2xl glass-card transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl hover:shadow-amber-500/20 cursor-pointer" 
         onclick="window.location.href='/?${paramText}'"
         data-id="${item.id}"
         data-type="${type}">
      <div class="aspect-[2/3] relative overflow-hidden">
        <img src="${poster}" alt="${title}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" onerror="this.src=window.defaultPoster">
        <div class="movie-card-overlay absolute inset-0 flex flex-col justify-end p-5">
          <div class="movie-card-info">
            <div class="flex items-center gap-2 mb-2">
              <span class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                <i class="fas fa-star text-[8px]"></i> ${score}
              </span>
              <span class="text-white/40 text-[10px] font-bold uppercase tracking-widest">${routeLabel}</span>
            </div>
            <h3 class="text-lg font-black text-white mb-2 leading-tight line-clamp-2 drop-shadow-lg">${item.title || item.name}</h3>
            <p class="text-xs text-gray-300 mb-4 line-clamp-2 opacity-80">${overview}</p>
            <button class="w-full bg-white/10 hover:bg-amber-500 hover:text-black hover:scale-105 backdrop-blur-md text-white border border-white/10 text-xs font-black py-2.5 rounded-xl transition-all duration-300">
              مشاهده جزئیات
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  };

  // Centralized Poster Resolver with Multi-Provider Fallback
  window.resolvePoster = async function (itemId, type, tmdbPosterPath = null) {
    // 1. Priority: Local Cache (Fastest)
    const cacheKey = `poster_${type}_${itemId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    // 2. TMDB Provided Path
    if (tmdbPosterPath) {
      // Use w342 for better performance on cards, w500 is only needed for detail views
      const size = type === 'hero' ? 'w1280' : (type === 'detail' ? 'w500' : 'w342');
      const url = `https://image.tmdb.org/t/p/${size}${tmdbPosterPath}`;
      localStorage.setItem(cacheKey, url);
      return url;
    }

    // 3. Provider: TVMaze (Free/No Key - Great for TV Shows)
    if (type === 'tv' || type === 'series') {
      try {
        const tvmazeRes = await fetch(`https://api.tvmaze.com/lookup/shows?thetvdb=${itemId}`).catch(() =>
          fetch(`https://api.tvmaze.com/lookup/shows?imdb=${itemId}`)
        );
        if (tvmazeRes.ok) {
          const tvmazeData = await tvmazeRes.json();
          if (tvmazeData.image && tvmazeData.image.medium) {
            localStorage.setItem(cacheKey, tvmazeData.image.medium);
            return tvmazeData.image.medium;
          }
        }
      } catch (e) { /* silent fail to next provider */ }
    }

    // 4. Provider: OMDB (Fallback using Key Switcher)
    if (window.apiKeySwitcher && typeof window.apiKeySwitcher.fetchWithKeySwitch === 'function') {
      try {
        // We need IMDb ID for OMDB. If not provided, we fetch it first.
        // For simplicity in this common function, we expect the caller to pass it or we fetch it here.
        // Let's check if we have a way to get IMDB ID. 
        // We'll fetch external_ids from TMDB as a last resort bridge.
        const tmdbKey = localStorage.getItem('userTmdbToken') || '1dc4cbf81f0accf4fa108820d551dafc';
        const extUrl = window.proxify(`https://api.themoviedb.org/3/${type === 'series' ? 'tv' : type}/${itemId}/external_ids?api_key=${tmdbKey}`);
        const extRes = await fetch(extUrl);
        if (extRes.ok) {
          const extData = await extRes.json();
          const imdbId = extData.imdb_id;
          if (imdbId) {
            const omdbData = await window.apiKeySwitcher.fetchWithKeySwitch(
              (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
            );
            if (omdbData.Poster && omdbData.Poster !== 'N/A') {
              localStorage.setItem(cacheKey, omdbData.Poster);
              return omdbData.Poster;
            }
          }
        }
      } catch (e) { /* silent fail */ }
    }

    return window.defaultPoster;
  };

  const headerHtml = `
    <header class="sticky top-0 z-50 glass-nav transition-all duration-500">
      <div class="container mx-auto flex flex-col md:flex-row justify-between items-center px-6 py-4 gap-4 md:gap-0">
        <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-start">
          <a href="/" class="flex items-center gap-3 group">
            <div class="relative">
                <div class="absolute inset-0 bg-amber-500/20 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <img src="/assets/images/logo.png" alt="لوگوی فیری مووی" class="h-10 relative transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
            </div>
            <span class="hidden md:block text-2xl font-black bg-gradient-to-l from-amber-500 via-yellow-200 to-amber-500 bg-[length:200%_auto] animate-textShimmer bg-clip-text text-transparent tracking-tighter">فیری مووی</span>
          </a>

          <!-- Search Bar in Header -->
          <div class="search-input-wrapper hidden lg:block mr-6">
            <input type="text" id="header-search-input" placeholder="جستجو در فیری مووی..." dir="rtl">
            <i class="fas fa-search"></i>
          </div>
        </div>

        <nav class="flex items-center gap-3 md:gap-4 justify-center">
          <a href="/" class="group flex items-center justify-center w-11 h-11 rounded-xl glass-card hover:bg-white/10 transition-all duration-300" aria-label="خانه">
            <i class="fas fa-home text-gray-400 group-hover:text-amber-500 group-hover:scale-110 transition-all duration-300"></i>
          </a>
          <a href="/pages/finder/index.html" class="group flex items-center justify-center w-11 h-11 rounded-xl glass-card hover:bg-white/10 transition-all duration-300 relative" aria-label="جستجوی هوشمند">
            <i class="fas fa-magic text-gray-400 group-hover:text-amber-400 group-hover:scale-110 transition-all duration-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]"></i>
            <span class="absolute -bottom-10 right-0 glass-card text-[10px] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none scale-90 group-hover:scale-100 origin-top-right">جستجوی هوشمند</span>
          </a>
          <a href="/pages/watchlist/" class="group flex items-center justify-center w-11 h-11 rounded-xl glass-card hover:bg-white/10 transition-all duration-300" aria-label="واچ‌لیست">
            <i class="fas fa-bookmark text-gray-400 group-hover:text-amber-500 group-hover:scale-110 transition-all duration-300"></i>
          </a>
          <a href="/pages/search/" class="group flex items-center justify-center w-11 h-11 rounded-xl glass-card hover:bg-white/10 transition-all duration-300" aria-label="جستجو">
            <i class="fas fa-search text-gray-400 group-hover:text-amber-500 group-hover:scale-110 transition-all duration-300"></i>
          </a>
          <a href="/pages/settings/" class="group flex items-center justify-center w-11 h-11 rounded-xl glass-card hover:bg-white/10 transition-all duration-300" aria-label="تنظیمات">
            <i class="fas fa-cog text-gray-400 group-hover:text-amber-500 group-hover:scale-110 transition-all duration-300"></i>
          </a>
        </nav>
      </div>
    </header>
  `;

  const footerHtml = `
    <footer class="bg-base-950 pt-20 pb-10 border-t border-white/5 relative overflow-hidden">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>
        <div class="container mx-auto px-6 relative z-10 text-center md:text-right">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-12">
                <div class="md:col-span-2 space-y-6 flex flex-col items-center md:items-start">
                    <a href="/" class="flex items-center gap-3 group">
                        <img src="/assets/images/logo.png" alt="لوگوی فیری مووی" class="h-10 transform group-hover:scale-110 transition-transform duration-500">
                        <span class="text-2xl font-black bg-gradient-to-l from-amber-500 to-yellow-200 bg-clip-text text-transparent">فیری مووی</span>
                    </a>
                    <p class="text-gray-400 text-sm leading-8 max-w-md">
                        مرجع رایگان دانلود و تماشای پویانمایی، فیلم و سریال‌های روز دنیا با بهترین کیفیت و ترافیک نیم‌بها. ما تلاش می‌کنیم تا بهترین تجربه تماشای سینما را برای شما فراهم کنیم.
                    </p>
                    <div class="flex items-center gap-4">
                        <a href="https://twitter.com/freemovie_ir" target="_blank" class="w-12 h-12 rounded-xl glass-card flex items-center justify-center text-gray-400 hover:bg-[#1DA1F2] hover:text-white transition-all duration-300" aria-label="توییتر">
                            <i class="fab fa-twitter text-xl"></i>
                        </a>
                        <a href="https://instagram.com/freemovie_ir" target="_blank" class="w-12 h-12 rounded-xl glass-card flex items-center justify-center text-gray-400 hover:bg-gradient-to-tr hover:from-yellow-400 hover:via-pink-500 hover:to-purple-500 hover:text-white transition-all duration-300" aria-label="اینستاگرام">
                            <i class="fab fa-instagram text-xl"></i>
                        </a>
                    </div>
                </div>

                <div class="space-y-6">
                    <h3 class="text-white font-black text-lg border-r-4 border-amber-500 pr-4 md:border-r-0 md:border-b md:border-white/10 md:pb-2 md:inline-block md:pr-0">دسترسی سریع</h3>
                    <nav class="flex flex-col gap-4">
                        <a href="/pages/search/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm">جستجوی فیلم</a>
                        <a href="/pages/watchlist/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm">واچ‌لیست شما</a>
                        <a href="/pages/about-freemovie/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm">درباره ما</a>
                        <a href="/pages/developer/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm">تیم توسعه</a>
                    </nav>
                </div>

                <div class="space-y-6">
                    <h3 class="text-white font-black text-lg border-r-4 border-amber-500 pr-4 md:border-r-0 md:border-b md:border-white/10 md:pb-2 md:inline-block md:pr-0">قوانین و مستندات</h3>
                    <nav class="flex flex-col gap-4">
                        <a href="/pages/disclaimer/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm">سلب مسئولیت</a>
                        <a href="/pages/disclaimer/index-en.html" class="text-gray-400 hover:text-amber-500 transition-colors text-sm">DMCA Policy</a>
                        <a href="/pages/changelog/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm">تغییرات اخیر</a>
                    </nav>
                </div>
            </div>

            <div class="mt-16 pt-8 border-t border-white/5 text-center space-y-4">
            <p class="text-gray-500 text-xs">
              ساخته شده با <span class="animate-pulse text-white inline-block px-1"><i class="fas fa-heart"></i></span> برای عاشقان سینما | تمام حقوق محفوظ است © ۲۰۲۴
            </p>
            <p class="text-gray-600 text-[10px]">
              استفاده از فونت <a href="https://rastikerdar.github.io/vazirmatn/" class="hover:text-amber-500 transition-colors" target="_blank" rel="noopener">وزیرمتن</a> اثر صابر راستی کردار
            </p>
        </div>
      </div>
    </footer>
  `;

  if (headerTarget) {
    headerTarget.innerHTML = headerHtml;

    // Add search listener
    const headerSearchInput = document.getElementById('header-search-input');
    if (headerSearchInput) {
      headerSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const query = headerSearchInput.value.trim();
          if (query.length >= 3) {
            window.location.href = `/pages/search/index.html?q=${encodeURIComponent(query)}`;
          }
        }
      });
    }
  }

  if (footerTarget) {
    footerTarget.innerHTML = footerHtml;
  }
  // --- Global Performance Helpers ---
  function setupGlobalPreload() {
    document.addEventListener('mouseover', async (e) => {
      const card = e.target.closest('.movie-card');
      if (card && card.dataset.id && card.dataset.type) {
        const id = card.dataset.id;
        const type = card.dataset.type;
        const tmdbKey = localStorage.getItem('userTmdbToken') || '1dc4cbf81f0accf4fa108820d551dafc';

        // Pre-fetch detail API for instant transitions
        const isMovie = type === 'movie' || type === 'hero' || type === 'detail';
        const url = `https://api.themoviedb.org/3/${type === 'series' ? 'tv' : 'movie'}/${id}?api_key=${tmdbKey}&language=fa-IR&append_to_response=credits,videos,external_ids`;

        // Use high priority for hover-initiated fetch
        fetch(url, { priority: 'low' }).catch(() => { });
      }
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGlobalPreload);
  } else {
    setupGlobalPreload();
  }
})();
