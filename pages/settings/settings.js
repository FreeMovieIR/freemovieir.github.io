document.addEventListener('DOMContentLoaded', () => {
    const omdbTokenInput = document.getElementById('omdb-token');
    const tmdbTokenInput = document.getElementById('tmdb-token');
    const fanartTokenInput = document.getElementById('fanart-token');
    const saveButton = document.getElementById('save-token');
    const clearButton = document.getElementById('clear-token');
    const statusMessage = document.getElementById('status-message');

    // بارگذاری توکن‌های ذخیره‌شده
    const savedOmdbToken = localStorage.getItem('userOmdbToken');
    const savedTmdbToken = localStorage.getItem('userTmdbToken');
    const savedFanartToken = localStorage.getItem('userFanartToken');

    if (savedOmdbToken) {
        omdbTokenInput.value = savedOmdbToken;
        statusMessage.textContent = 'توکن‌های شما بارگذاری شدند.';
        statusMessage.className = 'text-amber-500 font-bold';
    }

    if (savedTmdbToken) tmdbTokenInput.value = savedTmdbToken;
    if (savedFanartToken) fanartTokenInput.value = savedFanartToken;

    // ذخیره توکن‌ها
    saveButton.addEventListener('click', () => {
        const omdbToken = omdbTokenInput.value.trim();
        const tmdbToken = tmdbTokenInput.value.trim();
        const fanartToken = fanartTokenInput.value.trim();

        if (omdbToken) {
            localStorage.setItem('userOmdbToken', omdbToken);

            if (tmdbToken) localStorage.setItem('userTmdbToken', tmdbToken);
            else localStorage.removeItem('userTmdbToken');

            if (fanartToken) localStorage.setItem('userFanartToken', fanartToken);
            else localStorage.removeItem('userFanartToken');

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
        localStorage.removeItem('userFanartToken');
        omdbTokenInput.value = '';
        tmdbTokenInput.value = '';
        fanartTokenInput.value = '';
        statusMessage.textContent = 'تمامی توکن‌ها حذف شدند.';
        statusMessage.className = 'text-yellow-500 font-bold';
        if (window.showToast) {
            window.showToast('حافظه پاکسازی شد', 'info');
        }
    });
});