import { apiUrls, defaultPoster, getCachedImage } from './api.js';
import { startLoadingBar, finishLoadingBar } from './ui.js';
export async function fetchAndDisplayContent(apiKeySwitcher) {
    const movieContainer = document.getElementById('new-movies');
    const tvContainer = document.getElementById('trending-tv');
    const skeletonHTML = `<div class="skeleton w-full"></div>`.repeat(4);

    movieContainer.innerHTML = skeletonHTML;
    tvContainer.innerHTML = skeletonHTML;

    try {
        startLoadingBar();

        const [movieData, tvData] = await Promise.all([
            fetch(apiUrls.now_playing).then(res => res.json()),
            fetch(apiUrls.tv_trending).then(res => res.json())
        ]);

        movieContainer.innerHTML = '';
        tvContainer.innerHTML = '';
        const seenIds = new Set();

        // نمایش فیلم‌ها
        for (const movie of movieData.results || []) {
            if (seenIds.has(movie.id)) continue;
            seenIds.add(movie.id);
            const poster = await getPoster(movie.id, apiKeySwitcher);
            movieContainer.innerHTML += createCard(movie, poster, 'movie');
        }

        // نمایش سریال‌ها
        for (const tv of tvData.results || []) {
            if (seenIds.has(tv.id)) continue;
            seenIds.add(tv.id);
            const poster = await getPoster(tv.id, apiKeySwitcher);
            tvContainer.innerHTML += createCard(tv, poster, 'series');
        }

    } catch (error) {
        movieContainer.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد!</p>';
        tvContainer.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد!</p>';
    } finally {
        finishLoadingBar();
    }
}

async function getPoster(id, apiKeySwitcher) {
    const detailsUrl = `https://api.themoviedb.org/3/movie/${id}/external_ids?api_key=${defaultApiKey}`;
    try {
        const details = await fetch(detailsUrl).then(res => res.json());
        const imdbId = details.imdb_id || '';
        if (imdbId) {
            return await getCachedImage(imdbId, async () => {
                const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                    key => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
                );
                return omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
            });
        }
    } catch (error) {
        console.warn(`خطا در دریافت پوستر ${id}:`, error);
    }
    return defaultPoster;
}

function createCard(item, poster, type) {
    const title = item.title || item.name || 'نامشخص';
    const overview = item.overview ? item.overview.slice(0, 100) + '...' : 'توضیحات موجود نیست';
    return `
        <div class="group relative">
            <img src="${poster}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg">
            <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                <h3 class="text-lg font-bold text-white">${title}</h3>
                <p class="text-sm text-gray-200">${overview}</p>
                <a href="/${type}/index.html?id=${item.id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
            </div>
        </div>
    `;
}