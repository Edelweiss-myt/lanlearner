const CACHE_NAME = 'lanlearner-cache-v1.4'; // Increment version for updates
const urlsToCache = [
  '/', // This will be the index.html in the root of the 'dist' folder after build
  '/index.html', // Explicitly cache index.html
  '/manifest.json',
  // Icons are in public/icons, Vite copies them to dist/icons
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  // Vite generates JS/CSS assets with hashes in their filenames (e.g., index-a1b2c3d4.js).
  // These are best cached by a more sophisticated SW, often generated by a Vite PWA plugin.
  // For this basic setup, we focus on caching the main HTML (app shell) and explicit public assets.
  // The browser's HTTP cache will handle the hashed assets efficiently.
];

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install Event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell and public assets');
        // Add all URLs, but don't fail install if some minor ones (like icons not yet created) fail
        const promises = urlsToCache.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`[ServiceWorker] Failed to cache ${url}: ${err}`);
          });
        });
        return Promise.all(promises);
      })
      .then(() => {
        console.log('[ServiceWorker] Skip waiting on install');
        return self.skipWaiting(); // Activate new SW immediately
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate Event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('[ServiceWorker] Claiming clients');
        return self.clients.claim(); // Take control of open clients
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  // For navigation (HTML pages), try network first, then cache.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If we get a valid response, cache it (especially if it's the main HTML)
           if (response && response.status === 200 && response.type === 'basic' && (event.request.url.endsWith('/') || event.request.url.endsWith('/index.html')) ) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try to serve from cache
          return caches.match(event.request)
            .then(cachedResponse => {
              return cachedResponse || caches.match('/'); // Fallback to root
            });
        })
    );
    return;
  }

  // For other assets (JS, CSS, images from urlsToCache), use a Cache-first strategy.
  // This is primarily for assets explicitly listed in urlsToCache (from the public folder).
  // Vite's hashed assets are generally handled by the browser's HTTP cache due to their unique names.
  const requestUrlPath = new URL(event.request.url).pathname;
  if (urlsToCache.includes(requestUrlPath)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then(
            networkResponse => {
              if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(event.request, responseToCache);
                  });
              }
              return networkResponse;
            }
          );
        })
    );
    return;
  }
  
  // For all other requests (including Vite's hashed assets not in urlsToCache),
  // let the browser handle them (network or HTTP cache).
  // This prevents the service worker from interfering with Vite's asset loading.
  // console.log('[ServiceWorker] Letting browser handle fetch for:', event.request.url);
  return; 
});