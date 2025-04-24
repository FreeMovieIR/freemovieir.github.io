const apiKey = '1dc4cbf81f0accf4fa108820d551dafc';
const language = 'fa-IR';
const baseImageUrl = 'https://image.tmdb.org/t/p/';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie-300.png';
const defaultBackdrop = 'https://freemovieir.github.io/images/default-freemovie-300.png';
const seriesId = new URLSearchParams(window.location.search).get('id');

let apiKeySwitcher;



async function initializeSwitcher() {
    try {
        // فرض می‌کنیم loadApiKeys یک Promise برمی‌گرداند
        apiKeySwitcher = await loadApiKeys(); // اطمینان از بارگذاری کلیدهای OMDb
        console.log("API Key Switcher Initialized");
    } catch (error) {
        console.error("Failed to initialize API Key Switcher:", error);
        // شاید بخواهید در اینجا به کاربر اطلاع دهید یا از ادامه کار جلوگیری کنید
        throw new Error("Initialization failed: Cannot load API keys.");
    }
}

// --- OMDb Poster Fetching ---
async function fetchOmdbPoster(imdbId) {
    if (!imdbId || !apiKeySwitcher) {
        return defaultPoster;
    }
    try {
        console.log(`Workspaceing OMDb poster for ${imdbId}`);
        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
            (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
        );
        // بررسی کنید omdbData و omdbData.Poster وجود دارند و 'N/A' نیستند
        if (omdbData && omdbData.Poster && omdbData.Poster !== 'N/A') {
            return omdbData.Poster.replace(/300(?=\.jpg$)/i, '');
        }
        console.warn(`No valid poster found on OMDb for ${imdbId}. Using default.`);
        return defaultPoster;
    } catch (error) {
        console.error(`Error fetching OMDb poster for ${imdbId}:`, error);
        return defaultPoster; // در صورت خطا، پوستر پیش‌فرض را برگردان
    }
}

