// Guarda la app para que abra al instante; cada vez que hay conexión trae la versión nueva para la próxima apertura.
const VERSION = "uc-v1";
const ARCHIVOS = ["./", "index.html", "styles.css", "app.js", "src/citas.js", "src/libros.js", "src/datos.js",
  "manifest.webmanifest", "assets/icono-192.png", "assets/icono-512.png", "assets/icono-maskable-512.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (new URL(e.request.url).origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(enCache => {
    const red = fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => enCache);
    return enCache || red;
  }));
});
