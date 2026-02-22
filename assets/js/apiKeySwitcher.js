class ApiKeySwitcher {
    constructor(keys) {
        this.keys = keys || [];
        this.currentIndex = 0;
        this.userToken = localStorage.getItem('userOmdbToken'); // توکن کاربر
    }

    getCurrentKey() {
        if (this.userToken) {
            console.log('استفاده از توکن کاربر:', this.userToken);
            return this.userToken; // اولویت با توکن کاربر
        }
        if (this.keys.length === 0) {
            throw new Error('هیچ کلید API در دسترس نیست.');
        }
        return this.keys[this.currentIndex];
    }

    switchToNextKey() {
        if (this.userToken) {
            console.log('توکن کاربر استفاده می‌شود، تعویض کلید غیرفعال است.');
            return; // اگر توکن کاربر باشد، تعویض کلید غیرفعال است
        }
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        console.log(`تعویض به کلید API جدید: ${this.getCurrentKey()}`);
    }

    async fetchWithKeySwitch(urlTemplate, maxRetriesPerKey = 3) {
        let attempts = 0;
        const totalAttemptsLimit = this.userToken ? maxRetriesPerKey : this.keys.length * maxRetriesPerKey;

        while (attempts < totalAttemptsLimit) {
            const url = urlTemplate(this.getCurrentKey());
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 429) {
                        console.warn('محدودیت نرخ OMDB API - تلاش مجدد...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        attempts++;
                        continue;
                    }
                    throw new Error(`خطای سرور (OMDB): ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.warn(`خطا در درخواست با کلید ${this.getCurrentKey()}: ${error.message}`);
                attempts++;
                if (!this.userToken && attempts % maxRetriesPerKey === 0) {
                    this.switchToNextKey();
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (attempts >= totalAttemptsLimit) {
                    throw new Error('تمام تلاش‌ها ناموفق بود.');
                }
            }
        }
    }
}

async function loadApiKeys() {
    const possiblePaths = [
        '//assets/js/config/omdbKeys.json',
        '/..//assets/js/config/omdbKeys.json'
    ];

    for (const path of possiblePaths) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                console.warn(`خطا در بارگذاری از ${path}: ${response.status}`);
                continue;
            }
            const keys = await response.json();
            console.log(`فایل کلیدها از ${path} با موفقیت بارگذاری شد.`);
            return new ApiKeySwitcher(keys);
        } catch (error) {
            console.warn(`خطا در مسیر ${path}: ${error.message}`);
        }
    }

    console.error('هیچ فایل کلید API پیدا نشد.');
    return new ApiKeySwitcher(['38fa39d5']); // کلید پیش‌فرض
}