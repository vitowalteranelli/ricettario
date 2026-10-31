const CACHE_NAME = 'ricettario-shell-v11';
const OFFLINE_DATA_CACHE_NAME = 'ricettario-offline-data-v1';
const ACTIVE_CACHE_NAMES = [CACHE_NAME, OFFLINE_DATA_CACHE_NAME];
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './fonts/DancingScript-Regular.ttf',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

function isOfflineData(url) {
  return url.origin === self.location.origin && (
    url.pathname.endsWith('/config.json') ||
    (url.pathname.includes('/datasets/') && url.pathname.endsWith('.json'))
  );
}

function isAlwaysNetworkData(url) {
  return url.origin === self.location.origin && url.pathname.includes('/prompts/');
}

function stableRequestKey(url) {
  return new Request(new URL(url.pathname, self.location.origin).href, { method: 'GET' });
}

async function networkFirstOfflineData(request, url) {
  const cache = await caches.open(OFFLINE_DATA_CACHE_NAME);
  const key = stableRequestKey(url);
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
  if (response.ok) {
    try { await cache.put(key, response.clone()); } catch { /* La risposta di rete resta utilizzabile se la cache è piena. */ }
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !ACTIVE_CACHE_NAMES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (isOfflineData(url)) {
    event.respondWith(networkFirstOfflineData(request, url));
    return;
  }

  if (isAlwaysNetworkData(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
