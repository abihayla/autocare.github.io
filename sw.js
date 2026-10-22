/* ==========================================================================
   AutoCare MY Pro — Production Offline-First Service Worker (sw.js)
   Direka khas untuk GitHub Pages / HTTPS & Cold Startup Offline + GPS
   ========================================================================== */
const CACHE_NAME = 'autocare-my-offline-v2026';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// 1. INSTALL: Simpan semua fail teras ke dalam CacheStorage untuk Cold Startup Offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        OFFLINE_ASSETS.map((url) => cache.add(url).catch(() => null))
      );
    })
  );
  self.skipWaiting();
});

// 2. ACTIVATE: Bersihkan cache versi lama & ambil alih kawalan halaman serta-merta
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
      )
    )
  );
  self.clients.claim();
});

// 3. FETCH: Strategi Cache-First dengan kemas kini latar belakang (Stale-While-Revalidate)
//    Memastikan aplikasi boleh dibuka 100% tanpa internet (termasuk ?autostart=1)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const reqUrl = new URL(event.request.url);

  // Abaikan panggilan API luaran dinamik (OSRM / Nominatim / IP Geolocation) supaya aplikasi mengendalikan fallback offline sendiri
  if (
    reqUrl.hostname.includes('project-osrm.org') ||
    reqUrl.hostname.includes('openstreetmap.org') && reqUrl.pathname.includes('reverse') ||
    reqUrl.hostname.includes('ipwho.is') ||
    reqUrl.hostname.includes('ipapi.co') ||
    reqUrl.hostname.includes('geojs.io')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Jika navigasi halaman gagal semasa offline, pulangkan ./index.html dari cache
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. PERIODIC SYNC: Kejutkan penyegerakan GPS latar belakang jika disokong pelayar
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'autocare-gps-sync') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'BG_WAKE_SYNC' }));
      })
    );
  }
});