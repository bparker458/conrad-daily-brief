/* Conrad Daily Brief — service worker.
   Offline-tolerant READ cache only:
   - shell + static assets: cache-first
   - /api/tasks, /api/areas, /api/progress GETs: network-first, cached copy as fallback
   - writes (POST/PATCH) are NEVER cached or faked here; the app queues and
     retries them itself, and "Saved" only fires on a confirmed server write. */

/* VERSION is stamped per build by scripts/stamp-sw.mjs. It MUST change on
   every deploy. Next emits new /_next/static chunk hashes each build and
   Netlify 404s the previous ones, so a cache that outlives its deploy holds a
   shell whose scripts no longer exist. That is a blank page, and it is what
   happened on 2026-09-20: the 09-14 deploy changed every chunk hash while
   VERSION sat at "cb-v2" from 09-11, so activate never purged the old shell
   and app/page-a6b632811c80f1c5.js went 404. Do not hard-code it again. */
const VERSION = "cb-dev";
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
          // Cache each page under its own path. Caching every page as "/"
          // meant an offline open of the home screen could show /done.
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/")))
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
