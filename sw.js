// LWH Inventory Lookup & Label Printer — Service Worker
// Caches the app shell only. Data always comes fresh from GAS over the
// hotspot connection — we never cache inventory data here.

const CACHE_NAME = 'lwh-label-printer-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/JsBarcode.all.min.js',
  './vendor/qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache/intercept calls to the Apps Script backend — that needs
  // to always hit the network for fresh data.
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('script.googleusercontent.com')) {
    return;
  }

  // Network-first for the HTML page itself (index.html / navigations).
  // This means: online → you always get the latest code immediately,
  // no stale-cache surprises after a deploy. Offline → falls back to
  // whatever was last cached, so the app still opens with no signal.
  const isHtmlRequest = event.request.mode === 'navigate' ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('/');

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (icons, vendor libs, manifest) —
  // these change rarely, and a CACHE_NAME bump forces a clean refresh
  // of all of them whenever they do change.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
