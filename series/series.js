const apiKey = '1dc4cbf81f0accf4fa108820d551dafc';
const language = 'fa-IR';
const baseImageUrl = 'https://image.tmdb.org/t/p/';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';
const defaultBackdrop = 'https://freemovieir.github.io/images/default-freemovie-300.png';
const seriesId = new URLSearchParams(window.location.search).get('id');

let apiKeySwitcher;

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys();
}

async function getSeriesDetails() {
    try {
        showLoading();

        if (!seriesId) {
            throw new Error('شناسه سریال در URL وجود ندارد!');
        }

        const seriesDetailsUrl = `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${apiKey}&language=${language}&append_to_response=external_ids,videos`;

        const res = await fetch(seriesDetailsUrl);
        if (!res.ok) {
            throw new Error(`خطای سرور: ${res.status}`);
        }
        const seriesData = await res.json();

        if (!seriesData || (seriesData.success === false)) {
            throw new Error('سریال با این شناسه یافت نشد');
        }

        let poster = defaultPoster;
        const imdbId = seriesData.external_ids && seriesData.external_ids.imdb_id ? seriesData.external_ids.imdb_id : '';
        if (imdbId) {
            const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
            );
            poster = omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
        }

        const title = seriesData.name || 'نامشخص';
        const year = seriesData.first_air_date ? seriesData.first_air_date.substr(0, 4) : 'نامشخص';
        const backdrop = seriesData.backdrop_path ? `${baseImageUrl}w1280${seriesData.backdrop_path}` : defaultBackdrop;
        const numberOfSeasons = seriesData.number_of_seasons || 0;

        let trailer = '';
        if (seriesData.videos && seriesData.videos.results) {
            const trailerVideo = seriesData.videos.results.find(video => video.type.toLowerCase() === 'trailer' && video.site === 'YouTube');
            if (trailerVideo) {
                trailer = `https://www.youtube.com/embed/${trailerVideo.key}`;
            }
        }

        const titleElement = document.getElementById('title');
        if (titleElement) titleElement.textContent = title;

        const overviewElement = document.getElementById('overview');
        if (overviewElement) overviewElement.textContent = seriesData.overview || 'خلاصه‌ای در دسترس نیست.';

        const genreElement = document.getElementById('genre');
        if (genreElement) genreElement.innerHTML = `<strong>ژانر:</strong> ${seriesData.genres && seriesData.genres.length > 0 ? seriesData.genres.map(g => g.name).join(', ') : 'نامشخص'}`;

        const yearElement = document.getElementById('year');
        if (yearElement) yearElement.innerHTML = `<strong>سال تولید:</strong> ${year}`;

        const ratingElement = document.getElementById('rating');
        if (ratingElement) ratingElement.innerHTML = `<strong>امتیاز:</strong> ${seriesData.vote_average ? Number(seriesData.vote_average).toFixed(1) : 'نامشخص'}/10`;

        // Add IMDb link
        const imdbLink = imdbId ? `https://www.imdb.com/title/${imdbId}/` : '#';
        document.getElementById('imdb-link').innerHTML = `
            <a href="${imdbLink}" target="_blank" class="flex items-center text-yellow-500 hover:text-yellow-600 justify-center">
                <img src="https://www.imdb.com/favicon.ico" alt="IMDb Logo" class="w-5 h-5 ml-2">
                <span>صفحه IMDb</span>
            </a>
        `;

        let posterUrl = poster;
        posterUrl = posterUrl.replace(/300(?=\.jpg$)/i, '');
        const posterElement = document.getElementById('poster');
        if (posterElement) {
            posterElement.src = posterUrl;
            posterElement.alt = `پوستر سریال ${title}`;
        }

        const seriesBgElement = document.getElementById('series-bg');
        if (seriesBgElement) {
            seriesBgElement.style.backgroundImage = `url('${backdrop}')`;
        }

        const trailerContainer = document.getElementById('trailer');
        if (trailerContainer) {
            if (trailer) {
                trailerContainer.innerHTML = `<iframe src="${trailer}" title="تریلر سریال ${title}" frameborder="0" allowfullscreen class="w-full h-64 md:h-96 mx-auto"></iframe>`;
            } else {
                trailerContainer.innerHTML = '<p class="text-yellow-500">تریلر در دسترس نیست</p>';
            }
        }

        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) metaDescription.setAttribute('content', `${seriesData.overview || 'جزئیات و دانلود سریال ' + title + ' در فیری مووی.'}`);

        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute('content', `${title} - فیری مووی`);

        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) ogDescription.setAttribute('content', seriesData.overview || 'جزئیات و دانلود سریال در فیری مووی.');

        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) ogImage.setAttribute('content', posterUrl);

        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) twitterTitle.setAttribute('content', `${title} - فیری مووی`);

        const twitterDescription = document.querySelector('meta[name="twitter:description"]');
        if (twitterDescription) twitterDescription.setAttribute('content', seriesData.overview || 'جزئیات و دانلود سریال در فیری مووی.');

        const twitterImage = document.querySelector('meta[name="twitter:image"]');
        if (twitterImage) twitterImage.setAttribute('content', posterUrl);

        const schema = {
            '@context': 'https://schema.org',
            '@type': 'TVSeries',
            'name': title,
            'description': seriesData.overview || 'خلاصه‌ای در دسترس نیست.',
            'genre': seriesData.genres && seriesData.genres.length > 0 ? seriesData.genres.map(g => g.name).join(', ') : 'نامشخص',
            'datePublished': year,
            'image': posterUrl,
            'aggregateRating': {
                '@type': 'AggregateRating',
                'ratingValue': seriesData.vote_average ? Number(seriesData.vote_average).toFixed(1) : '0',
                'bestRating': '10',
                'ratingCount': seriesData.vote_count ? seriesData.vote_count.toString() : '1'
            },
            'trailer': {
                '@type': 'VideoObject',
                'embedUrl': trailer || ''
            },
            'numberOfSeasons': numberOfSeasons
        };
        const schemaElement = document.getElementById('series-schema');
        if (schemaElement) schemaElement.textContent = JSON.stringify(schema);

        const downloadLinksContainer = document.getElementById('download-links');
        if (downloadLinksContainer) {
            let downloadHtml = '';
            if (imdbId && numberOfSeasons > 0) {
                for (let season = 1; season <= numberOfSeasons; season++) {
                    downloadHtml += `<h3 class="text-xl font-bold mt-4">فصل ${season}</h3>`;
                    for (let quality = 1; quality <= 4; quality++) {
                        const qualityNum = quality;
                        const downloadLink = `https://subtitle.saymyname.website/DL/filmgir/?i=${imdbId}&f=${season}&q=${quality}`;
                        downloadHtml += `
                            <a href="${downloadLink}" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mx-2 my-1 inline-block" rel="nofollow">
                                دانلود کیفیت ${qualityNum}
                            </a>`;
                    }
                }
            } else {
                downloadHtml = '<p class="text-yellow-500">لینک‌های دانلود در دسترس نیست</p>';
            }
            downloadLinksContainer.innerHTML = downloadHtml;
        }

        const watchlistButton = document.getElementById('add-to-watchlist');
        if (watchlistButton) {
            watchlistButton.addEventListener('click', () => {
                let watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
                const normalizedSeriesId = String(seriesId);
                if (!watchlist.series.includes(normalizedSeriesId)) {
                    watchlist.series.push(normalizedSeriesId);
                    localStorage.setItem('watchlist', JSON.stringify(watchlist));
                    alert('سریال به واچ‌لیست اضافه شد!');
                } else {
                    alert('سریال قبلاً در واچ‌لیست است!');
                }
            });
        }

        // Fetch related series
        await fetchRelatedSeries(seriesId);

    } catch (error) {
        console.error('خطا در دریافت اطلاعات:', error);
        const downloadLinksContainer = document.getElementById('download-links');
        if (downloadLinksContainer) {
            downloadLinksContainer.innerHTML = `<p class="text-red-500">خطا در دریافت اطلاعات: ${error.message}</p>`;
        }
    } finally {
        hideLoading();
    }
}

