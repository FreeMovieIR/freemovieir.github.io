(function () {
  const headerTarget = document.getElementById('shared-header');
  const footerTarget = document.getElementById('shared-footer');

  const t = (key) => window.i18n ? window.i18n.t(key) : key;

  // Shared Utils
  window.defaultPoster = window.CONFIG ? window.CONFIG.ASSETS.DEFAULT_POSTER : 'https://freemovieir.github.io/images/default-freemovie-300.png';

  window.proxify = function (url) {
    if (!window.CONFIG) return url;
    return `https://odd-disk-9903.armin-apple816467.workers.dev/?url=${encodeURIComponent(url)}`;
  };

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

  window.createMovieCard = function (item, poster, type) {
    const titleFa = item.title || item.name || 'نامشخص';
    const titleEn = item.original_title || item.original_name || '';
    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    const displayYear = year ? ` (${year})` : '';
    const displayTitle = titleFa + (titleEn && titleEn !== titleFa ? ` / ${titleEn}` : '') + displayYear;
    const overview = item.overview ? `${item.overview.slice(0, 80)}...` : t('not_found');
    const score = item.vote_average ? item.vote_average.toFixed(1) : '—';
    const paramText = type === 'movie' ? `m=${item.id}` : `s=${item.id}`;

    return `
    <div class="movie-card reveal-on-scroll group relative overflow-hidden rounded-2xl glass-card cursor-pointer" 
         onclick="window.location.href='/?${paramText}'"
         data-id="${item.id}"
         data-type="${type}">
      <div class="aspect-[2/3] relative overflow-hidden">
        <img src="${poster}" alt="${displayTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" onerror="this.src=window.defaultPoster">
        <div class="movie-card-overlay absolute inset-0 flex flex-col justify-end p-5 text-right">
          <div class="movie-card-info">
            <div class="flex items-center gap-2 mb-2 justify-end">
              <span class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                <i class="fas fa-star text-[8px]"></i> ${score}
              </span>
            </div>
            <h3 class="text-sm md:text-base font-black text-white mb-2 leading-tight line-clamp-2 drop-shadow-lg">${displayTitle}</h3>
            <p class="text-[10px] text-gray-300 mb-4 line-clamp-1 opacity-80">${overview}</p>
            <button class="w-full bg-white/10 hover:bg-amber-500 hover:text-black hover:scale-105 backdrop-blur-md text-white border border-white/10 text-[10px] font-black py-2 rounded-xl transition-all duration-300 uppercase">
              ${t('view_details')}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  };

  window.resolvePoster = async function (itemId, type, tmdbPosterPath = null) {
    const cacheKey = `poster_${type}_${itemId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
    if (tmdbPosterPath) {
      const tmdbImageBase = window.CONFIG ? window.CONFIG.API.TMDB_IMAGE : 'https://image.tmdb.org/t/p';
      const size = type === 'hero' ? 'w1280' : (type === 'detail' ? 'w500' : 'w342');
      const url = `${tmdbImageBase}/${size}${tmdbPosterPath}`;
      localStorage.setItem(cacheKey, url);
      return url;
    }
    return window.defaultPoster;
  };

  const headerHtml = `
    <!-- Top Announcement Bar -->
    <div id="announcement-bar" class="bg-gradient-to-r from-amber-600 to-amber-400 py-1.5 px-6 text-center overflow-hidden relative group cursor-pointer h-8 flex items-center justify-center">
      <div class="flex items-center gap-3 animate-marquee whitespace-nowrap">
        <span class="text-[10px] font-black text-black tracking-widest uppercase">${t('announcement')}</span>
        <span class="w-1.5 h-1.5 rounded-full bg-black/20"></span>
        <span class="text-[10px] font-bold text-black opacity-80" id="notification-text">به فیری مووی خوش آمدید! بخش جدید دیالوگ‌های ماندگار اضافه شد.</span>
      </div>
    </div>

    <div class="fixed top-0 left-1/4 w-[600px] h-[200px] bg-amber-500/5 blur-[120px] rounded-full pointer-events-none z-[101]"></div>
    
    <header class="sticky top-0 z-[100] transition-all duration-500 border-b border-white/5 bg-[#07090f]/80 backdrop-blur-3xl" id="site-header">
      <div class="container mx-auto px-6 py-3 flex items-center justify-between">
        <!-- Logo & Branding -->
        <div class="flex items-center gap-12">
          <a href="/" class="flex items-center gap-4 group">
            <div class="relative w-12 h-12 flex items-center justify-center">
                <div class="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                <img src="/assets/images/logo.png" alt="Logo" class="w-9 h-9 object-contain relative transform group-hover:scale-110 transition-all duration-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
            </div>
            <div class="hidden sm:flex flex-col">
              <h1 class="text-2xl font-black bg-gradient-to-l from-amber-500 via-yellow-100 to-amber-500 bg-[length:200%_auto] animate-textShimmer bg-clip-text text-transparent tracking-tighter leading-none py-1">${t('site_title')}</h1>
              <span class="text-[10px] text-gray-500 font-bold tracking-[0.2em] uppercase mt-0.5">${t('site_subtitle')}</span>
            </div>
          </a>

          <!-- Navigation Links (Desktop) -->
          <nav class="hidden lg:flex items-center gap-2">
            <a href="/" class="header-nav-link active">
              <i class="fas fa-home text-sm"></i> <span>${t('home')}</span>
            </a>
            <a href="/pages/finder/" class="header-nav-link">
              <i class="fas fa-filter text-sm"></i> <span>${t('advanced_search')}</span>
            </a>
            <a href="/pages/watchlist/" class="header-nav-link">
              <i class="fas fa-bookmark text-sm"></i> <span>${t('watchlist')}</span>
            </a>
          </nav>
        </div>

        <!-- System Actions & Search -->
        <div class="flex items-center gap-4">
          <div class="hidden xl:flex items-center relative group">
            <i class="fas fa-search absolute right-4 text-gray-500 group-focus-within:text-amber-500 transition-colors"></i>
            <input type="text" id="header-search-input" 
                   class="bg-white/5 border border-white/10 text-white text-xs pr-11 pl-5 py-2.5 rounded-2xl w-56 focus:w-80 outline-none transition-all duration-500 placeholder:text-gray-600"
                   placeholder="${t('search_placeholder')}">
          </div>

          <div class="flex items-center gap-2">
            <button id="open-settings-modal" class="w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-gray-400 hover:text-amber-500 hover:bg-white/10 transition-all">
              <i class="fas fa-sliders-h"></i>
            </button>
            <!-- Language Quick Switcher -->
            <button onclick="window.i18n.setLanguage(window.i18n.current === 'fa' ? 'en' : 'fa')" 
                    class="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-black text-xs hover:bg-amber-500 hover:text-black transition-all">
              ${window.i18n.current === 'fa' ? 'EN' : 'FA'}
            </button>
            <!-- Mobile Menu Toggle -->
            <button id="mobile-menu-toggle" class="lg:hidden w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-gray-400">
              <i class="fas fa-bars"></i>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Mobile Navigation Drawer -->
      <div id="mobile-menu" class="lg:hidden fixed inset-x-0 top-[116px] bg-[#07090f]/95 backdrop-blur-2xl border-b border-white/5 py-8 px-6 transform -translate-y-full opacity-0 pointer-events-none transition-all duration-500 z-50">
        <div class="flex flex-col gap-4">
          <a href="/" class="mobile-nav-link"><i class="fas fa-home"></i> ${t('home')}</a>
          <a href="/pages/finder/" class="mobile-nav-link"><i class="fas fa-filter"></i> ${t('advanced_search')}</a>
          <a href="/pages/watchlist/" class="mobile-nav-link"><i class="fas fa-bookmark"></i> ${t('watchlist')}</a>
        </div>
      </div>
    </header>

    <style>
      .header-nav-link { @apply flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 transition-all hover:text-white hover:bg-white/5; }
      .header-nav-link.active { @apply text-amber-500 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.1)]; }
      .mobile-nav-link { @apply flex items-center gap-4 p-4 rounded-2xl bg-white/5 text-white font-bold text-lg hover:bg-amber-500 hover:text-black transition-all; }
      @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
      .animate-marquee { display: inline-block; padding-left: 100%; animation: marquee 30s linear infinite; }
      [dir="rtl"] .animate-marquee { padding-left: 0; padding-right: 100%; animation: marquee-rtl 30s linear infinite; }
      @keyframes marquee-rtl { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    </style>
  `;

  const footerHtml = `
    <!-- Top Quote Section -->
    <section class="container mx-auto px-6 py-16 border-t border-white/5" id="quote-section">
      <div class="glass-card-premium p-12 rounded-[2.5rem] relative overflow-hidden group">
        <div class="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] pointer-events-none"></div>
        <div class="relative z-10 flex flex-col items-center text-center space-y-8">
          <div class="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
            <i class="fas fa-quote-right text-3xl text-amber-500"></i>
          </div>
          <p id="quote-text" class="text-2xl md:text-3xl font-black text-white leading-relaxed max-w-4xl italic drop-shadow-2xl">...</p>
          <div class="flex flex-col items-center">
            <span id="quote-author" class="text-amber-500 font-bold tracking-widest uppercase text-sm mb-2"></span>
            <span id="quote-movie" class="text-gray-500 text-xs font-black uppercase tracking-[0.3em]"></span>
          </div>
        </div>
      </div>
    </section>

    <footer class="bg-[#07090f] pt-24 pb-12 border-t border-white/5 relative overflow-hidden">
        <div class="container mx-auto px-6 relative z-10">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16">
                <div class="lg:col-span-2 space-y-8">
                    <h2 class="text-3xl font-black text-white">${t('site_title')}</h2>
                    <p class="text-gray-400 leading-relaxed max-w-md">${t('footer_desc')}</p>
                </div>
                <div>
                    <h3 class="text-white font-black mb-6 uppercase tracking-widest text-sm text-gray-500">${t('home')}</h3>
                    <div class="flex flex-col gap-4">
                        <a href="/pages/search/" class="text-gray-400 hover:text-amber-500 transition-colors">${t('advanced_search')}</a>
                        <a href="/pages/watchlist/" class="text-gray-400 hover:text-amber-500 transition-colors">${t('watchlist')}</a>
                    </div>
                </div>
                <div>
                    <h3 class="text-white font-black mb-6 uppercase tracking-widest text-sm text-gray-500">${t('language')}</h3>
                    <div class="flex flex-col gap-2">
                        <button onclick="window.i18n.setLanguage('fa')" class="flex items-center justify-between text-gray-400 hover:text-amber-500 transition-colors w-full"><span>Persian</span> <span>فارسی</span></button>
                        <button onclick="window.i18n.setLanguage('en')" class="flex items-center justify-between text-gray-400 hover:text-amber-500 transition-colors w-full"><span>English</span> <span>انگلیسی</span></button>
                    </div>
                </div>
            </div>
            <div class="mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 text-xs font-black text-gray-600 uppercase tracking-[0.2em]">
                <span>${t('copyright')}</span>
                <span>${t('design_credit')}</span>
            </div>
        </div>
    </footer>
  `;

  if (headerTarget) headerTarget.innerHTML = headerHtml;
  if (footerTarget) footerTarget.innerHTML = footerHtml;

  // Search logic
  const handleSearch = (id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim().length >= 2) {
          window.location.href = `/pages/search/index.html?q=${encodeURIComponent(input.value.trim())}`;
        }
      });
    }
  };
  handleSearch('header-search-input');

  // Mobile Menu Logic
  const toggle = document.getElementById('mobile-menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    toggle.onclick = () => {
      const isOpen = !menu.classList.contains('opacity-0');
      if (isOpen) {
        menu.classList.add('opacity-0', '-translate-y-full', 'pointer-events-none');
        toggle.innerHTML = '<i class="fas fa-bars"></i>';
      } else {
        menu.classList.remove('opacity-0', '-translate-y-full', 'pointer-events-none');
        toggle.innerHTML = '<i class="fas fa-times"></i>';
      }
    };
  }

  // Modal interaction
  const modal = document.getElementById('settings-modal');
  const modalContent = document.getElementById('settings-modal-content');
  const langSelect = document.getElementById('modal-lang-select');

  document.getElementById('open-settings-modal').onclick = () => {
    document.getElementById('modal-tmdb-token').value = localStorage.getItem('userTmdbToken') || '';
    document.getElementById('modal-omdb-token').value = localStorage.getItem('userOmdbToken') || '';
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modalContent.classList.remove('scale-90');
  };

  document.getElementById('close-settings-modal').onclick = () => {
    modal.classList.add('opacity-0', 'pointer-events-none');
    modalContent.classList.add('scale-90');
  };

  document.getElementById('save-settings-btn').onclick = () => {
    const lang = langSelect.value;
    const tmdb = document.getElementById('modal-tmdb-token').value.trim();
    const omdb = document.getElementById('modal-omdb-token').value.trim();
    if (tmdb) localStorage.setItem('userTmdbToken', tmdb); else localStorage.removeItem('userTmdbToken');
    if (omdb) localStorage.setItem('userOmdbToken', omdb); else localStorage.removeItem('userOmdbToken');
    window.i18n.setLanguage(lang);
  };

  document.getElementById('clear-settings-btn').onclick = () => {
    localStorage.clear();
    location.reload();
  };

  // Scroll visibility
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
})();
