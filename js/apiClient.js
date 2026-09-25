(function (window) {
    const config = window.FreeMovieConfig || {};
    const directSameOriginPaths = [/^\/[^/]/, /^\.\.?\//];
    const CACHE_PREFIX = 'fmc_';
    const DEFAULT_CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours

    function proxify(url) {
        return `${config.proxyBaseUrl}?url=${encodeURIComponent(url)}`;
    }

    function shouldProxy(url) {
        if (!url || directSameOriginPaths.some(pattern => pattern.test(url))) {
            return false;
        }

        try {
            const parsedUrl = new URL(url, window.location.href);
            return parsedUrl.origin !== window.location.origin;
        } catch (error) {
            return false;
        }
    }

    function getFromCache(key) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (Date.now() > parsed.exp) {
                localStorage.removeItem(CACHE_PREFIX + key);
                return null;
            }
            return parsed.val;
        } catch (e) {
            return null;
        }
    }

    function saveToCache(key, val, ttlMs = DEFAULT_CACHE_TTL) {
        try {
            const item = {
                val: val,
                exp: Date.now() + ttlMs
            };
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
        } catch (e) {
            try {
                // پاک‌سازی کش‌های منقضی در صورت پر شدن حافظه
                const now = Date.now();
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(CACHE_PREFIX)) {
                        try {
                            const p = JSON.parse(localStorage.getItem(k));
                            if (!p || now > p.exp) localStorage.removeItem(k);
                        } catch (err) {
                            localStorage.removeItem(k);
                        }
                    }
                }
            } catch (err) {}
        }
    }

    async function fetchWithTimeout(url, options = {}) {
        const timeoutMs = options.timeoutMs || config.requestTimeoutMs || 12000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const { timeoutMs: _timeoutMs, ...fetchOptions } = options;

        try {
            return await fetch(url, {
                ...fetchOptions,
                signal: fetchOptions.signal || controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
    }

    async function request(url, options = {}) {
        const useCache = options.cache !== false && (!options.method || options.method.toUpperCase() === 'GET');
        if (useCache) {
            const cached = getFromCache(url);
            if (cached !== null) {
                return new Response(JSON.stringify(cached), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
                });
            }
        }

        const retries = Number.isInteger(options.retries) ? options.retries : (config.requestRetries || 0);
        const finalUrl = shouldProxy(url) ? proxify(url) : url;
        let lastError;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetchWithTimeout(finalUrl, options);
                if (!response.ok && response.status >= 500 && attempt < retries) {
                    continue;
                }
                if (response.ok && useCache) {
                    try {
                        const clone = response.clone();
                        clone.json().then(data => {
                            if (data) saveToCache(url, data, options.cacheTtlMs || DEFAULT_CACHE_TTL);
                        }).catch(() => {});
                    } catch (e) {}
                }
                return response;
            } catch (error) {
                lastError = error;
                if (attempt >= retries) {
                    break;
                }
            }
        }

        throw lastError || new Error('Request failed.');
    }

    async function json(url, options = {}) {
        const response = await request(url, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    }

    window.FreeMovieApi = {
        proxify,
        request,
        json,
        getFromCache,
        saveToCache,
        tmdbUrl(path, params = {}) {
            const searchParams = new URLSearchParams({
                api_key: config.tmdbApiKey,
                language: config.defaultLanguage,
                ...params
            });

            return `https://api.themoviedb.org/3/${path.replace(/^\/+/, '')}?${searchParams.toString()}`;
        }
    };
})(window);
