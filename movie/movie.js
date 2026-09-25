
// --- Configuration Constants ---
const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // TMDb API key (Replace with your key)
const language = 'fa-IR';
const baseImageUrl = 'https://wsrv.nl/?url=image.tmdb.org/t/p/'; // Base URL for TMDB images via proxy
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie.png'; // Default poster fallback
const defaultBackdrop = 'https://freemovieir.github.io/images/default-freemovie.png'; // Default backdrop fallback
const movieId = new URLSearchParams(window.location.search).get('id');
const apiClient = window.FreeMovieApi;

let apiKeySwitcher; // Global variable for OMDb API key management

async function initializeSwitcher() {
    try {
        if (typeof loadApiKeys !== 'function') {
            throw new Error("`loadApiKeys` function is not defined.");
        }
        apiKeySwitcher = await loadApiKeys();
        if (!apiKeySwitcher || typeof apiKeySwitcher.fetchWithKeySwitch !== 'function') {
            throw new Error("API Key Switcher initialization failed or is invalid.");
        }
        console.log("API Key Switcher Initialized successfully for movie details.");
    } catch (error) {
        console.error("Fatal Error: Failed to initialize API Key Switcher:", error);
        throw new Error(`Initialization failed: ${error.message}`);
    }
}

// Assuming fetchOmdbPoster is defined elsewhere (like in the previous script)
// If not, include its definition here:
async function fetchOmdbPoster(imdbId, fallbackPoster = defaultPoster) {
    if (!imdbId) {
        console.warn("Skipping OMDb fetch: No IMDb ID provided.");
        return fallbackPoster;
    }
    if (!apiKeySwitcher) {
        console.error("Cannot fetch OMDb poster: apiKeySwitcher is not initialized.");
        return fallbackPoster;
    }
    try {
        console.log(`Workspaceing OMDb poster for IMDb ID: ${imdbId}`);
        const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
            (key) => `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`
        );
        if (omdbData && omdbData.Response === "True" && omdbData.Poster && omdbData.Poster !== 'N/A') {
            console.log(`OMDb poster found for ${imdbId}: ${omdbData.Poster}`);
            return omdbData.Poster.replace(/_SX300\.jpg$|_@_SX300\.jpg$/i, '.jpg');
        } else {
            console.warn(`OMDb response indicates no poster found for ${imdbId}. Response:`, omdbData?.Error || "No poster data");
            return fallbackPoster;
        }
    } catch (error) {
        console.error(`Error fetching OMDb poster for ${imdbId}:`, error.message);
        return fallbackPoster;
    }
}


// --- DOM Update Functions ---

/**
 * Updates the main DOM elements with movie details.
 * @param {object} movieData - Data from TMDB movie endpoint (including credits).
 * @param {object} externalIdsData - Data from TMDB external_ids endpoint.
 * @param {object} videosData - Data from TMDB videos endpoint.
 * @param {string} finalPosterUrl - The determined poster URL (OMDb or default).
 */
