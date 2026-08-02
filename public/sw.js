const CACHE_NAME = "vinema-shell-v3";
const SHELL_ASSETS = [
  "/",
  "/login",
  "/register",
  "/notes",
  "/notes/archive",
  "/notes/detail",
  "/contexts/areas",
  "/contexts/projects",
  "/contexts/people",
  "/contexts/detail",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith("/auth") ||
    requestUrl.pathname.startsWith("/api")
  ) {
    return;
  }

  if (requestUrl.origin === self.location.origin && requestUrl.pathname === "/search") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/notes").then((cachedResponse) => cachedResponse || caches.match("/")),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match("/")),
      ),
  );
});
