// App-shell cache for offline mode: after the first visit the app itself loads
// without a connection, and offline boards come from IndexedDB. API calls,
// sockets and uploads always go to the network; they are never cached here.
//
// Registered as /sw.js?v=<app version>, so each release gets a fresh cache and
// the previous one is deleted on activation.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `notecanvas-shell-${VERSION}`;
const SHELL = ["/", "/env.js", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("notecanvas-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const putInCache = (key, response) => {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(key, copy));
  }
  return response;
};

// Network first, so upgrades and config changes show up at once.
const networkFirst = (request, cacheKey) =>
  fetch(request)
    .then((response) => putInCache(cacheKey, response))
    .catch(() =>
      caches.match(cacheKey).then((cached) => cached || Response.error()),
    );

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) {
    return;
  }

  // Every route is the same single-page shell.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }
  if (url.pathname === "/env.js") {
    event.respondWith(networkFirst(request, "/env.js"));
    return;
  }

  // Hashed bundles, fonts and icons never change under the same URL: serve
  // them from the cache, filling it the first time each one is used.
  event.respondWith(
    caches
      .match(request)
      .then((cached) => cached || fetch(request).then((r) => putInCache(request, r))),
  );
});
