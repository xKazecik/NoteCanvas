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

// How long the network may take before a cached shell is served instead. The
// fetch keeps going and still refreshes the cache for next time.
const NETWORK_TIMEOUT_MS = 4000;
const isGatewayError = (response) =>
  response.status === 502 || response.status === 503 || response.status === 504;

// Network first, so upgrades and config changes show up at once. When the
// server is down (no answer, or the proxy in front of it says so) the cached
// shell is served, after at most NETWORK_TIMEOUT_MS.
const networkFirst = (request, cacheKey) =>
  caches.match(cacheKey).then((cached) => {
    const network = fetch(request).then((response) => {
      if (isGatewayError(response) && cached) throw new Error("gateway error");
      return putInCache(cacheKey, response);
    });
    if (!cached) return network.catch(() => Response.error());
    network.catch(() => undefined); // may fail after the timeout already won
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS),
    );
    return Promise.race([network, timeout]).catch(() => cached);
  });

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
