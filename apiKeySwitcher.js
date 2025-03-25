class ApiKeySwitcher {
    constructor(keys = []) {
        if (!Array.isArray(keys) || keys.length === 0) {
            console.warn('هیچ کلید API در دسترس نیست، استفاده از کلید پیش‌فرض.');
            this.keys = ['38fa39d5'];
        } else {
            this.keys = keys;
        }
        this.currentIndex = 0;
    }

    getCurrentKey() {
        return this.keys[this.currentIndex];
    }

    switchToNextKey() {
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        console.log(`تعویض به کلید API جدید: ${this.getCurrentKey()}`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchWithKeySwitch(urlTemplate, maxRetriesPerKey = 3, delayMs = 1000) {
        let attempts = 0;
        const totalAttemptsLimit = this.keys.length * maxRetriesPerKey;

        while (attempts < totalAttemptsLimit) {
            const url = urlTemplate(this.getCurrentKey());
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 429) {
                        console.warn('محدودیت نرخ OMDB API - تلاش مجدد با همین کلید...');
                        await this.sleep(delayMs);
                        attempts++;
                        continue;
                    }
                    throw new Error(`خطای سرور (OMDB): ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.warn(`خطا در درخواست با کلید ${this.getCurrentKey()}: ${error.message}`);
                attempts++;
                if (attempts % maxRetriesPerKey === 0) {
                    this.switchToNextKey();
                }
                await this.sleep(delayMs);
            }
        }
        throw new Error('تمام کلیدهای API امتحان شدند و خطا ادامه دارد.');
    }
}

async function loadApiKeys() {
    const possiblePaths = [
        '/freemovie/omdbKeys.json',
        '/freemovie/../omdbKeys.json'
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

    console.error('هیچ فایل کلید API پیدا نشد، استفاده از کلید پیش‌فرض.');
    return new ApiKeySwitcher(['38fa39d5']);
}
