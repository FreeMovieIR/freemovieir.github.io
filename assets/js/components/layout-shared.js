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
    <div class="fixed top-0 left-1/4 w-[600px] h-[200px] bg-amber-500/5 blur-[120px] rounded-full pointer-events-none z-[101]"></div>
    <header class="sticky top-0 z-[100] transition-all duration-700 border-b border-white/5 bg-[#07090f]/60 backdrop-blur-2xl" id="site-header">
      <div class="container mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-6">
        <div class="flex items-center gap-10">
          <a href="/" class="flex items-center gap-4 group">
            <div class="relative w-14 h-14 flex items-center justify-center">
                <div class="absolute inset-0 bg-amber-500/30 blur-2xl rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                <img src="/assets/images/logo.png" alt="Logo" class="w-10 h-10 object-contain relative transform group-hover:scale-110 transition-all duration-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">
            </div>
            <div class="flex flex-col">
              <h1 class="text-3xl font-black bg-gradient-to-l from-amber-500 via-yellow-200 to-amber-500 bg-[length:200%_auto] animate-textShimmer bg-clip-text text-transparent tracking-tighter leading-none py-1">${t('site_title')}</h1>
              <span class="text-[11px] text-gray-500 font-black tracking-[0.3em] uppercase mt-1">${t('site_subtitle')}</span>
            </div>
          </a>
          <div class="hidden xl:flex items-center relative group">
            <i class="fas fa-search absolute right-4 text-gray-600 group-focus-within:text-amber-500 transition-colors"></i>
            <input type="text" id="header-search-input" 
                   class="bg-white/5 border border-white/10 text-white text-sm pr-12 pl-6 py-3 rounded-2xl w-80 focus:w-[450px] focus:bg-white/10 focus:border-amber-500/50 outline-none transition-all duration-700 placeholder:text-gray-600"
                   placeholder="${t('search_placeholder')}">
          </div>
        </div>
        <nav class="flex items-center gap-4">
          <div class="flex items-center gap-2 bg-white/5 p-1.5 rounded-[1.5rem] border border-white/5">
            <a href="/" class="nav-btn group"><i class="fas fa-home"></i><span class="nav-tooltip">${t('home')}</span></a>
            <a href="/pages/finder/" class="nav-btn group"><i class="fas fa-filter"></i><span class="nav-tooltip">${t('advanced_search')}</span></a>
            <a href="/pages/watchlist/" class="nav-btn group"><i class="fas fa-clapperboard"></i><span class="nav-tooltip">${t('watchlist')}</span></a>
            <button id="open-settings-modal" class="nav-btn group"><i class="fas fa-sliders-h"></i><span class="nav-tooltip">${t('settings')}</span></button>
          </div>
          <a href="/pages/isegaro/" class="hidden md:flex items-center gap-3 bg-gradient-to-r from-amber-600 to-amber-500 text-black px-6 py-3 rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-xl shadow-amber-500/20">
            <i class="fas fa-language"></i> ${t('subtitle_translator')}
          </a>
        </nav>
      </div>
    </header>

    <div class="fixed bottom-8 right-8 z-[150] group" id="fab-container">
      <div class="absolute bottom-full right-0 mb-6 flex flex-col items-end gap-3 opacity-0 translate-y-10 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 scale-90 group-hover:scale-100 origin-bottom-right">
        <a href="https://feedback.onl/fa/b/freemovie" target="_blank" class="flex items-center gap-4 bg-white/10 backdrop-blur-xl border border-white/10 text-white px-5 py-3 rounded-2xl hover:bg-white/20 transition-all">
          <span class="text-xs font-black">${t('feedback')}</span>
          <i class="fas fa-comment text-blue-400"></i>
        </a>
        <a href="https://github.com/freemovieir/freemovieir.github.io/issues" target="_blank" class="flex items-center gap-4 bg-white/10 backdrop-blur-xl border border-white/10 text-white px-5 py-3 rounded-2xl hover:bg-white/20 transition-all">
          <span class="text-xs font-black">${t('report_bug')}</span>
          <i class="fas fa-bug text-amber-400"></i>
        </a>
      </div>
      <button class="w-16 h-16 rounded-[2rem] bg-gradient-to-tr from-amber-600 to-amber-400 text-[#07090f] flex items-center justify-center shadow-2xl shadow-amber-500/30 transform transition-all duration-500 hover:rotate-12 hover:scale-110 border-4 border-[#07090f]">
        <i class="fas fa-bolt text-2xl"></i>
      </button>
    </div>

    <div id="settings-modal" class="fixed inset-0 z-[200] flex items-center justify-center opacity-0 pointer-events-none transition-all duration-500 backdrop-blur-md bg-black/60">
      <div class="glass-card-premium w-full max-w-lg mx-4 rounded-[2.5rem] overflow-hidden border border-white/10 transform scale-90 transition-all duration-500 shadow-2xl" id="settings-modal-content">
        <div class="p-8">
          <div class="flex justify-between items-center mb-8">
            <h2 class="text-2xl font-black text-white">${t('user_settings')}</h2>
            <button id="close-settings-modal" class="text-gray-400 hover:text-white"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="space-y-6">
            <div>
              <label class="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">${t('language')}</label>
              <select id="modal-lang-select" class="w-full bg-white/5 border border-white/10 text-white px-5 py-3 rounded-2xl outline-none focus:border-amber-500/50 appearance-none cursor-pointer">
                <option value="fa" ${window.i18n.current === 'fa' ? 'selected' : ''}>فارسی (Persian)</option>
                <option value="en" ${window.i18n.current === 'en' ? 'selected' : ''}>English</option>
                <option value="es" ${window.i18n.current === 'es' ? 'selected' : ''}>Español (Spanish)</option>
                <option value="fr" ${window.i18n.current === 'fr' ? 'selected' : ''}>Français (French)</option>
                <option value="ar" ${window.i18n.current === 'ar' ? 'selected' : ''}>العربية (Arabic)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">${t('tmdb_token')}</label>
              <input type="password" id="modal-tmdb-token" class="w-full bg-white/5 border border-white/10 text-white px-5 py-3 rounded-2xl outline-none focus:border-amber-500/50">
            </div>
            <button id="save-settings-btn" class="w-full bg-amber-500 text-black py-4 rounded-2xl font-black hover:scale-[1.02] transition-all shadow-xl shadow-amber-500/20">${t('save_changes')}</button>
            <button id="clear-settings-btn" class="w-full text-gray-500 text-sm hover:text-red-500 transition-colors uppercase font-black">${t('clear_cache')}</button>
          </div>
        </div>
      </div>
    </div>

    <style>
      .nav-btn { @apply w-12 h-12 rounded-2xl flex items-center justify-center text-gray-500 hover:text-amber-500 hover:bg-white/10 transition-all duration-500 relative border border-transparent hover:border-white/5; }
      .nav-tooltip { @apply absolute -bottom-14 left-1/2 -translate-x-1/2 glass-card-premium text-[11px] text-white px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500 whitespace-nowrap pointer-events-none scale-50 group-hover:scale-100 shadow-2xl border border-white/10 z-[110] font-black; }
      @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      .animate-textShimmer { animation: shimmer 5s infinite linear; }
    </style>
  `;

  const footerHtml = `
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
                    <div class="flex flex-col gap-4">
                        <button onclick="window.i18n.setLanguage('fa')" class="text-right text-gray-400 hover:text-amber-500 transition-colors">فارسی</button>
                        <button onclick="window.i18n.setLanguage('en')" class="text-right text-gray-400 hover:text-amber-500 transition-colors">English</button>
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

  // Modal interaction
  const modal = document.getElementById('settings-modal');
  const modalContent = document.getElementById('settings-modal-content');
  const langSelect = document.getElementById('modal-lang-select');

  document.getElementById('open-settings-modal').onclick = () => {
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
    if (tmdb) localStorage.setItem('userTmdbToken', tmdb);
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
