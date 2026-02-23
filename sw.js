const CACHE_NAME = 'freemovie-pwa-v2'; // Bump version
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/assets/js/apiKeySwitcher.js',
  '/assets/js/components/layout-shared.js',
  '/assets/icons/favicon.ico',
  '/images/default-freemovie-300.png'
];

const API_CACHE_NAME = 'freemovie-api-cache';
const IMAGE_CACHE_NAME = 'freemovie-image-cache';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => {
        return Promise.all(keys.map(key => {
          if (key !== CACHE_NAME && key !== API_CACHE_NAME && key !== IMAGE_CACHE_NAME) {
            return caches.delete(key);
          }
        }));
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Static Assets: Cache-First
  if (STATIC_ASSETS.includes(url.pathname) || url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(response => {
        return response || fetch(request).then(fetchRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(request, fetchRes.clone());
            return fetchRes;
          });
        });
      })
    );
    return;
  }

  // 2. Images (TMDB, OMDB, TVMaze): Cache-First, then Network
  if (request.destination === 'image' || url.hostname.includes('tmdb.org') || url.hostname.includes('omdbapi.com')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(cache => {
        return cache.match(request).then(response => {
          return response || fetch(request).then(fetchRes => {
            cache.put(request, fetchRes.clone());
            return fetchRes;
          });
        });
      })
    );
    return;
  }

  // 3. API Requests: Stale-While-Revalidate
  if (url.hostname.includes('api.themoviedb.org') || url.pathname.includes('omdb')) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(cache => {
        return cache.match(request).then(cachedResponse => {
          const fetchPromise = fetch(request).then(networkResponse => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 4. Default: Network with Cache Fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