// --- DOM Update Functions ---
function updateDomWithSeriesDetails(seriesData, posterUrl, imdbId) {
    const title = seriesData.name || 'نامشخص';
    const year = seriesData.first_air_date ? seriesData.first_air_date.substr(0, 4) : 'نامشخص';
    const backdrop = seriesData.backdrop_path ? `${baseImageUrl}w1280${seriesData.backdrop_path}` : defaultBackdrop;
    const overview = seriesData.overview || 'خلاصه‌ای در دسترس نیست.';
    const genres = seriesData.genres && seriesData.genres.length > 0 ? seriesData.genres.map(g => g.name).join(', ') : 'نامشخص';
    const rating = seriesData.vote_average ? Number(seriesData.vote_average).toFixed(1) : 'نامشخص';
    const voteCount = seriesData.vote_count || '0'; // اطمینان از وجود مقدار برای schema

    // یافتن تریلر یوتیوب
    let trailerUrl = '';
    if (seriesData.videos && seriesData.videos.results) {
        const trailerVideo = seriesData.videos.results.find(video => video.type.toLowerCase() === 'trailer' && video.site === 'YouTube');
        if (trailerVideo && trailerVideo.key) {
            // استفاده از فرمت صحیح embed یوتیوب
            trailerUrl = `https://www.youtube.com/embed/${trailerVideo.key}`;
            console.log(`Found trailer: ${trailerUrl}`);
        } else {
            console.log("No YouTube trailer found.");
        }
    }

    // به روز رسانی المان‌های DOM
    document.getElementById('title').textContent = title;
    document.getElementById('overview').textContent = overview;
    document.getElementById('genre').innerHTML = `<strong>ژانر:</strong> ${genres}`;
    document.getElementById('year').innerHTML = `<strong>سال تولید:</strong> ${year}`;
    document.getElementById('rating').innerHTML = `<strong>امتیاز:</strong> ${rating}/10`;

    // لینک IMDb
    const imdbLinkHref = imdbId ? `https://www.imdb.com/title/${imdbId}/` : '#';
    document.getElementById('imdb-link').innerHTML = `
        <a href="${imdbLinkHref}" target="_blank" rel="noopener noreferrer" class="flex items-center text-yellow-500 hover:text-yellow-600 justify-center">
            <img src="https://www.imdb.com/favicon.ico" alt="IMDb Logo" class="w-5 h-5 ml-2">
            <span>صفحه IMDb</span>
        </a>
    `;

    // پوستر
    const posterElement = document.getElementById('poster');
    posterElement.src = posterUrl; // posterUrl از قبل پردازش شده (مثلا حذف 300)
    posterElement.alt = `پوستر سریال ${title}`;

    // پس‌زمینه
    document.getElementById('series-bg').style.backgroundImage = `url('${backdrop}')`;

    // تریلر
    const trailerContainer = document.getElementById('trailer');
    if (trailerUrl) {
        trailerContainer.innerHTML = `<iframe src="${trailerUrl}" title="تریلر سریال ${title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-64 md:h-96 mx-auto"></iframe>`;
    } else {
        trailerContainer.innerHTML = '<p class="text-yellow-500">تریلر در دسترس نیست</p>';
    }

    // متا تگ‌ها
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${overview.substring(0, 160)}...` || `جزئیات و دانلود سریال ${title} در فیری مووی.`);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', overview || 'جزئیات و دانلود سریال در فیری مووی.');
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', posterUrl);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', overview || 'جزئیات و دانلود سریال در فیری مووی.');
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', posterUrl);

    // Schema.org JSON-LD
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'TVSeries',
        'name': title,
        'description': overview,
        'genre': genres,
        'datePublished': year !== 'نامشخص' ? year : undefined, // فقط اگر سال معتبر است
        'image': posterUrl,
        'aggregateRating': {
            '@type': 'AggregateRating',
            'ratingValue': rating !== 'نامشخص' ? rating : '0',
            'bestRating': '10',
            'ratingCount': voteCount
        },
        'trailer': trailerUrl ? {
            '@type': 'VideoObject',
            'name': `تریلر سریال ${title}`,
            'description': `تریلر رسمی سریال ${title}`,
            'thumbnailUrl': seriesData.backdrop_path ? `${baseImageUrl}w500${seriesData.backdrop_path}` : posterUrl, // یک تصویر بندانگشتی برای ویدیو
            'embedUrl': trailerUrl,
            'uploadDate': seriesData.first_air_date || undefined // تاریخ اولین پخش به عنوان تاریخ آپلود تقریبی
        } : undefined, // فقط اگر تریلر وجود دارد
        'numberOfSeasons': seriesData.number_of_seasons || undefined // فقط اگر تعداد فصل مشخص است
    };
    // حذف کلیدهای با مقدار undefined از schema
    Object.keys(schema).forEach(key => schema[key] === undefined && delete schema[key]);
    if (schema.aggregateRating && schema.aggregateRating.ratingValue === '0') delete schema.aggregateRating; // اگر امتیازی نیست حذف شود
    if(schema.trailer && !schema.trailer.uploadDate) delete schema.trailer.uploadDate;

    document.getElementById('series-schema').textContent = JSON.stringify(schema);
}

function updateDownloadLinks(imdbId, numberOfSeasons) {
    const downloadLinksContainer = document.getElementById('download-links');
    if (!downloadLinksContainer) return;

    let downloadHtml = '';
    // بررسی کنید imdbId معتبر است و تعداد فصول بزرگتر از 0 است
    if (imdbId && numberOfSeasons && numberOfSeasons > 0) {
        console.log(`Generating download links for ${numberOfSeasons} seasons (IMDb: ${imdbId})`);
        for (let season = 1; season <= numberOfSeasons; season++) {
            // ایجاد لینک دانلود برای هر فصل و کیفیت
            downloadHtml += `<div class="season-downloads mt-4 p-4 bg-gray-800 rounded">`; // استایل بهتر برای هر فصل
            downloadHtml += `<h3 class="text-xl font-bold mb-3 text-yellow-400">فصل ${season}</h3>`; // عنوان فصل با استایل
            // لینک‌های کیفیت‌های مختلف
            for (let quality = 1; quality <= 4; quality++) { // فرض بر 4 کیفیت
                // ایجاد لینک دانلود
                const downloadLink = `https://subtitle.saymyname.website/DL/filmgir/?i=${imdbId}&f=${season}&q=${quality}`;
                downloadHtml += `
                    <a href="${downloadLink}" target="_blank" rel="nofollow noopener" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition duration-200 mx-1 my-1 inline-block text-sm">
                        کیفیت ${quality} <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </a>`;
            }
            downloadHtml += `</div>`; // پایان div فصل
        }
    } else {
        console.warn("Cannot generate download links: Missing IMDb ID or number of seasons.");
        downloadHtml = '<p class="text-yellow-500">لینک‌های دانلود در حال حاضر در دسترس نیستند.</p>';
    }
    downloadLinksContainer.innerHTML = downloadHtml;
}

