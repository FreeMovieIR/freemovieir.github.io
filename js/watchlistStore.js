// js/watchlistStore.js
// Single source of truth for Watchlist across FreeMovie
(function (window) {
    const STORAGE_KEY = 'watchlist';

    function getWatchlist() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : {};
            return {
                movies: Array.isArray(data.movies) ? data.movies : [],
                series: Array.isArray(data.series) ? data.series : []
            };
        } catch (e) {
            return { movies: [], series: [] };
        }
    }

    function saveWatchlist(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('watchlist:changed', { detail: list }));
        } catch (e) {
            console.error('Watchlist save error:', e);
        }
    }

    function has(id, type) {
        const list = getWatchlist();
        const normId = String(id);
        const arr = type === 'series' ? list.series : list.movies;
        return arr.some(item => String(item) === normId);
    }

    function toggle(id, type) {
        const list = getWatchlist();
        const normId = String(id);
        const targetArr = type === 'series' ? list.series : list.movies;
        const index = targetArr.findIndex(item => String(item) === normId);
        let added = false;

        if (index > -1) {
            targetArr.splice(index, 1);
            added = false;
        } else {
            targetArr.push(type === 'series' ? normId : Number(normId) || normId);
            added = true;
        }

        saveWatchlist(list);
        return added;
    }

    function remove(id, type) {
        const list = getWatchlist();
        const normId = String(id);
        const targetArr = type === 'series' ? list.series : list.movies;
        const index = targetArr.findIndex(item => String(item) === normId);
        if (index > -1) {
            targetArr.splice(index, 1);
            saveWatchlist(list);
            return true;
        }
        return false;
    }

    window.WatchlistStore = {
        get: getWatchlist,
        has: has,
        toggle: toggle,
        remove: remove
    };
})(window);
