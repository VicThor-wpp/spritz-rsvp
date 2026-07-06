const CACHE = "pivot-v9";

// --- IndexedDB (shared with the page: same origin, same database) ---------
const DB_NAME = "pivot";
const DB_STORE = "books";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutBook(book) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(book);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
const ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

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

  if (e.request.method === "POST" && url.pathname === "/share-target") {
    e.respondWith(handleShareTarget(e.request));
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

async function handleShareTarget(request) {
  try {
    const fd = await request.formData();
    const file = fd.get("file");
    const text = (fd.get("text") || "").trim();
    const sharedUrl = (fd.get("url") || "").trim();
    const title = (fd.get("title") || "").trim();

    if (file && file.size > 0) {
      // The server converts in memory and returns the full book (ADR-013);
      // the SW stores it in IndexedDB so nothing lands on the server.
      const uploadFd = new FormData();
      uploadFd.append("file", file, file.name || "shared");
      const resp = await fetch("/api/upload", { method: "POST", body: uploadFd });
      let data = null;
      try { data = await resp.json(); } catch { /* non-JSON body — fall through to error path */ }
      if (resp.ok && data && data.id) {
        await idbPutBook(data);
        return Response.redirect("/?book=" + encodeURIComponent(data.id), 303);
      }
      const errMsg = (data && data.error) || ("HTTP " + resp.status);
      return Response.redirect("/?share-error=" + encodeURIComponent(errMsg), 303);
    }

    if (sharedUrl) {
      return Response.redirect("/?url=" + encodeURIComponent(sharedUrl), 303);
    }

    if (text) {
      if (/^https?:\/\/\S+/i.test(text)) {
        return Response.redirect("/?url=" + encodeURIComponent(text), 303);
      }
      const payload = title ? title + "\n\n" + text : text;
      return Response.redirect("/?text=" + encodeURIComponent(payload), 303);
    }

    return Response.redirect("/", 303);
  } catch (err) {
    console.error("[sw] share-target handler failed:", err);
    return Response.redirect("/?share-error=" + encodeURIComponent(err.message || "share failed"), 303);
  }
}
