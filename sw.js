/* Aureum — shell PWA, recursos estáticos e sincronização offline. */
const STATIC_CACHE = "aureum-static-v6";
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const scopedPath = (path = "") => `${SCOPE_PATH}/${path.replace(/^\//, "")}`;
const APP_SHELL = [
  scopedPath(),
  scopedPath("manifest.webmanifest"),
  scopedPath("favicon.png"),
  scopedPath("icon-192.png"),
  scopedPath("icon-512.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("aureum-static-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match(scopedPath(), { ignoreSearch: true });
        return shell || Response.error();
      }),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith(scopedPath("assets/")) ||
    url.pathname.startsWith(scopedPath("@id/")) ||
    url.pathname === scopedPath("manifest.webmanifest") ||
    url.pathname === scopedPath("favicon.png") ||
    url.pathname.startsWith(scopedPath("icon-"));
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "aureum-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: "SYNC_OFFLINE_QUEUE" });
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type !== "CLEAR_PRIVATE_CACHE") return;
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("aureum-private-")).map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Aureum", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Aureum", {
      body: payload.body || "",
      icon: scopedPath("icon-192.png"),
      badge: scopedPath("icon-192.png"),
      tag: payload.tag || undefined,
      data: { url: payload.url || scopedPath("hoje") },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || scopedPath("hoje");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
