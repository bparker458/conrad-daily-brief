/* Conrad Daily Brief — service worker.
   Offline-tolerant READ cache only:
   - shell + static assets: cache-first
   - /api/tasks, /api/areas, /api/progress GETs: network-first, cached copy as fallback
   - writes (POST/PATCH) are NEVER cached or faked here; the app queues and
     retries them itself, and "Saved" only fires on a confirmed server write. */

const VERSION = "cb-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-180.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CACHEABLE_API = /^\/api\/(tasks|areas|progress)(\?|$)/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Session endpoint is never cached.
  if (url.pathname.startsWith("/api/session")) return;

  // Read APIs: network-first with cache fallback so a brief network drop
  // still shows the last-loaded list.
  if (CACHEABLE_API.test(url.pathname + url.search)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Other API GETs (health, google): network only.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