function setupWatchlistButton(currentSeriesId, title) {
    const watchlistButton = document.getElementById('add-to-watchlist');
    if (!watchlistButton) return;

    watchlistButton.addEventListener('click', () => {
        try {
            let watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
            // اطمینان از اینکه سریال با فرمت رشته ذخیره می‌شود
            const normalizedSeriesId = String(currentSeriesId);

            // بررسی اینکه آیا سریال از قبل در لیست سریال‌ها وجود دارد یا نه
            if (!watchlist.series.some(id => id === normalizedSeriesId)) {
                watchlist.series.push(normalizedSeriesId);
                localStorage.setItem('watchlist', JSON.stringify(watchlist));
                // ارائه بازخورد بهتر به کاربر
                alert(`"${title}" با موفقیت به واچ‌لیست اضافه شد!`);
                // شاید بخواهید متن یا ظاهر دکمه را تغییر دهید
                watchlistButton.textContent = 'در واچ‌لیست';
                watchlistButton.disabled = true; // غیرفعال کردن دکمه پس از افزودن
            } else {
                alert(`"${title}" قبلاً به واچ‌لیست اضافه شده است.`);
            }
        } catch (error) {
            console.error("Error managing watchlist:", error);
            alert("خطا در ذخیره واچ‌لیست. لطفا حافظه محلی مرورگر خود را بررسی کنید.");
        }
    });

    // بررسی وضعیت اولیه دکمه هنگام بارگذاری صفحه
    try {
        let watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
        const normalizedSeriesId = String(currentSeriesId);
        if (watchlist.series.some(id => id === normalizedSeriesId)) {
            watchlistButton.textContent = 'در واچ‌لیست';
            watchlistButton.disabled = true;
        }
    } catch (error) {
        console.error("Error checking initial watchlist state:", error);
    }
}