function updateDomWithMovieDetails(movieData, movieDataEnglish, externalIdsData, videosData, finalPosterUrl) {
    const title = movieData.title || 'نامشخص';
    const titleEnglish = movieDataEnglish.title || title; 
    const year = movieData.release_date ? movieData.release_date.substring(0, 4) : 'نامشخص';
    const runTime = movieData.runtime ? `${movieData.runtime} دقیقه` : 'نامشخص';
    const backdropPath = movieData.backdrop_path || movieData.poster_path;
    const backdropUrl = backdropPath ? `${baseImageUrl}w1280${backdropPath}` : defaultBackdrop;
    const overview = movieData.overview || 'خلاصه‌ای در دسترس نیست.';
    const genres = movieData.genres?.map(g => g.name).join(', ') || 'نامشخص';
    const rating = movieData.vote_average ? Number(movieData.vote_average).toFixed(1) : 'بدون امتیاز';
    const voteCount = movieData.vote_count || '0';
    const budget = movieData.budget > 0 ? `${movieData.budget.toLocaleString()} دلار` : 'نامشخص';
    const director = movieData.credits?.crew?.find(crew => crew.job === 'Director');
    const directorName = director?.name || 'کارگردان مشخص نیست';
    const productionCountries = movieData.production_countries?.map(c => c.name).join(', ') || 'نامشخص';
    const spokenLanguages = movieData.spoken_languages?.map(lang => lang.english_name).join(', ') || 'نامشخص';
    const imdbId = externalIdsData?.imdb_id || '';

    // Find the official trailer (TMDb first)
    let trailerEmbedUrl = null;
    if (videosData?.results?.length > 0) {
        const trailerVideo = videosData.results.find(video =>
            video.site?.toLowerCase() === 'youtube' &&
            video.type?.toLowerCase() === 'trailer' &&
            video.official === true
        ) || videosData.results.find(video =>
            video.site?.toLowerCase() === 'youtube' &&
            video.type?.toLowerCase() === 'trailer'
        );
        if (trailerVideo) {
            trailerEmbedUrl = `https://www.youtube.com/embed/${trailerVideo.key}`;
        }
    }

    // Update Trailer Iframe or Link
    const trailerContainer = document.getElementById('trailer-container');
    if (trailerContainer) {
        if (trailerEmbedUrl) {
            // اگر تریلر از TMDb پیدا شد، مستقیماً نمایش داده می‌شود
            trailerContainer.innerHTML = `
                <iframe 
                    src="${trailerEmbedUrl}" 
                    title="تریلر فیلم ${title}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen 
                    class="w-full aspect-video max-w-3xl mx-auto rounded shadow-lg"
                ></iframe>
            `;
            console.log(`Trailer embedded from TMDb: ${trailerEmbedUrl}`);
        } else {
            // اگر تریلری در TMDb نبود، یک لینک به جستجوی YouTube نمایش داده می‌شود
            const searchQuery = encodeURIComponent(`${titleEnglish} ${year} official trailer`);
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
            trailerContainer.innerHTML = `
                <p class="text-yellow-500 text-center">تریلر رسمی در دسترس نیست. برای مشاهده تریلرهای احتمالی، <a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">اینجا کلیک کنید</a>.</p>
            `;
            console.log(`No TMDb trailer found for ${title}. Provided link to YouTube search: ${youtubeSearchUrl}`);
        }
    }

    // Update Text Content
    document.getElementById('title').textContent = `${title} (${year})`;
    document.getElementById('overview').innerHTML = `<strong>خلاصه داستان:</strong> ${overview}`;
    document.getElementById('genre').innerHTML = `<strong>ژانر:</strong> ${genres}`;
    document.getElementById('year').innerHTML = `<strong>سال تولید:</strong> ${year}`;
    document.getElementById('rating').innerHTML = `<strong>امتیاز:</strong> ${rating}/10`;
    document.getElementById('runTime').innerHTML = `<strong>مدت زمان:</strong> ${runTime}`;
    document.getElementById('spokenLanguages').innerHTML = `<strong>زبان‌ها:</strong> ${spokenLanguages}`;
    document.getElementById('budget').innerHTML = `<strong>بودجه:</strong> ${budget}`;
    document.getElementById('productionCountries').innerHTML = `<strong>محصول کشور:</strong> ${productionCountries}`;
    document.getElementById('director').innerHTML = `<strong>کارگردان:</strong> ${directorName}`;

    const imdbLinkElement = document.getElementById('imdb-link');
    if (imdbLinkElement) {
        const imdbLinkHref = imdbId ? `https://www.imdb.com/title/${imdbId}/` : '#';
        imdbLinkElement.innerHTML = `
            <a href="${imdbLinkHref}" target="_blank" rel="noopener noreferrer" class="flex items-center text-yellow-500 hover:text-yellow-600 ${!imdbId ? 'opacity-50 cursor-not-allowed' : ''}">
                <img src="https://m.media-amazon.com/images/G/01/imdb/images-ANDW73HA/favicon_desktop_32x32._CB1582158068_.png" alt="IMDb Logo" class="w-5 h-5 ml-2">
                <span>صفحه IMDb ${!imdbId ? '(موجود نیست)' : ''}</span>
            </a>
        `;
        if (!imdbId) {
            imdbLinkElement.querySelector('a').onclick = (e) => e.preventDefault();
        }
    }

    const posterElement = document.getElementById('poster');
    if (posterElement) {
        posterElement.alt = `پوستر فیلم ${title}`;
        posterElement.src = defaultPoster;
        if (finalPosterUrl && finalPosterUrl !== defaultPoster) {
            const tempImage = new Image();
            tempImage.onload = () => { posterElement.src = finalPosterUrl; };
            tempImage.onerror = () => { console.warn(`Failed to load poster: ${finalPosterUrl}. Keeping default.`); };
            tempImage.src = finalPosterUrl;
        }
    }

    const movieBgElement = document.getElementById('main-content-sections');
    if (movieBgElement) {
        movieBgElement.style.backgroundImage = `url('${backdropUrl}')`;
    }

    document.title = `${title} (${year}) - فیری مووی`;
    const metaDesc = overview.substring(0, 160) + (overview.length > 160 ? '...' : '') || `جزئیات و دانلود فیلم ${title}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', finalPosterUrl);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', `${title} - فیری مووی`);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', metaDesc);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', finalPosterUrl);

    const schemaElement = document.getElementById('movie-schema');
    if (schemaElement) {
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'Movie',
            'name': title,
            'description': overview,
            'genre': genres !== 'نامشخص' ? genres.split(', ') : undefined,
            'image': finalPosterUrl,
            'datePublished': movieData.release_date || undefined,
            'director': director ? { '@type': 'Person', 'name': directorName } : undefined,
            'duration': movieData.runtime ? `PT${movieData.runtime}M` : undefined,
            'countryOfOrigin': productionCountries !== 'نامشخص' ? productionCountries.split(', ') : undefined,
            'aggregateRating': (rating !== 'بدون امتیاز' && voteCount !== '0') ? {
                '@type': 'AggregateRating',
                'ratingValue': rating,
                'bestRating': '10',
                'ratingCount': voteCount
            } : undefined,
            'trailer': trailerEmbedUrl ? {
                '@type': 'VideoObject',
                'name': `تریلر فیلم ${title}`,
                'description': `تریلر رسمی فیلم ${title}`,
                'thumbnailUrl': backdropUrl,
                'embedUrl': trailerEmbedUrl,
                'uploadDate': movieData.release_date || undefined
            } : undefined,
            'url': window.location.href
        };
        Object.keys(schema).forEach(key => schema[key] === undefined && delete schema[key]);
        if (schema.director && !schema.director.name) delete schema.director;
        schemaElement.textContent = JSON.stringify(schema, null, 2);
        console.log("Schema.org JSON-LD updated.");
    }
}

/**
 * Generates and updates download links and subtitle link.
 * @param {string} imdbId - IMDb ID of the movie.
 * @param {string} year - Release year of the movie.
 * @param {string} title - Title of the movie.
 */


// --- Release Availability Gate ---
const RELEASE_GATE_TYPES = Object.freeze({
  THEATRICAL_LIMITED: 2,
  THEATRICAL: 3,
  DIGITAL: 4,
  PHYSICAL: 5,
  TV: 6
});

function releaseGateToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function releaseGateDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function releaseGateFormatDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function getAllMovieReleaseDates(releaseDatesData) {
  const results = Array.isArray(releaseDatesData?.results) ? releaseDatesData.results : [];
  return results.flatMap(region => {
    const regionCode = region?.iso_3166_1 || '';
    const releaseDates = Array.isArray(region?.release_dates) ? region.release_dates : [];
    return releaseDates.map(item => ({
      ...item,
      region: regionCode
    }));
  });
}

function getMovieAvailabilityFromReleaseDates(movieData, releaseDatesData) {
  const today = releaseGateToday();
  const releases = getAllMovieReleaseDates(releaseDatesData);

  const past = releases.filter(item => {
    const d = releaseGateDate(item.release_date);
    return d && d <= today;
  });

  const future = releases.filter(item => {
    const d = releaseGateDate(item.release_date);
    return d && d > today;
  });

  const homeTypes = [
    RELEASE_GATE_TYPES.DIGITAL,
    RELEASE_GATE_TYPES.PHYSICAL,
    RELEASE_GATE_TYPES.TV
  ];

  const cinemaTypes = [
    RELEASE_GATE_TYPES.THEATRICAL_LIMITED,
    RELEASE_GATE_TYPES.THEATRICAL
  ];

  const pastHome = past
    .filter(item => homeTypes.includes(item.type))
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));

  const pastCinema = past
    .filter(item => cinemaTypes.includes(item.type))
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));

  const nextHome = future
    .filter(item => homeTypes.includes(item.type))
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date))[0];

  const nextCinema = future
    .filter(item => cinemaTypes.includes(item.type))
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date))[0];

  const mainReleaseDate = releaseGateDate(movieData?.release_date);

  if (pastHome.length > 0) {
    return {
      status: 'public_released',
      canShowExternalLinks: true,
      label: 'نسخه عمومی منتشر شده',
      message: 'برای این فیلم انتشار عمومی/دیجیتال ثبت شده است.',
      date: releaseGateFormatDate(pastHome[0].release_date)
    };
  }

  if (pastCinema.length > 0) {
    return {
      status: 'cinema_only',
      canShowExternalLinks: false,
      label: 'فقط اکران سینمایی',
      message: nextHome
        ? `این فیلم فعلاً فقط اکران سینمایی دارد. انتشار عمومی ثبت‌شده: ${releaseGateFormatDate(nextHome.release_date)}`
        : 'این فیلم فعلاً فقط اکران سینمایی دارد و انتشار عمومی/دیجیتال برای آن ثبت نشده است.',
      date: releaseGateFormatDate(pastCinema[0].release_date)
    };
  }

  if ((mainReleaseDate && mainReleaseDate > today) || nextCinema) {
    return {
      status: 'upcoming',
      canShowExternalLinks: false,
      label: 'هنوز منتشر نشده',
      message: mainReleaseDate
        ? `این فیلم هنوز منتشر نشده است. تاریخ ثبت‌شده: ${releaseGateFormatDate(movieData.release_date)}`
        : `این فیلم هنوز منتشر نشده است. اکران ثبت‌شده: ${releaseGateFormatDate(nextCinema.release_date)}`,
      date: movieData?.release_date || releaseGateFormatDate(nextCinema?.release_date)
    };
  }

  return {
    status: 'unknown',
    canShowExternalLinks: false,
    label: 'وضعیت انتشار نامشخص',
    message: 'انتشار عمومی این فیلم در TMDb تأیید نشده است؛ برای جلوگیری از لینک خراب، لینک نمایش داده نمی‌شود.',
    date: ''
  };
}

function renderReleaseGateNotice(availability) {
  const container = document.getElementById('download-links');
  if (!container) return;

  container.innerHTML = `
    <div class="bg-yellow-900/40 border border-yellow-700 text-yellow-100 rounded-xl p-4 text-center space-y-3">
      <div class="font-bold">${availability.label}</div>
      <div class="text-sm leading-7">${availability.message}</div>
      <div class="text-xs opacity-80">
        وضعیت: ${availability.status}${availability.date ? ' | تاریخ: ' + availability.date : ''}
      </div>
      <button id="add-to-watchlist" class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white">
        <svg class="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true"></svg>
        <span>افزودن به واچ‌لیست</span>
      </button>
    </div>
  `;
}

async function updateDownloadLinks(imdbId, year, title) {
    const downloadLinksContainer = document.getElementById('download-links');
    if (!downloadLinksContainer) return;

    if (!imdbId || !year) {
        downloadLinksContainer.innerHTML = '<p class="text-yellow-500 text-center">اطلاعات لازم برای ایجاد لینک دانلود موجود نیست.</p>';
        return;
    }

    const imdbShort = imdbId.replace('tt', '');
    const encodedTitle = encodeURIComponent(title);
    const subtitleLink = `http://subtitlestar.com/go-to.php?imdb-id=${imdbId}&movie-name=${encodedTitle}`;

    const servers = [
        { name: 'اصلی', baseUrl: 'https://berlin.saymyname.website' },
        { name: 'کمکی ۱', baseUrl: 'https://tokyo.saymyname.website' },
        { name: 'کمکی ۲', baseUrl: 'https://nairobi.saymyname.website' }
    ];
    const downloadPath = `/Movies/${year}/${imdbShort}/`;

    // ساخت URL گزارش لینک خراب به گیت‌هاب
    function buildBrokenReportUrl(serverName, url) {
        const issueTitle = `گزارش لینک خراب: ${title} (${year}) - سرور ${serverName}`;
        const issueBody = [
            `عنوان: ${title}`,
            `سال: ${year}`,
            `IMDb: ${imdbId}`,
            `TMDb: ${movieId}`,
            `سرور: ${serverName}`,
            `لینک خراب: ${url}`,
            `صفحه: ${window.location.href}`
        ].join('\n');
        return `https://github.com/FreeMovieIR/freemovieir.github.io/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
    }

    // بررسی سلامت واقعی لینک از طریق المان آزمایشی
    function checkServerAlive(url, timeoutMs = 4000) {
        return new Promise((resolve) => {
            const obj = document.createElement('object');
            obj.style.width = '0px';
            obj.style.height = '0px';
            obj.style.position = 'absolute';
            obj.style.visibility = 'hidden';
            obj.style.pointerEvents = 'none';

            let done = false;
            const timer = setTimeout(() => {
                if (!done) {
                    done = true;
                    obj.remove();
                    resolve(false);
                }
            }, timeoutMs);

            obj.onload = () => {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    obj.remove();
                    resolve(true);
                }
            };

            obj.onerror = () => {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    obj.remove();
                    resolve(false);
                }
            };

            obj.data = url;
            document.body.appendChild(obj);
        });
    }

    // نمایش loading اولیه
    downloadLinksContainer.innerHTML = `
        <div class="flex flex-wrap justify-center gap-3">
            <div class="w-full text-center text-gray-400 text-sm py-2">
                <svg class="animate-spin inline h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 5.373 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                در حال بررسی لینک‌های دانلود...
            </div>
        </div>
    `;

    // بررسی سلامت هر سرور به صورت موازی
    const serverStatuses = await Promise.all(
        servers.map(async (server) => {
            const url = `${server.baseUrl}${downloadPath}`;
            const alive = await checkServerAlive(url);
            return { ...server, url, alive };
        })
    );

    const availableServers = serverStatuses.filter(s => s.alive);

    // رندر لینک‌ها فقط در صورتی که سرور زنده و سالم باشد
    let downloadLinksHtml = '';

    if (availableServers.length > 0) {
        downloadLinksHtml = availableServers.map(server => {
            const reportUrl = buildBrokenReportUrl(server.name, server.url);
            return `
                <div class="flex items-center gap-1">
                    <a href="${server.url}"
                       class="bg-blue-600 text-white px-3 py-1.5 rounded-r hover:bg-blue-700 transition duration-200 text-sm font-medium flex items-center gap-1"
                       rel="nofollow noopener" target="_blank">
                        <span class="inline-block bg-green-700 text-green-100 text-xs rounded px-1.5 py-0.5 mr-1">✓ فعال</span>
                        <span>دانلود (${server.name})</span>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </a>
                    <a href="${reportUrl}"
                       class="bg-red-800 hover:bg-red-700 text-red-100 text-xs px-2 py-1.5 rounded-l transition duration-200 flex items-center"
                       rel="nofollow noopener" target="_blank" title="گزارش لینک خراب">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </a>
                </div>
            `;
        }).join('');
    } else {
        downloadLinksHtml = `
            <div class="w-full text-center py-3 px-4 bg-yellow-900/30 border border-yellow-700/50 rounded-xl text-yellow-200 text-sm">
                <div class="font-medium mb-1">هنوز لینک دانلودی برای این فیلم بر روی سرورها قرار نگرفته است.</div>
                <div class="text-xs text-yellow-300/70">به محض انتشار فایل در سرورها، لینک دانلود به صورت خودکار فعال می‌شود.</div>
            </div>
        `;
    }

    downloadLinksHtml += `
        <a href="${subtitleLink}"
           class="bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 transition duration-200 text-sm font-medium flex items-center gap-1"
           rel="nofollow noopener" target="_blank">
            <span>دریافت زیرنویس</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
        </a>
        <button id="add-to-watchlist" class="bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition duration-200 text-sm font-medium flex items-center gap-1 opacity-50" disabled>
            <span>واچ‌لیست</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
        </button>
    `;

    downloadLinksContainer.innerHTML = `<div class="flex flex-wrap justify-center gap-3">${downloadLinksHtml}</div>`;
    console.log("Download links generated with health check.");
}

/**
 * Sets up the watchlist button functionality.
 * @param {string} currentMovieId - The ID of the current movie.
 * @param {string} title - The title of the movie for messages.
 */
function setupWatchlistButton(currentMovieId, title) {
    // Re-use the exact same function from the series details script if it's shared
    // Or copy its logic here, adapted for movies:
    const watchlistButton = document.getElementById('add-to-watchlist');
    if (!watchlistButton) {
        console.warn("Watchlist button element not found after generating links.");
        return;
    }

    const storageKey = 'watchlist';
    let watchlist = { movies: [], series: [] };
    const normalizedMovieId = String(currentMovieId);

    try {
        const storedWatchlist = localStorage.getItem(storageKey);
        if (storedWatchlist) {
            watchlist = JSON.parse(storedWatchlist);
            if (!Array.isArray(watchlist.movies)) watchlist.movies = [];
            if (!Array.isArray(watchlist.series)) watchlist.series = [];
        }
    } catch (error) {
        console.error("Error reading watchlist from localStorage:", error);
        watchlist = { movies: [], series: [] };
    }

    const isInWatchlist = watchlist.movies.includes(normalizedMovieId);

    // Update button appearance and state
    watchlistButton.disabled = isInWatchlist;
    watchlistButton.classList.toggle('opacity-50', isInWatchlist);
    watchlistButton.classList.toggle('cursor-not-allowed', isInWatchlist);
    watchlistButton.querySelector('span').textContent = isInWatchlist ? 'در واچ‌لیست' : 'افزودن به واچ‌لیست';
    // Change icon based on state (optional)
    const iconSvg = watchlistButton.querySelector('svg');
    if (iconSvg) {
        iconSvg.innerHTML = isInWatchlist
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />' // Checkmark icon
            : '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />'; // Plus icon
    }


    if (!isInWatchlist) {
        watchlistButton.addEventListener('click', () => {
            try {
                let currentWatchlist = { movies: [], series: [] };
                const storedWatchlist = localStorage.getItem(storageKey);
                if (storedWatchlist) {
                    currentWatchlist = JSON.parse(storedWatchlist);
                    if (!Array.isArray(currentWatchlist.movies)) currentWatchlist.movies = [];
                    if (!Array.isArray(currentWatchlist.series)) currentWatchlist.series = [];
                }

                if (!currentWatchlist.movies.includes(normalizedMovieId)) {
                    currentWatchlist.movies.push(normalizedMovieId);
                    localStorage.setItem(storageKey, JSON.stringify(currentWatchlist));
                    alert(`"${title}" با موفقیت به واچ‌لیست اضافه شد!`);

                    // Update button state immediately after adding
                    watchlistButton.disabled = true;
                    watchlistButton.classList.add('opacity-50', 'cursor-not-allowed');
                    watchlistButton.querySelector('span').textContent = 'در واچ‌لیست';
                    if(iconSvg) iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />';

                } else {
                    alert(`"${title}" از قبل در واچ‌لیست شما وجود دارد.`);
                    watchlistButton.disabled = true; // Ensure it's disabled
                    watchlistButton.classList.add('opacity-50', 'cursor-not-allowed');
                    watchlistButton.querySelector('span').textContent = 'در واچ‌لیست';
                    if(iconSvg) iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />';
                }
            } catch (error) {
                console.error("Error saving to watchlist:", error);
                alert("خطا در ذخیره واچ‌لیست.");
            }
        }, { once: true }); // Listener runs only once
    }
    console.log(`Watchlist button setup complete. Is in watchlist: ${isInWatchlist}`);
}


// --- Main Function ---
async function getMovieDetails() {
    if (!movieId) {
        console.error('Movie ID is missing in the URL!');
        document.getElementById('main-content').innerHTML = '<p class="text-red-500 text-center mt-10 text-lg font-bold">خطا: شناسه فیلم در URL وجود ندارد!</p>';
        return;
    }
    showLoading();
    const generalErrorContainer = document.getElementById('general-error-message');
    if (generalErrorContainer) generalErrorContainer.style.display = 'none';

    try {
        // Define TMDB API URLs for Persian and English
        const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=${language}&append_to_response=credits,videos`;
        const movieDetailsEnglishUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=en-US`;
        const externalIdsUrl = `https://api.themoviedb.org/3/movie/${movieId}/external_ids?api_key=${apiKey}`; const releaseDatesUrl = `https://api.themoviedb.org/3/movie/${movieId}/release_dates?api_key=${apiKey}`;

        console.log("Fetching TMDB data concurrently...");
        console.time("TMDB Concurrent Fetch");
        const [detailsRes, detailsEnglishRes, externalIdsRes, releaseDatesRes] = await Promise.all([ apiClient.request(movieDetailsUrl), apiClient.request(movieDetailsEnglishUrl), apiClient.request(externalIdsUrl), apiClient.request(releaseDatesUrl) ]);
        console.timeEnd("TMDB Concurrent Fetch");

        if (!detailsRes.ok) throw new Error(`خطای TMDB (جزئیات/عوامل/ویدیو): ${detailsRes.status} ${detailsRes.statusText}`);
        if (!detailsEnglishRes.ok) throw new Error(`خطای TMDB (جزئیات انگلیسی): ${detailsEnglishRes.status} ${detailsEnglishRes.statusText}`);
        if (!externalIdsRes.ok) throw new Error(`خطای TMDB (شناسه‌های خارجی): ${externalIdsRes.status} ${externalIdsRes.statusText}`);

        console.time("Parse TMDB JSON");
        const [movieData, movieDataEnglish, externalIdsData, releaseDatesData] = await Promise.all([ detailsRes.json(), detailsEnglishRes.json(), externalIdsRes.json(), releaseDatesRes && releaseDatesRes.ok ? releaseDatesRes.json() : Promise.resolve({ results: [] }) ]);
        console.timeEnd("Parse TMDB JSON");

        const imdbId = externalIdsData?.imdb_id || '';
        const title = movieData.title || 'فیلم بدون نام';
        const year = movieData.release_date ? movieData.release_date.substring(0, 4) : 'نامشخص';

        console.log(`Fetching OMDb poster for ${imdbId || 'N/A'}...`);
        console.time("OMDb Poster Fetch");
        const tmdbPosterFallback = movieData.poster_path ? `${baseImageUrl}w500${movieData.poster_path}` : defaultPoster;
        const finalPosterUrl = await fetchOmdbPoster(imdbId, tmdbPosterFallback);
        console.timeEnd("OMDb Poster Fetch");

        console.log("All data fetched. Updating DOM...");
        console.time("DOM Update");
        updateDomWithMovieDetails(movieData, movieDataEnglish, externalIdsData, movieData.videos, finalPosterUrl);
        const availability = getMovieAvailabilityFromReleaseDates(movieData, releaseDatesData);
if (!availability.canShowExternalLinks) {
  renderReleaseGateNotice(availability);
} else {
  await updateDownloadLinks(imdbId, year, title);
}
        setupWatchlistButton(movieId, title);
        console.timeEnd("DOM Update");

    } catch (error) {
        console.error('خطا در دریافت و پردازش جزئیات فیلم:', error);
        if (generalErrorContainer) {
            generalErrorContainer.textContent = `متاسفانه مشکلی پیش آمد: ${error.message}`;
            generalErrorContainer.style.display = 'block';
        } else {
            alert(`خطا: ${error.message}`);
        }
        document.getElementById('main-content-sections')?.classList.add('hidden');
        document.getElementById('download-links').innerHTML = `<p class="text-red-500 text-center">به دلیل خطا، لینک‌های دانلود بارگذاری نشدند.</p>`;
    } finally {
        hideLoading();
        console.log("getMovieDetails processing finished.");
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Movie details page DOM loaded.");
    try {
        console.log("Initializing API Key Switcher...");
        await initializeSwitcher();
        console.log("Initialization complete. Fetching movie details...");
        await getMovieDetails();
    } catch (initializationError) {
        console.error("Critical Initialization Error:", initializationError);
        hideLoading();
        document.getElementById('main-content').innerHTML = `<div class="text-center mt-10 p-4 bg-red-800 text-white rounded">... خطای اساسی ...</div>`; // Display critical error
    }
});
