/* Conrad Command Dashboard — service worker.

   Offline tolerant READ cache only:
   - shell + static assets: cache-first
   - /api/dashboard, /api/tasks, /api/areas, /api/progress GETs:
     network-first, cached copy as a LABELLED fallback
   - writes (POST/PATCH) are NEVER cached or faked here; the app queues
     and retries them itself, and "Saved" only fires on a confirmed
     server write.

   The important rule: when this worker serves a cached copy because the
   network failed, it stamps the response with `x-from-cache: 1`. The
   dashboard reads that header and puts an "offline copy" banner at the
   top with the age of the data. A silent stale render is exactly the
   failure this app exists to stop, and it would otherwise happen right
   here, where the app cannot see it. */

const VERSION = "cb-v2";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-180.png",
];

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

const CACHEABLE_API = /^\/api\/(dashboard|tasks|areas|progress)(\?|$)/;

/** Re-wrap a cached response so the app can tell it is not live. */
async function labelled(res) {
  if (!res) return undefined;
  const body = await res.blob();
  const headers = new Headers(res.headers);
  headers.set("x-from-cache", "1");
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Session endpoint is never cached.
  if (url.pathname.startsWith("/api/session")) return;

  // Read APIs: network-first, labelled cache fallback.
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
        .catch(() => caches.match(req).then(labelled))
    );
    return;
  }

  // Other API GETs (health, mail, calendar, signals, events): network only.
  // These must never come from a cache — a stale connector read is worse
  // than an honest failure.
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
          if (
            res.ok &&
            (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
          ) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
