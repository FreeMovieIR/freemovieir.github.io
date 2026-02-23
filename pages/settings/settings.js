document.addEventListener('DOMContentLoaded', () => {
    const omdbTokenInput = document.getElementById('omdb-token');
    const tmdbTokenInput = document.getElementById('tmdb-token');
    const saveButton = document.getElementById('save-token');
    const clearButton = document.getElementById('clear-token');
    const statusMessage = document.getElementById('status-message');

    // بارگذاری توکن‌های ذخیره‌شده
    const savedOmdbToken = localStorage.getItem('userOmdbToken');
    const savedTmdbToken = localStorage.getItem('userTmdbToken');

    if (savedOmdbToken) {
        omdbTokenInput.value = savedOmdbToken;
        statusMessage.textContent = 'توکن OMDB شما قبلاً ذخیره شده است.';
        statusMessage.className = 'text-amber-500 font-bold';
    }

    if (savedTmdbToken) {
        tmdbTokenInput.value = savedTmdbToken;
    }

    // ذخیره توکن‌ها
    saveButton.addEventListener('click', () => {
        const omdbToken = omdbTokenInput.value.trim();
        const tmdbToken = tmdbTokenInput.value.trim();

        if (omdbToken) {
            localStorage.setItem('userOmdbToken', omdbToken);

            if (tmdbToken) {
                localStorage.setItem('userTmdbToken', tmdbToken);
            } else {
                localStorage.removeItem('userTmdbToken');
            }

            // نمایش پیام موفقیت
            statusMessage.textContent = 'تغییرات با موفقیت ذخیره شد!';
            statusMessage.className = 'text-green-500 font-bold';

            if (window.showToast) {
                window.showToast('تنظیمات با موفقیت ذخیره شد!', 'success');
            }
        } else {
            statusMessage.textContent = 'لطفاً حداقل توکن OMDB را وارد کنید.';
            statusMessage.className = 'text-red-500 font-bold';
            if (window.showToast) {
                window.showToast('لطفاً توکن OMDB را وارد کنید', 'info');
            }
        }
    });

    // حذف توکن‌ها
    clearButton.addEventListener('click', () => {
        localStorage.removeItem('userOmdbToken');
        localStorage.removeItem('userTmdbToken');
        omdbTokenInput.value = '';
        tmdbTokenInput.value = '';
        statusMessage.textContent = 'تمامی توکن‌ها حذف شدند.';
        statusMessage.className = 'text-yellow-500 font-bold';
        if (window.showToast) {
            window.showToast('حافظه پاکسازی شد', 'info');
        }
    });
});