const apiKey = '1dc4cbf81f0accf4fa108820d551dafc';
const apiUrl = `https://zxcode.ir/3/genre/movie/list?api_key=${apiKey}&language=fa-IR`;

function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '0';
        setTimeout(() => {
            loadingBar.style.width = '30%';
        }, 100);
    }
}

function finishLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '100%';
        setTimeout(() => loadingBar.style.width = '0', 300);
    }
}

async function fetchGenres() {
    const container = document.getElementById('genre-list');
    startLoadingBar();

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`خطای سرور: ${response.status}`);
        const data = await response.json();
        const genres = data.genres || [];

        container.innerHTML = '';

        genres.forEach(genre => {
            container.innerHTML += `
                <a href="/pages/movie/s-by-genre.html?genreId=${genre.id}&genreName=${encodeURIComponent(genre.name)}" class="genre-item">
                    <h3 class="text-lg font-bold">${genre.name}</h3>
                </a>
            `;
        });
    } catch (error) {
        console.error('خطا در دریافت ژانرها:', error);
        container.innerHTML = '<p class="text-center text-red-500">خطایی رخ داد! لطفاً دوباره تلاش کنید.</p>';
    } finally {
        finishLoadingBar();
    }
}

function manageDisclaimerNotice() {
    const notice = document.getElementById('disclaimer-notice');
    if (!notice) return;

    if (!localStorage.getItem('disclaimerNoticeClosed')) {
        notice.classList.remove('hidden');
    } else {
        notice.classList.add('hidden');
    }

    const closeButton = document.getElementById('close-disclaimer');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            notice.classList.add('hidden');
            localStorage.setItem('disclaimerNoticeClosed', 'true');
        });
    }
}

function downloadImage(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log(`${filename} دانلود شد`);
}

function manageSupportPopup() {
    const popup = document.getElementById('support-popup');
    if (!popup) return;

    const isPopupShown = localStorage.getItem('isPopupShown') === 'true';
    if (!isPopupShown) {
        popup.classList.remove('hidden');
        localStorage.setItem('isPopupShown', 'true');
    }

    const closeButton = document.getElementById('close-popup');
    if (closeButton) {
        closeButton.addEventListener('click', () => popup.classList.add('hidden'));
    }

    const tweetButton = document.getElementById('tweet-support');
    if (tweetButton) {
        tweetButton.addEventListener('click', () => {
            const tweetText = encodeURIComponent('من از فیری مووی حمایت می‌کنم! یک سایت عالی برای تماشای فیلم و سریال: https://b2n.ir/freemovie');
            window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
        });
    }

    const downloadTwitterButton = document.getElementById('download-twitter');
    if (downloadTwitterButton) {
        downloadTwitterButton.addEventListener('click', () => {
            downloadImage('https://freemovieir.github.io/images/story.png', 'freemovie-twitter-support.jpg');
        });
    }

    const downloadInstagramButton = document.getElementById('download-instagram');
    if (downloadInstagramButton) {
        downloadInstagramButton.addEventListener('click', () => {
            downloadImage('https://freemovieir.github.io/images/tweet.png', 'freemovie-instagram-support.jpg');
        });
    }

    popup.addEventListener('click', (event) => {
        if (event.target === popup) popup.classList.add('hidden');
    });
}

function manageFabButton() {
    const fab = document.getElementById('fab');
    const fabOptions = document.getElementById('fabOptions');
    if (!fab || !fabOptions) return;

    fab.addEventListener('click', (event) => {
        event.stopPropagation();
        fabOptions.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
        if (!fab.contains(event.target) && !fabOptions.contains(event.target)) {
            fabOptions.classList.add('hidden');
        }
    });
}

function manageThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    if (!themeToggle) return;

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark');
        const isDark = body.classList.contains('dark');
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        body.classList.remove('dark');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchGenres();
    manageDisclaimerNotice();
    manageSupportPopup();
    manageFabButton();
    manageThemeToggle();
});