async function fetchRelatedSeries(seriesId) {
    const relatedSeriesContainer = document.getElementById('related-series');
    if (!relatedSeriesContainer) return;

    try {
        const relatedUrl = `https://api.themoviedb.org/3/tv/${seriesId}/similar?api_key=${apiKey}&language=${language}`;
        const res = await fetch(relatedUrl);
        if (!res.ok) throw new Error(`خطای سرور: ${res.status}`);
        const data = await res.json();
        const relatedSeries = data.results || [];

        if (relatedSeries.length === 0) {
            relatedSeriesContainer.innerHTML = '<p class="text-yellow-500">سریال مرتبطی یافت نشد.</p>';
            return;
        }

        let relatedHtml = '';
        for (const serie of relatedSeries.slice(0, 8)) { // محدود کردن به 8 سریال مرتبط
            let poster = defaultPoster;
            const detailsUrl = `https://api.themoviedb.org/3/tv/${serie.id}/external_ids?api_key=${apiKey}`;
            try {
                const detailsRes = await fetch(detailsUrl);
                if (!detailsRes.ok) throw new Error(`خطای جزئیات: ${detailsRes.status}`);
                const detailsData = await detailsRes.json();
                const imdbId = detailsData.imdb_id || '';
                if (imdbId) {
                    const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                        (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
                    );
                    poster = omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
                }
            } catch (error) {
                console.warn(`خطا در دریافت پوستر سریال مرتبط ${serie.id}:`, error.message);
            }

            const title = serie.name || 'نامشخص';
            poster = poster.replace(/300(?=\.jpg$)/i, '');

            relatedHtml += `
                <a href="/freemovie/series/index.html?id=${serie.id}" class="related-series-card">
                    <img src="${poster}" alt="${title}" loading="lazy">
                    <div class="p-2">
                        <h3 class="text-sm font-bold">${title}</h3>
                    </div>
                </a>
            `;
        }
        relatedSeriesContainer.innerHTML = relatedHtml;

    } catch (error) {
        console.error('خطا در دریافت سریال‌های مرتبط:', error);
        relatedSeriesContainer.innerHTML = `<p class="text-red-500">خطا در دریافت سریال‌های مرتبط: ${error.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeSwitcher();
    getSeriesDetails();
});