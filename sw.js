// Guarda la app para que abra al instante; cada vez que hay conexión trae la versión nueva para la próxima apertura.
const VERSION = "uc-v5";
const ARCHIVOS = ["./", "index.html", "styles.css", "app.js", "src/citas.js", "src/libros.js", "src/datos.js",
  "manifest.webmanifest", "assets/icono-192.png", "assets/icono-512.png", "assets/icono-maskable-512.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (new URL(e.request.url).origin !== location.origin || e.request.method !== "GET") return;
  const opc = e.request.mode === "navigate" ? { ignoreSearch: true } : {};
  e.respondWith(caches.match(e.request, opc).then(enCache => {
    const red = fetch(e.request, { cache: "no-cache" }).then(r => {
      if (r.status === 200) { const copia = r.clone(); e.waitUntil(caches.open(VERSION).then(c => c.put(e.request, copia))); }
      return r;
    }).catch(() => enCache);
    if (enCache) e.waitUntil(red.catch(() => {}));
    return enCache || red;
  }));
});
