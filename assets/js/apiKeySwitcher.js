class ApiKeySwitcher {
    constructor(config = {}) {
        this.services = config || {}; // { omdb: { keys: [], currentIndex: 0, userToken: "" }, fanart: { ... } }
    }

    getService(serviceName) {
        if (!this.services[serviceName]) {
            const savedIndex = parseInt(localStorage.getItem(`apiKeyIndex_${serviceName}`)) || 0;
            this.services[serviceName] = {
                keys: [],
                currentIndex: savedIndex,
                userToken: localStorage.getItem(`user${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}Token`)
            };
        }
        return this.services[serviceName];
    }

    getCurrentKey(serviceName) {
        const s = this.getService(serviceName);
        if (s.userToken) {
            return s.userToken;
        }
        if (!s.keys || s.keys.length === 0) {
            return null;
        }
        return s.keys[s.currentIndex];
    }

    switchToNextKey(serviceName) {
        const s = this.getService(serviceName);
        if (s.userToken || !s.keys || s.keys.length === 0) return;
        s.currentIndex = (s.currentIndex + 1) % s.keys.length;
        localStorage.setItem(`apiKeyIndex_${serviceName}`, s.currentIndex);
        console.log(`[${serviceName}] تعویض به کلید جدید: ${this.getCurrentKey(serviceName)}`);
    }

    async fetchWithKeySwitch(urlTemplate, serviceName = 'omdb', maxRetriesPerKey = 2) {
        let attempts = 0;
        const s = this.getService(serviceName);
        const totalAttemptsLimit = s.userToken ? maxRetriesPerKey : (s.keys.length || 1) * maxRetriesPerKey;

        while (attempts < totalAttemptsLimit) {
            const key = this.getCurrentKey(serviceName);
            if (!key) throw new Error(`هیچ کلیدی برای سرویس ${serviceName} یافت نشد`);

            const url = urlTemplate(key);
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 429) {
                        console.warn(`[${serviceName}] محدودیت نرخ API - تلاش مجدد...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        attempts++;
                        continue;
                    }
                    throw new Error(`خطای سرور (${serviceName}): ${response.status}`);
                }
                const data = await response.json();

                // Success! If we are multi-key, reward this key by keeping its index
                if (!s.userToken && s.keys.length > 0) {
                    localStorage.setItem(`apiKeyIndex_${serviceName}`, s.currentIndex);
                }

                // Special check for OMDB "False" response
                if (serviceName === 'omdb' && data.Response === 'False') {
                    throw new Error(data.Error || 'فیلم یافت نشد');
                }
                return data;
            } catch (error) {
                console.warn(`[${serviceName}] خطا در درخواست: ${error.message}`);
                attempts++;
                if (!s.userToken && attempts % maxRetriesPerKey === 0) {
                    this.switchToNextKey(serviceName);
                }
                const delay = error.message.includes('429') ? 1000 : 200;
                await new Promise(resolve => setTimeout(resolve, delay));
                if (attempts >= totalAttemptsLimit) {
                    throw new Error(`تمام تلاش‌ها برای ${serviceName} ناموفق بود.`);
                }
            }
        }
    }
}

async function loadApiKeys() {
    const switcher = new ApiKeySwitcher();

    // Load OMDB Keys
    const omdbPaths = ['/assets/js/config/omdbKeys.json', '../../assets/js/config/omdbKeys.json'];
    for (const path of omdbPaths) {
        try {
            const res = await fetch(path);
            if (res.ok) {
                const keys = await res.json();
                switcher.services.omdb = { keys, currentIndex: 0, userToken: localStorage.getItem('userOmdbToken') };
                break;
            }
        } catch (e) { }
    }

    // Initialize OMDB if not loaded
    if (!switcher.services.omdb || switcher.services.omdb.keys.length === 0) {
        const savedIndex = parseInt(localStorage.getItem('apiKeyIndex_omdb')) || 0;
        switcher.services.omdb = {
            keys: [window.CONFIG ? window.CONFIG.OMDB_DEFAULT_KEY : '38fa39d5'],
            currentIndex: savedIndex,
            userToken: localStorage.getItem('userOmdbToken')
        };
    }

    return switcher;
}