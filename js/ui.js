// js/ui.js
// Shared UI renderers for FreeMovie (Movie Cards, Badges, Poster URLs)
(function (window) {
    const DEFAULT_POSTER = 'https://freemovieir.github.io/images/default-freemovie-300.png';

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getProxiedImageUrl(path, width = 500) {
        if (!path) return DEFAULT_POSTER;
        if (path.startsWith('http://') || path.startsWith('https://')) {
            if (path.includes('image.tmdb.org')) {
                const sub = path.replace(/^https?:\/\/image\.tmdb\.org\//, '');
                return `https://wsrv.nl/?url=image.tmdb.org/${sub}`;
            }
            return path;
        }
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `https://wsrv.nl/?url=image.tmdb.org/t/p/w${width}${cleanPath}`;
    }

    function createMediaCard(options) {
        const {
            id,
            title = 'بدون عنوان',
            posterPath,
            rating,
            year,
            type = 'movie', // 'movie' or 'series'
            customBadge = ''
        } = options;

        const safeId = encodeURIComponent(String(id));
        const safeTitle = escapeHtml(title);
        const safeBadge = escapeHtml(customBadge);
        const safeYear = escapeHtml(year || '');

        const detailUrl = type === 'series'
            ? `/series/index.html?id=${safeId}`
            : `/movie/index.html?id=${safeId}`;

        const posterSrc = getProxiedImageUrl(posterPath);
        const card = document.createElement('div');
        card.className = 'group relative flex flex-col bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-700/50';

        const displayRating = rating && rating > 0 ? Number(rating).toFixed(1) : null;

        // Sanitized markup: All interpolated strings are HTML-escaped or URI-encoded
        card.innerHTML = `
            <a href="${detailUrl}" class="block relative aspect-[2/3] w-full overflow-hidden bg-gray-900">
                <img
                    src="${posterSrc}"
                    alt="${safeTitle}"
                    loading="lazy"
                    class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onerror="if(this.src!=='${DEFAULT_POSTER}'){this.src='${DEFAULT_POSTER}';}"
                />
                <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-80"></div>
                ${displayRating ? `
                    <div class="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full text-xs font-bold text-amber-400 border border-amber-400/20">
                        <i class="fas fa-star text-[10px]"></i>
                        <span>${displayRating}</span>
                    </div>
                ` : ''}
                ${safeBadge ? `
                    <div class="absolute top-2 left-2 bg-blue-600/90 backdrop-blur-md px-2 py-0.5 rounded-full text-[11px] font-bold text-white border border-blue-400/30">
                        ${safeBadge}
                    </div>
                ` : ''}
            </a>
            <div class="flex flex-col flex-1 p-3">
                <h3 class="font-bold text-sm text-gray-100 line-clamp-1 group-hover:text-blue-400 transition-colors">
                    <a href="${detailUrl}">${safeTitle}</a>
                </h3>
                <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50 text-xs text-gray-400">
                    <span>${safeYear ? safeYear : (type === 'series' ? 'سریال' : 'فیلم')}</span>
                    <a href="${detailUrl}" class="text-blue-400 hover:text-blue-300 font-medium">مشاهده</a>
                </div>
            </div>
        `;

        return card;
    }

    window.FreeMovieUI = {
        getProxiedImageUrl: getProxiedImageUrl,
        createMediaCard: createMediaCard,
        escapeHtml: escapeHtml,
        DEFAULT_POSTER: DEFAULT_POSTER
    };
})(window);
