(function () {
  const headerTarget = document.getElementById('shared-header');
  const footerTarget = document.getElementById('shared-footer');

  const headerHtml = `
    <header class="sticky top-0 z-50 backdrop-blur-md bg-base-900/80 border-b border-gray-800 shadow-lg transition-all duration-300">
      <div class="container mx-auto flex flex-row justify-between items-center px-4 py-3">
        <nav class="flex items-center space-x-2 md:space-x-4">
          <a href="/" class="group flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-800 transition-all duration-300" aria-label="خانه">
            <i class="fas fa-home text-gray-400 group-hover:text-accent group-hover:scale-110 transition-transform duration-300"></i>
          </a>
          <a href="/watchlist" class="group flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-800 transition-all duration-300" aria-label="واچ‌لیست">
            <i class="fas fa-bookmark text-gray-400 group-hover:text-accent group-hover:scale-110 transition-transform duration-300"></i>
          </a>
          <a href="/search" class="group flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-800 transition-all duration-300" aria-label="جستجو">
            <i class="fas fa-search text-gray-400 group-hover:text-accent group-hover:scale-110 transition-transform duration-300"></i>
          </a>
          <a href="/settings/index.html" class="group flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-800 transition-all duration-300" aria-label="تنظیمات">
            <i class="fas fa-cog text-gray-400 group-hover:text-accent group-hover:scale-110 transition-transform duration-300"></i>
          </a>
        </nav>
        <div class="flex items-center">
          <a href="/" class="flex items-center gap-2 group">
            <img src="/logo.png" alt="لوگوی فیری مووی" class="h-10 transform group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_8px_rgba(255,193,7,0.5)]">
            <span class="hidden md:block text-xl font-bold bg-gradient-to-l from-accent to-yellow-200 bg-clip-text text-transparent">فیری مووی</span>
          </a>
        </div>
      </div>
    </header>
  `;

  const footerHtml = `
    <footer class="bg-base-900 border-t border-gray-800 mt-auto">
      <div class="container mx-auto px-4 py-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-right">
          
          <!-- برند و توضیحات -->
          <div class="flex flex-col items-center md:items-start">
             <a href="/" class="flex items-center gap-2 mb-4 group">
                <img src="/logo.png" alt="لوگوی فیری مووی" class="h-10 opacity-80 group-hover:opacity-100 transition-opacity">
                <span class="text-xl font-bold text-gray-200">فیری مووی</span>
             </a>
             <p class="text-gray-400 text-sm leading-relaxed max-w-sm text-center md:text-right">
               مرجع دانلود و تماشای جدیدترین فیلم‌ها و سریال‌های روز دنیا با بهترین کیفیت و ترافیک نیم‌بها.
             </p>
          </div>

          <!-- لینک‌های سریع -->
          <div class="flex flex-col items-center md:items-start space-y-3">
             <h3 class="text-gray-200 font-bold mb-2">دسترسی سریع</h3>
             <a href="/pages/developer/" class="text-gray-400 hover:text-accent transition-colors text-sm">توسعه‌دهندگان</a>
             <a href="/pages/about-freemovie/" class="text-gray-400 hover:text-accent transition-colors text-sm">درباره فیری مووی</a>
             <a href="/pages/disclaimer/" class="text-gray-400 hover:text-accent transition-colors text-sm">سلب مسئولیت (Disclaimer)</a>
             <a href="/pages/disclaimer/index-en.html" class="text-gray-400 hover:text-accent transition-colors text-sm">DMCA Policy</a>
          </div>

          <!-- شبکه‌های اجتماعی و اعتبار -->
          <div class="flex flex-col items-center md:items-start md:items-end space-y-4">
             <h3 class="text-gray-200 font-bold mb-2">همراه ما باشید</h3>
             <div class="flex gap-4">
               <a href="https://twitter.com/freemovie_ir" target="_blank" class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-[#1DA1F2] hover:text-white transition-all duration-300 shadow-lg" aria-label="توییتر">
                 <i class="fab fa-twitter text-lg"></i>
               </a>
               <a href="https://instagram.com/freemovie_ir" target="_blank" class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-gradient-to-tr hover:from-yellow-400 hover:via-pink-500 hover:to-purple-500 hover:text-white transition-all duration-300 shadow-lg" aria-label="اینستاگرام">
                 <i class="fab fa-instagram text-lg"></i>
               </a>
             </div>
             <div class="mt-4 opacity-80 hover:opacity-100 transition-opacity">
               <a class="github-button" href="https://github.com/FreeMovieIR/web" data-icon="octicon-star" data-show-count="true" aria-label="ستاره دادن به FreeMovieIR/web در گیت‌هاب"></a>
               <script async defer src="https://buttons.github.io/buttons.js"></script>
             </div>
          </div>
        </div>

        <div class="mt-8 pt-4 border-t border-gray-800 text-center flex flex-col items-center">
            <p class="text-gray-500 text-xs text-center">
              ساخته شده با 🤍 برای عاشقان سینما | تمام حقوق محفوظ است © ۲۰۲۴
            </p>
            <p class="text-gray-600 text-[10px] mt-2 text-center">
              استفاده از فونت <a href="https://rastikerdar.github.io/vazir-font/" class="hover:text-gray-400" target="_blank" rel="noopener">وزیرمتن</a> به یاد زنده یاد صابر راستی کردار
            </p>
        </div>
      </div>
    </footer>
  `;

  if (headerTarget) {
    headerTarget.innerHTML = headerHtml;
  }

  if (footerTarget) {
    footerTarget.innerHTML = footerHtml;
  }
})();
