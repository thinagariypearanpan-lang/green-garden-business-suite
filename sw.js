const CACHE_NAME = "ggbs-v1-3-lts-roles-permissions";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./js/app.js",
  "./firebase/firebase-config.js",
  "./manifest.json",
  "./favicon.png",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./assets/images/ggm-logo.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
