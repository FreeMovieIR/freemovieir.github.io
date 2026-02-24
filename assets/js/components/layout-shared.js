(function () {
  const headerTarget = document.getElementById('shared-header');
  const footerTarget = document.getElementById('shared-footer');

  // Shared Utils
  window.defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';

  window.proxify = function (url) {
    if (!window.CONFIG) return url;
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
    <div class="movie-card reveal-on-scroll group relative overflow-hidden rounded-2xl glass-card cursor-pointer" 
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
            <p class="text-xs text-gray-300 mb-4 line-clamp-1 opacity-80">${overview}</p>
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
      const tmdbImageBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
      const size = type === 'hero' ? 'w1280' : (type === 'detail' ? 'w500' : 'w342');
      const url = `${tmdbImageBase}/${size}${tmdbPosterPath}`;
      localStorage.setItem(cacheKey, url);
      return url;
    }

    // 3. Provider: TVMaze
    if (type === 'tv' || type === 'series') {
      try {
        const tvmazeBase = window.CONFIG ? window.CONFIG.API.TVMAZE : 'https://api.tvmaze.com';
        const tvmazeRes = await fetch(`${tvmazeBase}/lookup/shows?thetvdb=${itemId}`).catch(() =>
          fetch(`${tvmazeBase}/lookup/shows?imdb=${itemId}`)
        );
        if (tvmazeRes.ok) {
          const tvmazeData = await tvmazeRes.json();
          if (tvmazeData.image && tvmazeData.image.medium) {
            localStorage.setItem(cacheKey, tvmazeData.image.medium);
            return tvmazeData.image.medium;
          }
        }
      } catch (e) { /* silent fail */ }
    }

    // 4. Provider: OMDB
    if (window.apiKeySwitcher && typeof window.apiKeySwitcher.fetchWithKeySwitch === 'function') {
      try {
        const tmdbKey = localStorage.getItem('userTmdbToken') || (window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc');
        const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
        const extUrl = window.proxify(`${tmdbBase}/${type === 'series' ? 'tv' : type}/${itemId}/external_ids?api_key=${tmdbKey}`);
        const extRes = await fetch(extUrl);
        if (extRes.ok) {
          const extData = await extRes.json();
          const imdbId = extData.imdb_id;
          if (imdbId) {
            const omdbBase = window.CONFIG ? window.CONFIG.API.OMDB : 'https://www.omdbapi.com';
            const omdbData = await window.apiKeySwitcher.fetchWithKeySwitch(
              (key) => `${omdbBase}/?i=${imdbId}&apikey=${key}`
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
    <header class="sticky top-0 z-[100] glass-nav transition-all duration-500 border-b border-white/5">
      <div class="container mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <!-- Logo Section -->
        <div class="flex items-center gap-8">
          <a href="/" class="flex items-center gap-3 group">
            <div class="relative w-12 h-12 flex items-center justify-center">
                <div class="absolute inset-0 bg-amber-500/20 blur-xl rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <img src="/assets/images/logo.png" alt="FreeMovieIR Logo" class="w-full h-full object-contain relative transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            </div>
            <div class="flex flex-col">
              <span class="text-2xl font-black bg-gradient-to-l from-amber-500 via-yellow-200 to-amber-500 bg-[length:200%_auto] animate-textShimmer bg-clip-text text-transparent tracking-tighter leading-none">فیری مووی</span>
              <span class="text-[10px] text-gray-500 font-bold tracking-[0.2em] uppercase mt-1">FreeMovieIR</span>
            </div>
          </a>
          
          <!-- Desktop Search -->
          <div class="hidden lg:flex items-center relative group">
            <input type="text" id="header-search-input" 
                   class="bg-white/5 border border-white/10 text-white text-sm px-12 py-2.5 rounded-2xl w-64 focus:w-80 focus:bg-white/10 focus:border-amber-500/50 outline-none transition-all duration-500 placeholder:text-gray-600"
                   placeholder="جستجو در بین هزاران فیلم...">
            <i class="fas fa-search absolute right-4 text-gray-600 group-focus-within:text-amber-500 transition-colors"></i>
            <div class="absolute inset-0 rounded-2xl bg-amber-500/5 blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none"></div>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="flex items-center gap-2 md:gap-3">
          <a href="/" class="nav-btn group" title="خانه">
            <i class="fas fa-home"></i>
            <span class="nav-tooltip">خانه</span>
          </a>
          <a href="/pages/finder/" class="nav-btn group" title="ژانرها">
            <i class="fas fa-th-large"></i>
            <span class="nav-tooltip">جستجوی پیشرفته</span>
          </a>
          <a href="/pages/watchlist/" class="nav-btn group" title="واچ‌لیست">
            <i class="fas fa-bookmark"></i>
            <span class="nav-tooltip">واچ‌لیست</span>
          </a>
          <button id="open-settings-modal" class="nav-btn group" title="تنظیمات">
            <i class="fas fa-cog"></i>
            <span class="nav-tooltip">تنظیمات</span>
          </button>
          
          <div class="h-8 w-px bg-white/10 mx-2 hidden md:block"></div>
          
          <a href="/pages/isegaro/" class="hidden md:flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl font-black text-sm transition-all duration-300 transform hover:scale-105 shadow-lg shadow-amber-500/20">
            <i class="fas fa-language text-xs"></i>
            مترجم زیرنویس
          </a>
        </nav>
      </div>

      <!-- Mobile Search (Visible on small screens) -->
      <div class="lg:hidden container mx-auto px-6 pb-3 overflow-hidden transition-all duration-300" id="mobile-search-bar">
        <div class="relative flex items-center">
          <input type="text" id="header-search-input-mobile" 
                 class="w-full bg-white/5 border border-white/10 text-white text-sm px-10 py-2.5 rounded-xl focus:bg-white/10 focus:border-amber-500/50 outline-none transition-all"
                 placeholder="فیلم، سریال یا بازیگر...">
          <i class="fas fa-search absolute right-3.5 text-gray-500"></i>
        </div>
      </div>
    </header>

    <!-- Settings Modal Structure -->
    <div id="settings-modal" class="fixed inset-0 z-[200] flex items-center justify-center opacity-0 pointer-events-none transition-all duration-500 backdrop-blur-md bg-black/60">
      <div class="glass-card-premium w-full max-w-lg mx-4 rounded-[2.5rem] overflow-hidden border border-white/10 transform scale-90 transition-all duration-500 shadow-2xl shadow-black/50" id="settings-modal-content">
        <div class="p-8">
          <div class="flex justify-between items-center mb-10">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-lg shadow-amber-500/5">
                <i class="fas fa-cog text-xl"></i>
              </div>
              <div>
                <h2 class="text-2xl font-black text-white tracking-tighter">تنظیمات کاربری</h2>
                <p class="text-gray-500 text-xs font-bold mt-1">شخصی‌سازی تجربه فیری مووی</p>
              </div>
            </div>
            <button id="close-settings-modal" class="w-10 h-10 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all flex items-center justify-center border border-transparent hover:border-white/10">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="space-y-8">
            <div class="space-y-4">
              <label class="block text-sm font-black text-gray-400">توکن شخصی TMDB (اختیاری)</label>
              <div class="relative group">
                <input type="password" id="modal-tmdb-token" 
                       class="w-full bg-black/30 border border-white/10 text-white px-5 py-3 rounded-2xl focus:border-amber-500/50 outline-none transition-all text-sm font-mono placeholder:text-gray-700" 
                       placeholder="برای افزایش سرعت جستجو...">
                <i class="fas fa-key absolute left-5 top-1/2 -translate-y-1/2 text-gray-700"></i>
              </div>
            </div>

            <div class="space-y-4">
              <label class="block text-sm font-black text-gray-400">توکن OMDB (برای پوسترها)</label>
              <div class="relative group">
                <input type="password" id="modal-omdb-token" 
                       class="w-full bg-black/30 border border-white/10 text-white px-5 py-3 rounded-2xl focus:border-amber-500/50 outline-none transition-all text-sm font-mono placeholder:text-gray-700"
                       placeholder="توکن هشت رقمی...">
                <i class="fas fa-image absolute left-5 top-1/2 -translate-y-1/2 text-gray-700"></i>
              </div>
            </div>

            <div class="flex flex-col gap-4 mt-4">
              <button id="save-settings-btn" class="w-full bg-amber-500 hover:bg-amber-400 text-black py-4 rounded-2xl font-black transition-all hover:scale-[1.02] shadow-xl shadow-amber-500/20 active:scale-95">
                ذخیره تغییرات
              </button>
              <button id="clear-settings-btn" class="w-full bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-500 py-3 rounded-2xl font-bold transition-all text-sm border border-white/5 hover:border-red-500/20">
                پاکسازی حافظه
              </button>
            </div>
          </div>
        </div>
        <div class="bg-amber-500/5 p-4 text-center border-t border-white/5">
          <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest">تمامی تنظیمات در مرورگر شما ذخیره می‌شوند</p>
        </div>
      </div>
    </div>

    <style>
      .nav-btn {
        @apply w-10 h-10 md:w-11 md:h-11 rounded-2xl glass-card flex items-center justify-center text-gray-400 hover:bg-white/10 transition-all duration-300 relative border border-white/5;
      }
      .nav-btn i {
        @apply transition-all duration-300 group-hover:scale-110 group-hover:text-amber-500;
      }
      .nav-tooltip {
        @apply absolute -bottom-10 right-0 glass-card-premium text-[10px] text-white px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap pointer-events-none scale-90 group-hover:scale-100 origin-top-right border border-white/10 z-[110] shadow-xl font-bold;
      }
      @keyframes shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      .animate-textShimmer {
        animation: shimmer 5s infinite linear;
      }
    </style>
  `;

  const footerHtml = `
    <footer class="bg-[#07090f] pt-24 pb-12 border-t border-white/5 relative overflow-hidden">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
        
        <!-- Glow Effect -->
        <div class="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-amber-500/5 blur-[120px] rounded-full pointer-events-none"></div>
        
        <div class="container mx-auto px-6 relative z-10">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16 text-right">
                <!-- Branding -->
                <div class="space-y-8 col-span-1 lg:col-span-2">
                    <a href="/" class="flex items-center gap-4 group">
                        <div class="w-12 h-12 glass-card rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-6">
                          <img src="/assets/images/logo.png" alt="لوگوی فیری مووی" class="h-8">
                        </div>
                        <span class="text-3xl font-black text-white tracking-tighter">فیری <span class="text-amber-500">مووی</span></span>
                    </a>
                    <p class="text-gray-400 text-base leading-9 max-w-xl font-medium">
                        پلتفرم فیری مووی به عنوان یک آرشیو جامع و دیجیتال، با هدف ارتقای دسترسی به آثار برتر سینمای جهان برای پارسی‌زبانان فعالیت می‌کند. ما همواره در تلاشیم تا تجربه‌ای حرفه‌ای و مدرن را به صورت رایگان ارائه دهیم.
                    </p>
                    <div class="flex items-center gap-4">
                        <a href="https://twitter.com/freemovie_ir" target="_blank" class="footer-social-btn hover:bg-[#1DA1F2]" aria-label="توییتر">
                            <i class="fab fa-twitter"></i>
                        </a>
                        <a href="https://instagram.com/freemovie_ir" target="_blank" class="footer-social-btn hover:bg-gradient-to-tr hover:from-[#f9ce34] hover:via-[#ee2a7b] hover:to-[#6228d7]" aria-label="اینستاگرام">
                            <i class="fab fa-instagram"></i>
                        </a>
                        <a href="https://www.linkedin.com/company/freemoviez/" target="_blank" class="footer-social-btn hover:bg-[#0077b5]" aria-label="لینکدین">
                            <i class="fab fa-linkedin-in"></i>
                        </a>
                    </div>
                </div>

                <!-- Navigation -->
                <div class="space-y-8">
                    <h3 class="text-white font-black text-xl flex items-center gap-3">
                      <span class="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                      کاوش در سایت
                    </h3>
                    <nav class="flex flex-col gap-5">
                        <a href="/pages/search/" class="footer-link">جستجوی پیشرفته</a>
                        <a href="/pages/finder/" class="footer-link">فیلترهای هوشمند</a>
                        <a href="/pages/watchlist/" class="footer-link">آرشیو شخصی شما</a>
                        <a href="/pages/isegaro/" class="footer-link">مترجم زیرنویس (iSegaro)</a>
                    </nav>
                </div>

                <!-- Legal/Dev -->
                <div class="space-y-8">
                    <h3 class="text-white font-black text-xl flex items-center gap-3">
                      <span class="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                      اطلاعات و توسعه
                    </h3>
                    <nav class="flex flex-col gap-5">
                        <a href="/pages/developer/" class="footer-link text-blue-400/80">تیم توسعه‌دهندگان</a>
                        <a href="/pages/changelog/" class="footer-link">آخرین تغییرات (v2.1)</a>
                        <a href="/pages/disclaimer/" class="footer-link">قوانین و DMCA</a>
                        <a href="/pages/disclaimer/index-en.html" class="footer-link">English Disclaimer</a>
                    </nav>
                </div>
            </div>

            <!-- Bottom Copyright -->
            <div class="mt-24 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
              <div class="flex items-center gap-4 text-gray-500 text-sm font-bold">
                <span>© ۲۰۲۴ حقوق مادی و معنوی برای فیری مووی محفوظ است</span>
              </div>
              <div class="flex items-center gap-3 text-gray-600 text-[10px] font-bold uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/5">
                ساخته شده با <i class="fas fa-heart text-red-500/50 animate-pulse"></i> توسط <span class="text-white">تیم توسعه فیری مووی</span>
              </div>
            </div>
        </div>
    </footer>

    <style>
      .footer-social-btn {
        @apply w-12 h-12 rounded-2xl glass-card flex items-center justify-center text-gray-400 hover:text-white transition-all duration-500 hover:scale-110 border border-white/5;
      }
      .footer-social-btn i { @apply text-xl; }
      .footer-link {
        @apply text-gray-400 hover:text-amber-500 transition-colors text-base font-medium flex items-center gap-2;
      }
      .footer-link::before {
        content: '';
        @apply w-0 h-0.5 bg-amber-500 transition-all duration-300;
      }
      .footer-link:hover::before { @apply w-4; }
    </style>
  `;


  if (headerTarget) {
    headerTarget.innerHTML = headerHtml;
    localStorage.setItem('homeCache_header', headerHtml);

    // Desktop & Mobile Search Handlers
    const setupSearch = (id) => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            const query = input.value.trim();
            if (query.length >= 3) {
              window.location.href = `/pages/search/index.html?q=${encodeURIComponent(query)}`;
            }
          }
        });
      }
    };
    setupSearch('header-search-input');
    setupSearch('header-search-input-mobile');
  }

  if (footerTarget) {
    footerTarget.innerHTML = footerHtml;
  }
  // --- Global Interactions & Performance ---
  function setupGlobalInteractions() {
    // 1. Reveal on Scroll (Intersection Observer)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

    const observeNewElements = () => {
      document.querySelectorAll('.reveal-on-scroll:not(.observed)').forEach(el => {
        observer.observe(el);
        el.classList.add('observed');
      });
    };

    observeNewElements();
    const dynamicObserver = new MutationObserver(observeNewElements);
    dynamicObserver.observe(document.body, { childList: true, subtree: true });

    // 2. Settings Modal Logic
    const modal = document.getElementById('settings-modal');
    const modalContent = document.getElementById('settings-modal-content');
    const openBtn = document.getElementById('open-settings-modal');
    const closeBtn = document.getElementById('close-settings-modal');
    const saveBtn = document.getElementById('save-settings-btn');
    const clearBtn = document.getElementById('clear-settings-btn');

    const tmdbInput = document.getElementById('modal-tmdb-token');
    const omdbInput = document.getElementById('modal-omdb-token');

    if (modal && openBtn) {
      openBtn.onclick = () => {
        // Load current values
        tmdbInput.value = localStorage.getItem('userTmdbToken') || '';
        omdbInput.value = localStorage.getItem('userOmdbToken') || '';

        modal.classList.remove('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-90');
        document.body.style.overflow = 'hidden';
      };

      const closeModal = () => {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modalContent.classList.add('scale-90');
        document.body.style.overflow = '';
      };

      closeBtn.onclick = closeModal;
      modal.onclick = (e) => { if (e.target === modal) closeModal(); };

      saveBtn.onclick = () => {
        const tmdb = tmdbInput.value.trim();
        const omdb = omdbInput.value.trim();

        if (tmdb) localStorage.setItem('userTmdbToken', tmdb);
        else localStorage.removeItem('userTmdbToken');

        if (omdb) localStorage.setItem('userOmdbToken', omdb);
        else localStorage.removeItem('userOmdbToken');

        window.showToast('تنظیمات با موفقیت ذخیره شد!', 'success');
        closeModal();
        setTimeout(() => location.reload(), 500); // Reload to apply new keys
      };

      clearBtn.onclick = () => {
        localStorage.removeItem('userTmdbToken');
        localStorage.removeItem('userOmdbToken');
        tmdbInput.value = '';
        omdbInput.value = '';
        window.showToast('تمامی تنظیمات پاکسازی شد', 'info');
      };
    }

    // 3. Mouse Glow Effect
    const glow = document.getElementById('mouse-glow') || document.createElement('div');
    if (!glow.id) {
      glow.id = 'mouse-glow';
      document.body.prepend(glow);
    }

    window.addEventListener('mousemove', (e) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    }, { passive: true });

    // 4. Mobile Header Scroll Logic
    let lastScroll = 0;
    const header = document.querySelector('header');
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;
      if (currentScroll > 100) {
        header.classList.add('py-1', 'bg-black/90');
        header.classList.remove('py-3', 'bg-black/80');
      } else {
        header.classList.remove('py-1', 'bg-black/90');
        header.classList.add('py-3', 'bg-black/80');
      }
      lastScroll = currentScroll;
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGlobalInteractions);
  } else {
    setupGlobalInteractions();
  }
})();