// --- Main Function ---
async function getSeriesDetails() {
    if (!seriesId) {
        console.error('Series ID is missing in the URL!');
        // نمایش خطا به کاربر در صفحه
        document.body.innerHTML = '<p class="text-red-500 text-center mt-10">خطا: شناسه سریال در URL وجود ندارد!</p>';
        return; // خروج از تابع
    }
    console.log(`Workspaceing details for series ID: ${seriesId}`);
    showLoading();

    try {
        // 1. دریافت اطلاعات اصلی سریال از TMDB (شامل ویدئوها و IDهای خارجی)
        const seriesDetailsUrl = `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${apiKey}&language=${language}&append_to_response=external_ids,videos`;
        const res = await fetch(seriesDetailsUrl);

        if (!res.ok) {
            // مدیریت خطاهای HTTP مانند 404 (Not Found) یا 401 (Unauthorized)
            throw new Error(`خطای TMDB: ${res.status} ${res.statusText}`);
        }
        const seriesData = await res.json();

        // بررسی پاسخ موفقیت‌آمیز از TMDB (برخی APIها فیلد success دارند)
        if (!seriesData || seriesData.success === false) {
            // اگر seriesData.status_message وجود دارد، آن را نمایش بده
            throw new Error(seriesData.status_message || 'سریال با این شناسه یافت نشد یا خطایی در پاسخ TMDB وجود دارد.');
        }
        console.log("TMDB data received:", seriesData);

        // استخراج IMDb ID برای استفاده‌های بعدی
        const imdbId = seriesData.external_ids?.imdb_id || ''; // Optional chaining
        const numberOfSeasons = seriesData.number_of_seasons || 0;
        const title = seriesData.name || 'سریال بدون نام'; // گرفتن عنوان برای استفاده در لاگ‌ها و پیام‌ها


        // 2. شروع همزمان دریافت پوستر OMDb و سریال‌های مشابه
        console.log("Starting parallel fetches for OMDb poster and related series...");
        const [posterUrl, relatedSeriesHtml] = await Promise.all([
            fetchOmdbPoster(imdbId), // موازی ۱: دریافت پوستر از OMDb
            fetchRelatedSeries(seriesId, apiKey, language, apiKeySwitcher) // موازی ۲: دریافت و پردازش سریال‌های مشابه
        ]);
        console.log(`OMDb Poster URL: ${posterUrl}`);
        console.log("Related series fetch completed.");

        // 3. به‌روزرسانی DOM با تمام اطلاعات جمع‌آوری شده
        console.log("Updating DOM with all fetched data...");
        updateDomWithSeriesDetails(seriesData, posterUrl, imdbId); // به‌روزرسانی اطلاعات اصلی، پوستر، تریلر، متا، schema
        updateDownloadLinks(imdbId, numberOfSeasons); // به‌روزرسانی لینک‌های دانلود
        setupWatchlistButton(seriesId, title); // تنظیم دکمه واچ‌لیست

        // قرار دادن HTML سریال‌های مشابه در DOM
        const relatedSeriesContainer = document.getElementById('related-series');
        if (relatedSeriesContainer) {
            relatedSeriesContainer.innerHTML = relatedSeriesHtml;
            console.log("Related series injected into DOM.");
        }

    } catch (error) {
        console.error('خطا در پردازش اصلی:', error);
        // نمایش خطا به کاربر در یک بخش مشخص
        const errorContainer = document.getElementById('error-message'); // فرض کنید المانی برای نمایش خطا دارید
        if (errorContainer) {
            errorContainer.textContent = `متاسفانه مشکلی پیش آمد: ${error.message}`;
            errorContainer.style.display = 'block'; // نمایش المان خطا
        } else {
            // اگر المان خطا وجود ندارد، یک alert نمایش دهید
            alert(`خطا: ${error.message}`);
        }
        // شاید بخواهید بخش‌های دیگر صفحه را پنهان یا غیرفعال کنید
        document.getElementById('download-links').innerHTML = `<p class="text-red-500">به دلیل خطا، لینک‌های دانلود بارگذاری نشدند.</p>`;
        document.getElementById('related-series').innerHTML = `<p class="text-red-500">به دلیل خطا، سریال‌های مرتبط بارگذاری نشدند.</p>`;

    } finally {
        hideLoading(); // همیشه لودینگ را پنهان کن، چه موفقیت‌آمیز بود چه خطا رخ داد
    }
}

