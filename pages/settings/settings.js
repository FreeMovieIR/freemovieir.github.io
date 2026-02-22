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
        statusMessage.className = 'text-green-500';
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
            statusMessage.textContent = 'توکن‌ها با موفقیت ذخیره شدند!';
            statusMessage.className = 'text-green-500';
            
            // نمایش هشدار تأییدیه
            alert('✅ توکن با موفقیت ثبت شد!\nاز این به بعد سرعت جستجو تا ۹۰٪ افزایش یافته است!');
        } else {
            statusMessage.textContent = 'لطفاً حداقل توکن OMDB را وارد کنید.';
            statusMessage.className = 'text-red-500';
        }
    });

    // حذف توکن‌ها
    clearButton.addEventListener('click', () => {
        localStorage.removeItem('userOmdbToken');
        localStorage.removeItem('userTmdbToken');
        omdbTokenInput.value = '';
        tmdbTokenInput.value = '';
        statusMessage.textContent = 'تمامی توکن‌ها حذف شدند.';
        statusMessage.className = 'text-yellow-500';
        alert('تمامی توکن‌ها با موفقیت حذف شدند.');
    });
});