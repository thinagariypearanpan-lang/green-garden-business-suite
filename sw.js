const CACHE_NAME="ggbs-v1-2-beta-fixed";
const FILES_TO_CACHE=["./","./index.html","./js/app.js","./firebase/firebase-config.js","./manifest.json","./favicon.png","./favicon.ico","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./assets/images/ggm-logo.png"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(FILES_TO_CACHE)))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null))));self.clients.claim()});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
