(function () {
  const headerTarget = document.getElementById('shared-header');
  const footerTarget = document.getElementById('shared-footer');

  const headerHtml = `
    <header class="sticky top-0 z-50 glass-nav transition-all duration-500">
      <div class="container mx-auto flex flex-row justify-between items-center px-6 py-4">
        <nav class="flex items-center gap-2 md:gap-4">
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
        </nav>
        
        <div class="flex items-center">
          <a href="/" class="flex items-center gap-3 group">
            <div class="relative">
                <div class="absolute inset-0 bg-amber-500/20 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <img src="/assets/images/logo.png" alt="لوگوی فیری مووی" class="h-10 relative transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
            </div>
            <span class="hidden md:block text-2xl font-black bg-gradient-to-l from-amber-500 via-yellow-200 to-amber-500 bg-[length:200%_auto] animate-textShimmer bg-clip-text text-transparent tracking-tighter">فیری مووی</span>
          </a>
        </div>
      </div>
    </header>
  `;

  const footerHtml = `
    <footer class="bg-base-950 border-t border-white/5 mt-20 relative overflow-hidden">
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>
      <div class="container mx-auto px-6 py-16 relative z-10">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-12 text-right">
          
          <div class="md:col-span-2 space-y-6">
             <a href="/" class="flex items-center gap-3 group justify-start">
                <img src="/assets/images/logo.png" alt="لوگوی فیری مووی" class="h-10 filter grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500">
                <span class="text-2xl font-bold text-white tracking-tight">فیری مووی</span>
             </a>
             <p class="text-gray-400 text-sm leading-8 max-w-md">
               مرجع دانلود و تماشای جدیدترین فیلم‌ها و سریال‌های روز دنیا با بهترین کیفیت و ترافیک نیم‌بها. ما تلاش می‌کنیم تا بهترین تجربه تماشای سینما را برای شما فراهم کنیم.
             </p>
             <div class="flex gap-4">
               <a href="https://twitter.com/freemovie_ir" target="_blank" class="w-12 h-12 rounded-xl glass-card flex items-center justify-center text-gray-400 hover:bg-[#1DA1F2] hover:text-white hover:-translate-y-1 transition-all duration-300" aria-label="توییتر">
                 <i class="fab fa-twitter text-xl"></i>
               </a>
               <a href="https://instagram.com/freemovie_ir" target="_blank" class="w-12 h-12 rounded-xl glass-card flex items-center justify-center text-gray-400 hover:bg-gradient-to-tr hover:from-yellow-400 hover:via-pink-500 hover:to-purple-500 hover:text-white hover:-translate-y-1 transition-all duration-300" aria-label="اینستاگرام">
                 <i class="fab fa-instagram text-xl"></i>
               </a>
             </div>
          </div>

          <div class="space-y-6">
             <h3 class="text-white font-black text-lg border-r-4 border-amber-500 pr-4">دسترسی سریع</h3>
             <nav class="flex flex-col gap-4">
                <a href="/pages/search/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm hover:translate-x-[-8px] inline-block">جستجوی فیلم</a>
                <a href="/pages/watchlist/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm hover:translate-x-[-8px] inline-block">واچ‌لیست شما</a>
                <a href="/pages/about-freemovie/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm hover:translate-x-[-8px] inline-block">درباره ما</a>
                <a href="/pages/developer/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm hover:translate-x-[-8px] inline-block">تیم توسعه</a>
             </nav>
          </div>

          <div class="space-y-6">
             <h3 class="text-white font-black text-lg border-r-4 border-amber-500 pr-4">قوانین و مستندات</h3>
             <nav class="flex flex-col gap-4">
                <a href="/pages/disclaimer/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm hover:translate-x-[-8px] inline-block">سلب مسئولیت (Disclaimer)</a>
                <a href="/pages/disclaimer/index-en.html" class="text-gray-400 hover:text-amber-500 transition-colors text-sm hover:translate-x-[-8px] inline-block">DMCA Policy</a>
                <a href="/pages/changelog/" class="text-gray-400 hover:text-amber-500 transition-colors text-sm hover:translate-x-[-8px] inline-block">تغییرات اخیر</a>
             </nav>
          </div>
        </div>

        <div class="mt-16 pt-8 border-t border-white/5 text-center space-y-4">
            <p class="text-gray-500 text-xs">
              ساخته شده با <span class="animate-pulse text-red-500 inline-block">❤</span> برای عاشقان سینما | تمام حقوق محفوظ است © ۲۰۲۴
            </p>
            <p class="text-gray-600 text-[10px]">
              استفاده از فونت <a href="https://rastikerdar.github.io/vazir-font/" class="hover:text-amber-500 transition-colors" target="_blank" rel="noopener">وزیرمتن</a> اثر صابر راستی کردار
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
