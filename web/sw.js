const CACHE_NAME = 'videocreator-v4.0';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// Network-first policy: NEVER cache API calls, scripts, or dynamic audio assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Exclude API calls, scripts, and audio from cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/scripts/') || url.pathname.includes('yt_cache_')) {
    return; // Pass directly to network
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
