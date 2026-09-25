(function (window, document) {
    function getRootPath() {
        return '/';
    }

    function isPathActive(targetPath) {
        const current = window.location.pathname.toLowerCase();
        const target = targetPath.toLowerCase();

        if (target === '/' || target === '/index.html') {
            return current === '/' || current.endsWith('/index.html') && !current.includes('/movie') && !current.includes('/series') && !current.includes('/search') && !current.includes('/genres') && !current.includes('/watchlist');
        }
        return current.includes(target.replace(/\/$/, ''));
    }

    function initTheme() {
        const saved = localStorage.getItem('theme');
        const isDark = saved ? saved === 'dark' : true;
        if (isDark) {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark');
        }
        updateThemeToggleIcon(isDark);
    }

    function toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        document.body.classList.toggle('dark', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateThemeToggleIcon(isDark);
    }

    function updateThemeToggleIcon(isDark) {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        btn.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
    }

    function renderHeader() {
        // Safe: template contains only hardcoded static markup and no user-supplied input
        const navItems = [
            { href: '/', icon: 'fa-home', label: 'خانه' },
            { href: '/genres/', icon: 'fa-layer-group', label: 'ژانرها' },
            { href: '/series/', icon: 'fa-tv', label: 'سریال‌ها' },
            { href: '/watchlist/', icon: 'fa-bookmark', label: 'واچ‌لیست' },
            { href: '/search/', icon: 'fa-search', label: 'جستجو' },
            { href: '/watch-party/', icon: 'fa-users-viewfinder', label: 'تماشای دونفره' },
            { href: '/settings/', icon: 'fa-cog', label: 'تنظیمات' }
        ];

        const navHtml = navItems.map(item => {
            const active = isPathActive(item.href);
            const activeClass = active ? ' bg-slate-700/70 text-amber-400 font-bold' : '';
            return `<a href="${item.href}" class="nav-link${activeClass}" aria-label="${item.label}" title="${item.label}"><i class="fas ${item.icon}"></i></a>`;
        }).join('');

        const headerHtml = `
            <div class="container mx-auto flex items-center justify-between gap-2 px-3 sm:px-4 h-16">
                <a href="/" class="flex items-center gap-2 shrink-0 select-none">
                    <img src="/logo.png" alt="لوگوی فیری مووی" class="h-9 w-auto">
                    <span class="font-extrabold text-base sm:text-lg text-white">فیری مووی</span>
                </a>
                <nav class="flex items-center gap-1 sm:gap-2">
                    ${navHtml}
                    <button id="theme-toggle" class="nav-link" aria-label="تغییر تم" title="تغییر تم" type="button"><i class="fas fa-sun"></i></button>
                </nav>
            </div>
        `;

        let headerEl = document.getElementById('site-header');
        if (!headerEl) {
            headerEl = document.querySelector('header');
        }

        if (headerEl) {
            headerEl.id = 'site-header';
            headerEl.className = 'site-header';
            headerEl.innerHTML = headerHtml;
        } else {
            headerEl = document.createElement('header');
            headerEl.id = 'site-header';
            headerEl.className = 'site-header';
            headerEl.innerHTML = headerHtml;
            document.body.prepend(headerEl);
        }

        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', toggleTheme);
        }
    }

    function renderFooter() {
        const footerHtml = `
            <div class="container mx-auto text-center px-4 py-8">
                <a href="/" class="inline-block mb-3">
                    <img src="/logo.png" alt="لوگوی فیری مووی" class="h-10 mx-auto opacity-90">
                </a>
                <p class="text-slate-400 text-sm mb-3">
                    فیری مووی - مرجع اطلاعات و دانلود رایگان فیلم و سریال
                    <br>
                    استفاده از فونت <a href="https://rastikerdar.github.io/vazirmatn/" class="footer-link" target="_blank" rel="noopener">وزیرمتن</a> به یاد صابر راستی کردار
                </p>
                <nav class="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm mb-4">
                    <a href="/developer/" class="footer-link">توسعه‌دهندگان</a>
                    <span class="text-slate-600">|</span>
                    <a href="/about-freemovie/" class="footer-link">درباره فیری مووی</a>
                    <span class="text-slate-600">|</span>
                    <a href="/watch-party/" class="footer-link">تماشای دونفره</a>
                    <span class="text-slate-600">|</span>
                    <a href="/disclaimer/" class="footer-link">سلب مسئولیت</a>
                    <span class="text-slate-600">|</span>
                    <a href="/disclaimer/index-en.html" class="footer-link">DMCA</a>
                </nav>
                <div class="flex justify-center gap-4 text-xl mt-2">
                    <a href="https://twitter.com/freemovie_ir" target="_blank" rel="noopener" class="footer-link" aria-label="توییتر"><i class="fab fa-twitter"></i></a>
                    <a href="https://instagram.com/freemovie_ir" target="_blank" rel="noopener" class="footer-link" aria-label="اینستاگرام"><i class="fab fa-instagram"></i></a>
                </div>
            </div>
        `;

        let footerEl = document.getElementById('site-footer');
        if (!footerEl) {
            footerEl = document.querySelector('footer');
        }

        if (footerEl) {
            footerEl.id = 'site-footer';
            footerEl.className = 'site-footer mt-auto';
            footerEl.innerHTML = footerHtml;
        } else {
            footerEl = document.createElement('footer');
            footerEl.id = 'site-footer';
            footerEl.className = 'site-footer mt-auto';
            footerEl.innerHTML = footerHtml;
            document.body.appendChild(footerEl);
        }
    }

    function init() {
        initTheme();
        renderHeader();
        renderFooter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.FreeMovieLayout = {
        renderHeader,
        renderFooter,
        toggleTheme
    };
})(window, document);
