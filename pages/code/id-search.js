const apiKey = '1dc4cbf81f0accf4fa108820d551dafc'; // TMDb API key
const baseImageUrl = 'https://image.tmdb.org/t/p/w500';
const defaultPoster = 'https://freemovieir.github.io/images/default-freemovie.png';

let apiKeySwitcher;

async function initializeSwitcher() {
    apiKeySwitcher = await loadApiKeys(); // فرض بر این است که تابع loadApiKeys در apiKeySwitcher.js تعریف شده
}

function getCachedImage(id, fetchFunction) {
    const cachedImage = localStorage.getItem(`image_${id}`);
    if (cachedImage && cachedImage !== defaultPoster) {
        console.log(`تصویر کش‌شده برای شناسه ${id} بارگذاری شد`);
        return Promise.resolve(cachedImage);
    }
    return fetchFunction().then(poster => {
        if (poster !== defaultPoster) {
            localStorage.setItem(`image_${id}`, poster);
            console.log(`تصویر برای شناسه ${id} ذخیره شد`);
        }
        return poster;
    });
}

async function searchById(id) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = ''; // پاکسازی نتایج قبلی

    if (id.length < 3) return; // حداقل 3 کاراکتر

    try {
        const movieUrl = `https://zxcode.ir/3/movie/${id}?api_key=${apiKey}&language=fa-IR`;
        const tvUrl = `https://zxcode.ir/3/tv/${id}?api_key=${apiKey}&language=fa-IR`;

        const [movieRes, tvRes] = await Promise.all([
            fetch(movieUrl).then(res => res.ok ? res.json() : null),
            fetch(tvUrl).then(res => res.ok ? res.json() : null)
        ]);

        if (movieRes) {
            const poster = movieRes.poster_path ? `${baseImageUrl}${movieRes.poster_path}` : defaultPoster;
            const title = movieRes.title || 'بدون عنوان';
            const year = movieRes.release_date ? movieRes.release_date.substr(0, 4) : 'نامشخص';
            resultsContainer.innerHTML = `
                <div class="group relative">
                    <img src="${poster}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg">
                    <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                        <h3 class="text-lg font-bold">${title}</h3>
                        <p class="text-sm">${year}</p>
                        <a href="../movie/index.html?id=${id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded">مشاهده جزئیات</a>
                    </div>
                </div>
            `;
        } else if (tvRes) {
            const poster = tvRes.poster_path ? `${baseImageUrl}${tvRes.poster_path}` : defaultPoster;
            const title = tvRes.name || 'بدون عنوان';
            const year = tvRes.first_air_date ? tvRes.first_air_date.substr(0, 4) : 'نامشخص';
            resultsContainer.innerHTML = `
                <div class="group relative">
                    <img src="${poster}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg">
                    <div class="absolute inset-0 bg-black bg-opacity-75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-center p-4">
                        <h3 class="text-lg font-bold">${title}</h3>
                        <p class="text-sm">${year}</p>
                        <a href="../series/index.html?id=${id}" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded">مشاهده جزئیات</a>
                    </div>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = '<p class="text-center text-red-500">نتیجه‌ای یافت نشد!</p>';
        }
    } catch (error) {
        console.error('خطا در جستجو:', error);
        resultsContainer.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد!</p>';
    }
}

function convertPersianToEnglishNumbers(input) {
    const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    
    return input.split('').map(char => {
        const index = persianNumbers.indexOf(char);
        return index !== -1 ? englishNumbers[index] : char;
    }).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeSwitcher();
    const searchInput = document.getElementById('search-id');

    searchInput.addEventListener('input', (e) => {
        let id = e.target.value.trim();
        id = convertPersianToEnglishNumbers(id); // تبدیل اعداد فارسی به انگلیسی
        if (id.length >= 3) {
            searchById(id);
        } else {
            document.getElementById('results').innerHTML = '';
        }
    });
});