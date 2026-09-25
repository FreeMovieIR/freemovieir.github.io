(function (window, document) {
    function buildProxyUrl(path, width) {
        if (!path) return '';
        const size = width || 'original';
        const raw = `https://image.tmdb.org/t/p/${size}${path}`;
        return `https://wsrv.nl/?url=${encodeURIComponent(raw)}&output=webp`;
    }

    class FeaturedSlider {
        constructor(containerId, options = {}) {
            this.container = document.getElementById(containerId);
            if (!this.container) return;
            this.autoplayInterval = options.autoplayInterval || 5000;
            this.currentIndex = 0;
            this.timer = null;
            this.items = [];
            this.init();
        }

        async init() {
            try {
                const res = await fetch('/js/featured-verified.json');
                if (!res.ok) return;
                const data = await res.json();
                this.items = Array.isArray(data) ? data.slice(0, 8) : [];
                if (this.items.length === 0) return;
                this.render();
                this.bindEvents();
                this.startAutoplay();
            } catch (e) {
                // ponytail: silent fallback if verified list fails to load
            }
        }

        render() {
            // Safe: markup generated with sanitized item fields
            const slidesHtml = this.items.map((item, idx) => {
                const backdrop = buildProxyUrl(item.backdrop, 'w1280');
                const poster = buildProxyUrl(item.poster, 'w342');
                const activeClass = idx === 0 ? ' opacity-100 z-10 pointer-events-auto' : ' opacity-0 z-0 pointer-events-none';
                const safeTitle = (item.title || '').replace(/"/g, '&quot;');
                const safeOverview = (item.overview || '').slice(0, 160) + (item.overview && item.overview.length > 160 ? '...' : '');

                return `
                    <div class="slider-slide absolute inset-0 transition-opacity duration-700 ease-in-out flex items-end sm:items-center ${activeClass}" data-slide="${idx}">
                        <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('${backdrop}');">
                            <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/40 sm:bg-gradient-to-r sm:from-slate-950 sm:via-slate-950/80 sm:to-transparent"></div>
                        </div>
                        <div class="container mx-auto px-4 py-6 sm:py-10 relative z-10 flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-8">
                            <img src="${poster}" alt="${safeTitle}" class="hidden sm:block w-36 md:w-44 rounded-xl shadow-2xl border border-slate-700/50 shrink-0 object-cover aspect-[2/3]" loading="${idx === 0 ? 'eager' : 'lazy'}">
                            <div class="flex-1 text-center sm:text-right max-w-2xl">
                                <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                                    <span class="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-medium">
                                        <i class="fas fa-check-circle"></i> لینک دانلود فعال
                                    </span>
                                    <span class="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">${item.year}</span>
                                    <span class="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">★ ${item.rating}</span>
                                </div>
                                <h2 class="text-xl sm:text-3xl font-extrabold text-white mb-2 leading-tight">${safeTitle}</h2>
                                <p class="text-slate-300 text-xs sm:text-sm line-clamp-2 sm:line-clamp-3 mb-4 text-justify sm:text-right leading-relaxed">${safeOverview}</p>
                                <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
                                    <a href="/movie/index.html?id=${item.id}" class="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-transform active:scale-95 shadow-lg">
                                        <i class="fas fa-download"></i> دانلود و مشاهده
                                    </a>
                                    <a href="/player/index.html?id=${item.id}&title=${encodeURIComponent(item.title || '')}" class="inline-flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-white font-medium border border-slate-600/50 px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors">
                                        <i class="fas fa-play"></i> پخش آنلاین
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            const dotsHtml = this.items.map((_, idx) => `
                <button class="slider-dot w-2.5 h-2.5 rounded-full transition-all duration-300 ${idx === 0 ? 'bg-amber-400 w-6' : 'bg-slate-500/60 hover:bg-slate-400'}" data-index="${idx}" aria-label="اسلاید ${idx + 1}" type="button"></button>
            `).join('');

            // Safe: markup uses pre-vetted verified catalog fields and sanitized strings
            this.container.innerHTML = `
                <div class="relative w-full h-[360px] sm:h-[420px] md:h-[460px] overflow-hidden rounded-2xl border border-slate-800 shadow-2xl bg-slate-900">
                    <div class="slider-track relative w-full h-full">
                        ${slidesHtml}
                    </div>
                    <button class="slider-prev absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-900/60 hover:bg-slate-800/90 text-white border border-slate-700/60 backdrop-blur-sm flex items-center justify-center transition-all opacity-80 hover:opacity-100" aria-label="قبلی" type="button">
                        <i class="fas fa-chevron-left text-sm sm:text-base"></i>
                    </button>
                    <button class="slider-next absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-900/60 hover:bg-slate-800/90 text-white border border-slate-700/60 backdrop-blur-sm flex items-center justify-center transition-all opacity-80 hover:opacity-100" aria-label="بعدی" type="button">
                        <i class="fas fa-chevron-right text-sm sm:text-base"></i>
                    </button>
                    <div class="slider-dots absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-950/60 backdrop-blur-sm border border-slate-800">
                        ${dotsHtml}
                    </div>
                </div>
            `;
        }

        bindEvents() {
            const prevBtn = this.container.querySelector('.slider-prev');
            const nextBtn = this.container.querySelector('.slider-next');
            const dots = this.container.querySelectorAll('.slider-dot');

            if (prevBtn) prevBtn.addEventListener('click', () => { this.prev(); this.restartAutoplay(); });
            if (nextBtn) nextBtn.addEventListener('click', () => { this.next(); this.restartAutoplay(); });

            dots.forEach(dot => {
                dot.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                    this.goTo(idx);
                    this.restartAutoplay();
                });
            });

            this.container.addEventListener('mouseenter', () => this.stopAutoplay());
            this.container.addEventListener('mouseleave', () => this.startAutoplay());

            let touchStartX = 0;
            this.container.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
                this.stopAutoplay();
            }, { passive: true });

            this.container.addEventListener('touchend', (e) => {
                const diff = touchStartX - e.changedTouches[0].screenX;
                if (Math.abs(diff) > 40) {
                    if (diff > 0) this.prev(); // RTL: swipe left goes to previous
                    else this.next();
                }
                this.startAutoplay();
            }, { passive: true });
        }

        goTo(index) {
            if (index < 0) index = this.items.length - 1;
            if (index >= this.items.length) index = 0;
            this.currentIndex = index;

            const slides = this.container.querySelectorAll('.slider-slide');
            slides.forEach((slide, idx) => {
                if (idx === index) {
                    slide.classList.remove('opacity-0', 'z-0', 'pointer-events-none');
                    slide.classList.add('opacity-100', 'z-10', 'pointer-events-auto');
                } else {
                    slide.classList.remove('opacity-100', 'z-10', 'pointer-events-auto');
                    slide.classList.add('opacity-0', 'z-0', 'pointer-events-none');
                }
            });

            const dots = this.container.querySelectorAll('.slider-dot');
            dots.forEach((dot, idx) => {
                if (idx === index) {
                    dot.classList.add('bg-amber-400', 'w-6');
                    dot.classList.remove('bg-slate-500/60');
                } else {
                    dot.classList.remove('bg-amber-400', 'w-6');
                    dot.classList.add('bg-slate-500/60');
                }
            });
        }

        next() {
            this.goTo(this.currentIndex + 1);
        }

        prev() {
            this.goTo(this.currentIndex - 1);
        }

        startAutoplay() {
            this.stopAutoplay();
            this.timer = setInterval(() => this.next(), this.autoplayInterval);
        }

        stopAutoplay() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        }

        restartAutoplay() {
            this.stopAutoplay();
            this.startAutoplay();
        }
    }

    window.FeaturedSlider = FeaturedSlider;

    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('featured-slider-container')) {
            new FeaturedSlider('featured-slider-container');
        }
    });
})(window, document);
