// Guarda la app para que abra al instante; cada vez que hay conexión trae la versión nueva para la próxima apertura.
// Los fondos de la lámina no se precachean: solo los usa la PC de la iglesia y se guardan la primera vez que se ven.
const VERSION = "uc-v17";
const ARCHIVOS = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "src/citas.js", "src/libros.js", "src/datos.js", "src/importar.js", "src/pasaje.js", "src/biblias.js", "src/lectura.js",
  "src/busqueda.js", "src/fechas.js", "src/ui.js", "src/lector.js",
  "src/proyeccion/mensajes.js", "src/proyeccion/canal.js", "src/proyeccion/partes.js", "src/proyeccion/pantalla.js",
  "proyeccion.html", "proyeccion.css",
  "assets/fuentes/fuentes.css", "assets/fuentes/Montserrat-500-latin.woff2", "assets/fuentes/Montserrat-500-latin-ext.woff2",
  "assets/fuentes/PlayfairDisplay-500i-latin.woff2", "assets/fuentes/PlayfairDisplay-500i-latin-ext.woff2",
  "assets/icono-192.png", "assets/icono-maskable-512.png"];

// cache:"reload" evita que la instalación tome copias viejas de la caché HTTP (GitHub Pages las guarda 10 minutos).
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});
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
