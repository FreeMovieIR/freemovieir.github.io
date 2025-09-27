// search-pro.js
const apiKey = '1dc4cbf81f0accf4fa108820d551dafc';
const language = 'fa-IR';
const baseImageUrl = 'https://image.tmdb.org/t/p/w500';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie.png';

let apiKeySwitcher;
let currentPage = 1;
let totalPages = 1; 
let searchParams = {};

async function initializeSwitcher() {
  apiKeySwitcher = await loadApiKeys();
}

function getCachedImage(id, fetchFunction) {
  const cachedImage = localStorage.getItem(`image_${id}`);
  if (cachedImage && cachedImage !== defaultPoster) {
    console.log(`تصویر کش‌شده برای شناسه ${id} از Local Storage بارگذاری شد`);
    return Promise.resolve(cachedImage);
  }
  return fetchFunction().then(poster => {
    if (poster !== defaultPoster) {
      localStorage.setItem(`image_${id}`, poster);
      console.log(`تصویر برای شناسه ${id} در Local Storage ذخیره شد`);
    }
    return poster;
  });
}

function showLoading() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="loading-overlay" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
      <div class="flex flex-col items-center">
        <div class="popcorn mb-6">
          <svg width="80" height="80" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <rect x="16" y="32" width="32" height="24" rx="4" fill="#ffaa07" stroke="#1f2937" stroke-width="2"/>
            <rect x="12" y="28" width="40" height="8" rx="2" fill="#ffaa07"/>
            <path d="M16 32 L48 32" stroke="#1f2937" stroke-width="2"/>
            <path d="M16 36 L48 36" stroke="#1f2937" stroke-width="1"/>
            <circle cx="24" cy="24" r="6" fill="#ffaa07" class="popcorn-piece" style="animation: pop 1.5s infinite ease-in-out;"/>
            <circle cx="32" cy="20" r="5" fill="#ffaa07" class="popcorn-piece" style="animation: pop 1.5s infinite ease-in-out 0.2s;"/>
            <circle cx="40" cy="24" r="6" fill="#ffaa07" class="popcorn-piece" style="animation: pop 1.5s infinite ease-in-out 0.4s;"/>
          </svg>
        </div>
        <p class="text-white text-lg font-semibold">در حال دریافت نتایج...</p>
      </div>
    </div>
  `);
}

function hideLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.remove();
}

async function advancedSearch(page = 1, append = false) {
  const withGenres = Array.from(document.querySelectorAll('input[name="with-genres"]:checked')).map(input => input.value).join(',');
  const withoutGenres = Array.from(document.querySelectorAll('input[name="without-genres"]:checked')).map(input => input.value).join(',');
  const withCountries = Array.from(document.querySelectorAll('input[name="with-countries"]:checked')).map(input => input.value);
  const withoutCountries = Array.from(document.querySelectorAll('input[name="without-countries"]:checked')).map(input => input.value);
  const minVote = document.getElementById('min-vote').value;

  // ذخیره پارامترهای جستجو برای استفاده در بارگذاری صفحات بعدی
  searchParams = { withGenres, withoutGenres, withCountries, withoutCountries, minVote };

  const movieResults = document.getElementById('movie-results');
  const movieTitle = document.getElementById('movie-title');
  const loadMoreButton = document.getElementById('load-more-button');

  if (!append) {
    currentPage = 1; // ریست کردن صفحه به 1 در جستجوی جدید
    movieResults.innerHTML = ''; // پاک کردن نتایج قبلی
  }

  showLoading();

  try {
    let movieUrl = `https://zxcode.ir/3/discover/movie?api_key=${apiKey}&language=${language}&sort_by=vote_average.desc&page=${page}`;

    if (withGenres) movieUrl += `&with_genres=${withGenres}`;
    if (withoutGenres) movieUrl += `&without_genres=${withoutGenres}`;
    if (withCountries.length > 0) movieUrl += `&with_origin_country=${withCountries.join('|')}`;
    if (minVote) movieUrl += `&vote_average.gte=${minVote}`;

    const res = await fetch(movieUrl);
    if (!res.ok) throw new Error(`خطای سرور: ${res.status}`);
    const movieRes = await res.json();

    totalPages = movieRes.total_pages || 1; // به‌روزرسانی تعداد کل صفحات

    const filterCountries = (items, excludedCountries) => {
      return items.filter(item => {
        const countries = item.origin_country || [];
        return !excludedCountries.some(country => countries.includes(country));
      });
    };

    const movies = filterCountries(movieRes.results || [], withoutCountries);

    if (!append) {
      movieTitle.textContent = 'نتایج جستجو فیلم';
    }

    const seenIds = new Set();

    if (movies.length > 0) {
      for (const movie of movies) {
        if (seenIds.has(movie.id)) continue;
        seenIds.add(movie.id);

        let poster = movie.poster_path ? `${baseImageUrl}${movie.poster_path}` : defaultPoster;
        const movieId = movie.id;
        const title = movie.title || 'نامشخص';
        const year = movie.release_date ? movie.release_date.substr(0, 4) : 'نامشخص';

        movieResults.innerHTML += `
          <div class="group relative">
            <img src="${poster}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg transition-transform duration-300 group-hover:scale-105">
            <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
              <h3 class="text-lg font-bold">${title}</h3>
              <p class="text-sm">${year}</p>
              <a href="../movie/index.html?id=${movieId}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">مشاهده</a>
            </div>
          </div>
        `;
      }

      // نمایش یا مخفی کردن دکمه "مشاهده بیشتر"
      if (currentPage < totalPages) {
        loadMoreButton.classList.remove('hidden');
      } else {
        loadMoreButton.classList.add('hidden');
      }
    } else if (!append) {
      movieResults.innerHTML = '<p class="text-center text-red-500">فیلمی یافت نشد!</p>';
      loadMoreButton.classList.add('hidden');
    }
  } catch (error) {
    console.error('خطا در جستجوی پیشرفته:', error);
    if (!append) {
      movieResults.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد!</p>';
    }
    loadMoreButton.classList.add('hidden');
  } finally {
    hideLoading();
  }
}

function loadMore() {
  currentPage++;
  advancedSearch(currentPage, true); // بارگذاری صفحه بعدی و اضافه کردن به نتایج فعلی
}

document.addEventListener('DOMContentLoaded', async () => {
  await initializeSwitcher();
  const searchButton = document.getElementById('advanced-search-button');
  const loadMoreButton = document.getElementById('load-more-button');

  if (searchButton) {
    searchButton.addEventListener('click', () => advancedSearch(1, false));
  } else {
    console.error('دکمه جستجو پیدا نشد!');
  }

  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', loadMore);
  } else {
    console.error('دکمه مشاهده بیشتر پیدا نشد!');
  }
});