// --- Related Series Function (Optimized) ---
async function fetchRelatedSeries(currentSeriesId, tmdbApiKey, lang, switcher) {
    console.log(`Workspaceing related series for ID: ${currentSeriesId}`);
    const relatedUrl = `https://api.themoviedb.org/3/tv/${currentSeriesId}/similar?api_key=${tmdbApiKey}&language=${lang}&page=1`; // دریافت صفحه اول

    try {
        const res = await fetch(relatedUrl);
        if (!res.ok) {
            throw new Error(`خطای دریافت سریال‌های مشابه: ${res.status}`);
        }
        const data = await res.json();
        let relatedSeries = data.results || [];

        relatedSeries = relatedSeries.filter(s => s.poster_path).slice(0, 6);

        if (relatedSeries.length === 0) {
            console.log("No relevant related series found.");
            return '<p class="text-yellow-500">سریال مرتبطی یافت نشد.</p>';
        }
        console.log(`Found ${relatedSeries.length} potential related series. Fetching details concurrently...`);

        // دریافت موازی IMDb ID برای همه سریال‌های مرتبط
        const externalIdPromises = relatedSeries.map(serie =>
            fetch(`https://api.themoviedb.org/3/tv/${serie.id}/external_ids?api_key=${tmdbApiKey}`)
                .then(res => res.ok ? res.json() : Promise.reject(`Failed to fetch external ID for ${serie.id}`))
                .then(ids => ({ seriesId: serie.id, imdbId: ids.imdb_id })) // برگرداندن ID سریال اصلی و IMDb ID
                .catch(err => {
                    console.warn(`Could not get external ID for related series ${serie.id}:`, err);
                    return { seriesId: serie.id, imdbId: null }; // در صورت خطا هم نتیجه برگردان
                })
        );
        const externalIdsResults = await Promise.all(externalIdPromises);
        console.log("External IDs fetched for related series.");

        // ایجاد یک Map برای دسترسی سریع به IMDb ID با استفاده از seriesId
        const imdbIdMap = new Map(externalIdsResults.map(item => [item.seriesId, item.imdbId]));

        // دریافت موازی پوسترهای OMDb فقط برای آنهایی که IMDb ID دارند
        const posterPromises = relatedSeries
            .filter(serie => !!imdbIdMap.get(serie.id)) // فقط آنهایی که IMDb ID دارند
            .map(async (serie) => {
                const imdbId = imdbIdMap.get(serie.id);
                // استفاده مجدد از تابع fetchOmdbPoster که خطاها را مدیریت می‌کند
                const poster = await fetchOmdbPoster(imdbId); // switcher از پارامتر تابع می‌آید
                return { seriesId: serie.id, poster }; // برگرداندن ID سریال و پوسترش
            });

        const posterResults = await Promise.all(posterPromises);
        console.log("OMDb posters fetched for related series.");

        // ایجاد یک Map برای دسترسی سریع به پوستر با استفاده از seriesId
        const posterMap = new Map(posterResults.map(item => [item.seriesId, item.poster]));

        // ساخت HTML نهایی با استفاده از اطلاعات جمع‌آوری شده
        let relatedHtml = '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">'; // استفاده از Grid برای نمایش بهتر
        relatedSeries.forEach(serie => {
            const poster = posterMap.get(serie.id) || (serie.poster_path ? `${baseImageUrl}w300${serie.poster_path}` : defaultPoster); // اولویت با پوستر OMDb، سپس TMDB، سپس پیش‌فرض
            const title = serie.name || 'نامشخص';
            // استفاده از loading="lazy" برای تصاویر
            relatedHtml += `
                <a href="/series/index.html?id=${serie.id}" class="related-series-card block bg-gray-800 rounded overflow-hidden hover:scale-105 transform transition duration-300 shadow-lg">
                    <img src="${poster}" alt="${title}" loading="lazy" class="w-full h-auto object-cover">
                    <div class="p-2">
                        <h3 class="text-sm font-semibold text-white truncate" title="${title}">${title}</h3>
                         ${serie.first_air_date ? `<p class="text-xs text-gray-400">${serie.first_air_date.substring(0, 4)}</p>` : ''}
                    </div>
                </a>
            `;
        });
        relatedHtml += '</div>'; // بستن div مربوط به grid

        return relatedHtml;

    } catch (error) {
        console.error('خطا در دریافت سریال‌های مرتبط:', error);
        return `<p class="text-red-500">خطا در بارگذاری سریال‌های مرتبط: ${error.message}</p>`; // بازگرداندن HTML خطا
    }
}

// --- Initialization ---
// اجرای کد اصلی پس از بارگذاری کامل DOM و مقداردهی اولیه سوییچر
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeSwitcher(); // اول اطمینان حاصل کن سوییچر آماده است
        await getSeriesDetails(); // سپس جزئیات سریال را بگیر
    } catch (error) {
        console.error("Initialization failed:", error);
        // نمایش خطای کلی به کاربر اگر مقداردهی اولیه ناموفق بود
        hideLoading(); // اطمینان از پنهان شدن لودینگ
        document.body.innerHTML = `<p class="text-red-500 text-center mt-10">خطا در بارگذاری اولیه برنامه: ${error.message}</p>`;
    }
});
