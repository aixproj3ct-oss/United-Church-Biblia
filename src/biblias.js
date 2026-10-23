// Biblias cargadas en esta tablet (IndexedDB). El texto nunca sale del dispositivo ni se sube al repositorio.
// Cada versión guarda un registro por libro (todos en una sola transacción); su ficha ("v:") se escribe
// al final, así un guardado que falla a mitad deja la versión anterior intacta.
// Un backend ofrece get/put/del/keys y, para ir rápido, putMany(pares) y borrarRango(desde, hasta) (cada uno
// en una transacción); si faltan, se usa put/del/keys uno por uno.
import { numeroLibro } from "./pasaje.js";

export function backendMemoria() {
  const m = new Map();
  const b = { get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, del: async k => { m.delete(k); }, keys: async () => [...m.keys()] };
  // Falso de pruebas: pasa por b.put / b.del para que una prueba pueda hacerlos fallar a mitad.
  b.putMany = async pares => { for (const [k, v] of pares) await b.put(k, v); };
  b.borrarRango = async (desde, hasta) => { for (const k of [...m.keys()]) if (String(k) >= desde && String(k) <= hasta) await b.del(k); };
  return b;
}

export function backendIndexedDB(nombre = "uc-biblias") {
  let db;
  // Si la apertura falla no se guarda la promesa rechazada: la siguiente llamada vuelve a intentar.
  const abrir = () => db ??= new Promise((ok, mal) => {
    const r = indexedDB.open(nombre, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  }).catch(e => { db = undefined; throw e; });
  const op = (modo, f) => abrir().then(d => new Promise((ok, mal) => {
    const tx = d.transaction("kv", modo), req = f(tx.objectStore("kv"));
    tx.oncomplete = () => ok(req.result);
    tx.onerror = tx.onabort = () => mal(tx.error);
  }));
  // Varias escrituras en una sola transacción: o entran todas o ninguna.
  const lote = f => abrir().then(d => new Promise((ok, mal) => {
    const tx = d.transaction("kv", "readwrite");
    tx.oncomplete = () => ok();
    tx.onerror = tx.onabort = () => mal(tx.error);
    try { f(tx.objectStore("kv")); } catch (e) { try { tx.abort(); } catch { /* ya cerrada */ } mal(e); }
  }));
  return {
    get: k => op("readonly", s => s.get(k)),
    put: (k, v) => op("readwrite", s => s.put(v, k)),
    del: k => op("readwrite", s => s.delete(k)),
    keys: () => op("readonly", s => s.getAllKeys()),
    putMany: pares => lote(s => { for (const [k, v] of pares) s.put(v, k); }),
    borrarRango: (desde, hasta) => lote(s => s.delete(IDBKeyRange.bound(desde, hasta))),
  };
}

export function crearBiblias(backend = backendIndexedDB()) {
  const cache = new Map();
  let cacheMetas = null, cachePrincipal;
  const invalidar = () => { cacheMetas = null; cachePrincipal = undefined; cache.clear(); };
  const metas = async () => cacheMetas ??= leerMetas();
  const leerMetas = async () => {
    const ks = (await backend.keys()).filter(k => String(k).startsWith("v:"));
    const ms = await Promise.all(ks.map(k => backend.get(k)));
    return ms.filter(Boolean).sort((a, b) => a.orden - b.orden);
  };
  const borrarLibros = async (sigla, gen) => {
    const pref = `t:${sigla}:${gen}:`;
    if (backend.borrarRango) return backend.borrarRango(pref, pref + String.fromCharCode(0xffff));   // todas las claves con ese prefijo
    for (const k of await backend.keys()) if (String(k).startsWith(pref)) await backend.del(k);
  };
  const escribirLibros = async (sigla, gen, libros) => {
    const pares = Object.entries(libros).map(([n, libro]) => [`t:${sigla}:${gen}:${n}`, libro]);
    if (backend.putMany) return backend.putMany(pares);
    for (const [k, v] of pares) await backend.put(k, v);
  };
  return {
    versiones: metas,
    async principal() {
      const ms = await metas();
      if (cachePrincipal === undefined) cachePrincipal = await backend.get("principal");
      const p = cachePrincipal;
      return ms.some(m => m.sigla === p) ? p : ms[0]?.sigla ?? null;
    },
    async guardar(biblia) {
      const anterior = await backend.get("v:" + biblia.sigla);
      const ms = await metas();
      const gen = (anterior?.gen ?? 0) + 1;
      await borrarLibros(biblia.sigla, gen);   // restos de un guardado anterior que falló a mitad
      await escribirLibros(biblia.sigla, gen, biblia.libros);   // una transacción: si falla, no queda ningún libro a medias
      const meta = { sigla: biblia.sigla, nombre: biblia.nombre, derechos: biblia.derechos, resumen: biblia.resumen, gen,
        orden: anterior?.orden ?? (ms.length ? Math.max(...ms.map(m => m.orden)) + 1 : 1) };
      try {
        await backend.put("v:" + biblia.sigla, meta);
        // Desde aquí la versión nueva ya es la vigente. Si falla lo que sigue, la caché se invalida igual
        // y el error trae guardada: true (la Biblia sí quedó guardada, pero sobró la versión vieja).
        try {
          if (!ms.length) await backend.put("principal", biblia.sigla);
          if (anterior) await borrarLibros(biblia.sigla, anterior.gen);
        } catch (e) {
          throw Object.assign(new Error(`${biblia.sigla} se guardó, pero no se pudo borrar la versión anterior: ${e?.message ?? e}`), { guardada: true, causa: e });
        }
      } finally { invalidar(); }
      return meta;
    },
    async hacerPrincipal(sigla) { if (await backend.get("v:" + sigla)) { await backend.put("principal", sigla); invalidar(); } },
    async quitar(sigla) {
      const meta = await backend.get("v:" + sigla);
      if (!meta) return;
      await backend.del("v:" + sigla);
      await borrarLibros(sigla, meta.gen);
      if ((await backend.get("principal")) === sigla) {
        const resto = await metas();
        if (resto.length) await backend.put("principal", resto[0].sigla); else await backend.del("principal");
      }
      invalidar();
    },
    async capitulo(sigla, codigo, cap) {
      const meta = (await metas()).find(m => m.sigla === sigla);   // en memoria: el índice de búsqueda lee miles de capítulos
      const n = numeroLibro(codigo);
      if (!meta || !n) return null;
      const clave = `t:${sigla}:${meta.gen}:${n}`;
      if (!cache.has(clave)) cache.set(clave, (await backend.get(clave)) ?? null);
      return cache.get(clave)?.[cap] ?? null;
    },
  };
}
