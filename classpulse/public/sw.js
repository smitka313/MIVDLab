/* ClassPulse service worker
 *
 * Makes ClassPulse installable and lets the app shell open without a network.
 * Privacy: it caches ONLY same-origin application code, page shells and icons.
 * It never intercepts or caches Supabase/API traffic (other origins) or auth
 * routes, so no student records are ever written to the service-worker cache.
 * (Pages are rendered in the browser after sign-in; their HTML holds no records.)
 */
const VERSION = "classpulse-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png", "/brand/classpulse-mark.svg", "/brand/classpulse-mark-reverse.svg", "/brand/classpulse-app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-caches") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

function cacheable(response) {
  return response && response.ok && response.type === "basic" && !response.redirected;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and anything else: straight to network
  if (url.pathname.startsWith("/auth/") || url.pathname === "/sw.js") return;

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (cacheable(res)) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network first (always fresh), fall back to the last copy, then an offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res) && !["/login", "/signup"].includes(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/offline.html"))),
    );
  }
});
