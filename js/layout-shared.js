(function () {
  const headerTarget = document.getElementById('shared-header');
  const footerTarget = document.getElementById('shared-footer');

  const headerHtml = `
    <header class="bg-gray-800 p-4 shadow-md">
      <div class="container mx-auto flex flex-row justify-between items-center">
        <nav class="flex items-center space-x-4">
          <a href="/" class="hover:text-gray-300 p-4" aria-label="خانه"><i class="fas fa-home"></i></a>
          <a href="/watchlist" class="hover:text-gray-300" aria-label="واچ‌لیست"><i class="fas fa-bookmark"></i></a>
          <a href="/search" class="hover:text-gray-300" aria-label="جستجو"><i class="fas fa-search"></i></a>
          <a href="/settings/index.html" class="hover:text-gray-300" aria-label="تنظیمات"><i class="fas fa-cog"></i></a>
        </nav>
        <div>
          <a href="/">
            <img src="/logo.png" alt="لوگوی فیری مووی" class="h-10">
          </a>
        </div>
      </div>
    </header>
  `;

  const footerHtml = `
    <footer class="bg-gray-800 p-4 mt-auto">
      <div class="container mx-auto text-center">
        <p>
          فیری مووی - ساخته شده با 🤍
          <br>
          استفاده از فونت <a href="https://rastikerdar.github.io/vazir-font/" class="hover:text-gray-300">وزیرمتن</a> به یاد صابر راستی کردار
        </p>
        <a href="/developer/">توسعه‌دهندگان</a> | <a href="/about-freemovie/">درباره فیری مووی</a>
        <br>
        <a href="/disclaimer/">سلب مسئولیت</a> | <a href="/disclaimer/index-en.html">DMCA</a>
        <div class="social-icons mb-2">
          <a class="github-button"
             href="https://github.com/FreeMovieIR/web"
             data-icon="octicon-star"
             data-show-count="true"
             aria-label="ستاره دادن به FreeMovieIR/web در گیت‌هاب"></a>
        </div>
        <div class="social-icons mb-2">
          <a href="https://twitter.com/freemovie_ir" target="_blank" class="mx-2 hover:text-gray-300" aria-label="ما را در توییتر دنبال کنید">
            <i class="fab fa-twitter"></i>
          </a>
          <a href="https://instagram.com/freemovie_ir" target="_blank" class="mx-2 hover:text-gray-300" aria-label="ما را در اینستاگرام دنبال کنید">
            <i class="fab fa-instagram"></i>
          </a>
        </div>
      </div>
    </footer>
  `;

  function ensureGithubButtonScript() {
    if (document.querySelector('script[data-github-buttons]')) return;
    const script = document.createElement('script');
    script.src = 'https://buttons.github.io/buttons.js';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-github-buttons', 'true');
    document.body.appendChild(script);
  }

  if (headerTarget) {
    headerTarget.innerHTML = headerHtml;
  }

  if (footerTarget) {
    footerTarget.innerHTML = footerHtml;
    ensureGithubButtonScript();
  }
})();
