// Offline support: keeps a copy of the whole app on the phone so it opens
// and works with no signal. Bump VERSION whenever any app file changes so
// phones pick up the new version the next time they're online.

const VERSION = 'drywall-count-v1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/choices.js',
  'js/lib.js',
  'js/model.js',
  'js/sheet.js',
  'js/state.js',
  'js/ui.js',
  'js/screens/drywall.js',
  'js/screens/home.js',
  'js/screens/job.js',
  'js/screens/review.js',
  'js/screens/screws.js',
  'js/screens/send.js',
  'js/screens/site.js',
  'vendor/jspdf.umd.min.js',
  'vendor/preact-htm.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // address lookup etc. go straight to the network

  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
