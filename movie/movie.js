// movieDetails.js
const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // TMDb API key
const language = 'fa-IR'; // Language set to Persian (Iran)
const baseImageUrl = 'https://image.tmdb.org/t/p/w500'; // TMDb base image URL
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie.png'; // Default poster fallback
const defaultBackdrop = 'https://freemovieir.github.io/images/default-freemovie.png'; // Default poster fallback
const movieId = new URLSearchParams(window.location.search).get('id');

let apiKeySwitcher; // Global variable to hold the switcher instance

// Initialize the API key switcher
async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys(); // استفاده از loadApiKeys سراسری
}

async function getMovieDetails() {
    try {
        showLoading(); // نمایش لودینگ قبل از شروع درخواست‌ها
        if (!movieId) {
            throw new Error('شناسه فیلم در URL وجود ندارد!');
        }

        // Define TMDb API endpoints
        const movieUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=${language}&append_to_response=credits`;
        const externalIdsUrl = `https://api.themoviedb.org/3/movie/${movieId}/external_ids?api_key=${apiKey}`;
        const trailerUrl = `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${apiKey}`;

        // Fetch movie details from TMDb
        const movieRes = await fetch(movieUrl);
        if (!movieRes.ok) throw new Error(`خطای سرور (جزئیات فیلم): ${movieRes.status}`);
        const movieData = await movieRes.json();

        // Fetch external IDs from TMDb
        const externalIdsRes = await fetch(externalIdsUrl);
        if (!externalIdsRes.ok) throw new Error(`خطای سرور (شناسه‌های خارجی): ${externalIdsRes.status}`);
        const externalIdsData = await externalIdsRes.json();

        // Fetch trailer data from TMDb
        const trailerRes = await fetch(trailerUrl);
        if (!trailerRes.ok) throw new Error(`خطای سرور (تریلر): ${trailerRes.status}`);
        const trailerData = await trailerRes.json();

        // Fetch poster from OMDB using imdb_id with the API key switcher
        let poster = defaultPoster;
        const imdbID = externalIdsData.imdb_id || '';
        if (imdbID) {
            const omdbData = await apiKeySwitcher.fetchWithKeySwitch(
                (key) => `https://www.omdbapi.com/?i=${imdbID}&apikey=${key}`
            );
            poster = omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : defaultPoster;
        }

        // Process TMDb movie data
        const year = movieData.release_date ? movieData.release_date.split('-')[0] : 'نامشخص';
        const runTime = movieData.runtime ? `${movieData.runtime} دقیقه` : 'نامشخص';
        const title = movieData.title || 'نامشخص';
        const backdrop = movieData.backdrop_path ? `${baseImageUrl}${movieData.backdrop_path}` : defaultBackdrop;
        const budget = movieData.budget ? `${movieData.budget.toLocaleString()} دلار` : 'نامشخص';
        const director = movieData.credits && movieData.credits.crew ? movieData.credits.crew.find(crew => crew.job === 'Director') : null;
        const directorName = director ? director.name : 'کارگردان مشخص نیست';
        const productionCountries = movieData.production_countries ? movieData.production_countries.map((country) => country.name).join(', ') : 'نامشخص';
        const trailer = trailerData.results && trailerData.results[0] ? `https://www.youtube.com/embed/${trailerData.results[0].key}` : null;
        const spokenLanguages = movieData.spoken_languages && movieData.spoken_languages.map((lang) => lang.english_name).join(', ') || 'نامشخص';

        // Update page content with TMDb data
        document.getElementById('title').textContent = title + " " + `(${year})`;
        document.getElementById('overview').innerHTML = `<strong>خلاصه داستان :</strong> ${movieData.overview || 'خلاصه‌ای در دسترس نیست.'}`;
        document.getElementById('genre').innerHTML = `<strong>ژانر :</strong> ${movieData.genres ? movieData.genres.map(g => g.name).join(', ') : 'نامشخص'}`;
        document.getElementById('year').innerHTML = `<strong>سال تولید :</strong> ${year}`;
        document.getElementById('rating').innerHTML = `<strong>امتیاز :</strong> ${(movieData.vote_average || movieData.vote_average === 0) ? Number(movieData.vote_average).toFixed(1) : 'بدون امتیاز'}/10`;
        document.getElementById('runTime').innerHTML = `<strong>مدت زمان فیلم :</strong> ${runTime} `;
        document.getElementById('spokenLanguages').innerHTML = `<strong>زبان فیلم :</strong> ${spokenLanguages}`;
        document.getElementById('budget').innerHTML = `<strong>بودجه فیلم :</strong> ${budget}`;
        document.getElementById('productionCountries').innerHTML = `<strong>محصول کشور :</strong> ${productionCountries}`;
        document.getElementById('director').innerHTML = `<strong>کارگردان :</strong> ${directorName}`;

        // Add IMDb link
        const imdbLink = imdbID ? `https://www.imdb.com/title/${imdbID}/` : '#';
        document.getElementById('imdb-link').innerHTML = `
            <a href="${imdbLink}" target="_blank" class="flex items-center text-yellow-500 hover:text-yellow-600">
                <img src="https://www.imdb.com/favicon.ico" alt="IMDb Logo" class="w-5 h-5 ml-2">
                <span>صفحه IMDb</span>
            </a>
        `;

        // Update images (poster from OMDB, backdrop from TMDb)
        let posterUrl = poster;
        posterUrl = posterUrl.replace(/300(?=\.jpg$)/i, '');
        document.getElementById('poster').src = posterUrl;
        document.getElementById('poster').alt = `پوستر فیلم ${title}`;
        document.getElementById('movie-bg').style.backgroundImage = `url('${posterUrl}')`;

        // Update trailer from TMDb
        const trailerContainer = document.getElementById('trailer');
        if (trailer) {
            trailerContainer.src = trailer;
            trailerContainer.title = `تریلر فیلم ${title}`;
        } else {
            trailerContainer.outerHTML = '<p class="text-yellow-500">تریلر در دسترس نیست</p>';
        }

        // Update meta tags and title with TMDb data and OMDB poster
        document.getElementById('meta-title').textContent = `${title} - فیری مووی`;
        document.querySelector('meta[name="description"]').setAttribute('content', movieData.overview || `جزئیات و دانلود فیلم ${title} در فیری مووی.`);
        document.querySelector('meta[property="og:title"]').setAttribute('content', `${title} - فیری مووی`);
        document.querySelector('meta[property="og:description"]').setAttribute('content', movieData.overview || 'جزئیات و دانلود فیلم در فیری مووی.');
        document.querySelector('meta[property="og:image"]').setAttribute('content', poster);
        document.querySelector('meta[name="twitter:title"]').setAttribute('content', `${title} - فیری مووی`);
        document.querySelector('meta[name="twitter:description"]').setAttribute('content', movieData.overview || 'جزئیات و دانلود فیلم در فیری مووی.');
        document.querySelector('meta[name="twitter:image"]').setAttribute('content', poster);

        // Update structured data with TMDb data and OMDB poster
        const schema = {
            '@context': 'https://schema.org',
            '@type': 'Movie',
            'name': title,
            'description': movieData.overview || 'خلاصه‌ای در دسترس نیست.',
            'genre': movieData.genres ? movieData.genres.map(g => g.name).join(', ') : 'نامشخص',
            'datePublished': year,
            'image': poster,
            'aggregateRating': {
                '@type': 'AggregateRating',
                'ratingValue': movieData.vote_average ? movieData.vote_average.toString() : '0',
                'bestRating': '10',
                'ratingCount': movieData.vote_count ? movieData.vote_count.toString() : '1'
            },
            'trailer': {
                '@type': 'VideoObject',
                'embedUrl': trailer || ''
            }
        };
        document.getElementById('movie-schema').textContent = JSON.stringify(schema);

       // Generate download links with TMDb year and imdb_id, plus subtitle link
		const imdbShort = imdbID ? imdbID.replace('tt', '') : '';
		const encodedTitle = encodeURIComponent(title); // کد کردن نام فیلم برای URL
		const subtitleLink = `http://subtitlestar.com/go-to.php?imdb-id=${imdbID}&movie-name=${encodedTitle}`;
		const downloadLinks = `
			<a href="https://berlin.saymyname.website/Movies/${year}/${imdbShort}" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" rel="nofollow">دانلود فیلم (لینک اصلی)</a>
			<a href="https://tokyo.saymyname.website/Movies/${year}/${imdbShort}" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" rel="nofollow">دانلود فیلم (لینک کمکی)</a>
			<a href="https://nairobi.saymyname.website/Movies/${year}/${imdbShort}" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" rel="nofollow">دانلود فیلم (لینک کمکی)</a>
			<a href="${subtitleLink}" class="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600" rel="nofollow" target="_blank">دانلود زیرنویس</a>
			<button id="add-to-watchlist" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">افزودن به واچ لیست</button>
		`;
		document.getElementById('download-links').innerHTML = downloadLinks;

        // Add to watchlist functionality
        document.getElementById('add-to-watchlist').addEventListener('click', () => {
            let watchlist = JSON.parse(localStorage.getItem('watchlist')) || { movies: [], series: [] };
            if (!watchlist.movies.includes(movieId)) {
                watchlist.movies.push(movieId);
                localStorage.setItem('watchlist', JSON.stringify(watchlist));
                alert('فیلم به واچ لیست اضافه شد!');
            } else {
                alert('فیلم قبلاً در واچ لیست است!');
            }
        });
    } catch (error) {
        console.error('خطا در دریافت اطلاعات:', error);
        document.getElementById('download-links').innerHTML = `<p class="text-red-500">خطا در دریافت اطلاعات: ${error.message}</p>`;
    } finally {
        hideLoading(); // مخفی کردن لودینگ بعد از اتمام درخواست‌ها
    }
}

// Ensure the switcher is initialized before running getMovieDetails
document.addEventListener('DOMContentLoaded', async () => {
    await initializeSwitcher();
    getMovieDetails();
});