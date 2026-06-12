const CACHE = "spritz-v2";
const ASSETS = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (
    e.request.method === "POST" &&
    url.pathname === "/" &&
    e.request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")
  ) {
    e.respondWith(
      e.request
        .formData()
        .then((fd) => {
          const sharedUrl = fd.get("url") || fd.get("text") || "";
          return Response.redirect("/?url=" + encodeURIComponent(sharedUrl), 303);
        })
        .catch((err) => {
          console.error("[sw] share target formData failed:", err);
          return Response.redirect("/", 303);
        })
    );
    return;
  }

  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).catch((err) => {
        console.error("[sw] fetch failed:", e.request.url, err);
        return new Response("Network error", { status: 503, statusText: "Service Unavailable" });
      });
    })
  );
});
