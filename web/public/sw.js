// 6S PWA Service Worker
const CACHE_NAME = "6s-cache-v3";
const NAVIGATION_TIMEOUT_MS = 3000;
const STATIC_PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Cache API only accepts http(s) requests; browser extensions can emit other schemes.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // Bypass API, uploads, and cert routes - handled by app sync / network
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/uploads/") ||
    url.pathname.startsWith("/cert/")
  ) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
        try {
          return await fetch(event.request, { signal: controller.signal });
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match("/index.html");
          return cached || Response.error();
        } finally {
          clearTimeout(timeout);
        }
      })(),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/");
  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200 && event.request.method === "GET") {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        });
      }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.method === "GET") {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      }),
  );
});
