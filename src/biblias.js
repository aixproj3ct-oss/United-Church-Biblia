// Biblias cargadas en esta tablet (IndexedDB). El texto nunca sale del dispositivo ni se sube al repositorio.
// Cada versión guarda un registro por libro; su ficha ("v:") se escribe al final, así un guardado
// que falla a mitad deja la versión anterior intacta.
import { numeroLibro } from "./pasaje.js";

export function backendMemoria() {
  const m = new Map();
  return { get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, del: async k => { m.delete(k); }, keys: async () => [...m.keys()] };
}

export function backendIndexedDB(nombre = "uc-biblias") {
  let db;
  const abrir = () => db ??= new Promise((ok, mal) => {
    const r = indexedDB.open(nombre, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  const op = (modo, f) => abrir().then(d => new Promise((ok, mal) => {
    const tx = d.transaction("kv", modo), req = f(tx.objectStore("kv"));
    tx.oncomplete = () => ok(req.result);
    tx.onerror = tx.onabort = () => mal(tx.error);
  }));
  return {
    get: k => op("readonly", s => s.get(k)),
    put: (k, v) => op("readwrite", s => s.put(v, k)),
    del: k => op("readwrite", s => s.delete(k)),
    keys: () => op("readonly", s => s.getAllKeys()),
  };
}

export function crearBiblias(backend = backendIndexedDB()) {
  const cache = new Map();
  const metas = async () => {
    const ks = (await backend.keys()).filter(k => String(k).startsWith("v:"));
    const ms = await Promise.all(ks.map(k => backend.get(k)));
    return ms.filter(Boolean).sort((a, b) => a.orden - b.orden);
  };
  const borrarLibros = async (sigla, gen) => {
    const pref = `t:${sigla}:${gen}:`;
    for (const k of await backend.keys()) if (String(k).startsWith(pref)) await backend.del(k);
  };
  return {
    versiones: metas,
    async principal() {
      const ms = await metas();
      const p = await backend.get("principal");
      return ms.some(m => m.sigla === p) ? p : ms[0]?.sigla ?? null;
    },
    async guardar(biblia) {
      const anterior = await backend.get("v:" + biblia.sigla);
      const ms = await metas();
      const gen = (anterior?.gen ?? 0) + 1;
      for (const [n, libro] of Object.entries(biblia.libros)) await backend.put(`t:${biblia.sigla}:${gen}:${n}`, libro);
      const meta = { sigla: biblia.sigla, nombre: biblia.nombre, derechos: biblia.derechos, resumen: biblia.resumen, gen,
        orden: anterior?.orden ?? (ms.length ? Math.max(...ms.map(m => m.orden)) + 1 : 1) };
      await backend.put("v:" + biblia.sigla, meta);
      if (anterior) await borrarLibros(biblia.sigla, anterior.gen);
      if (!ms.length) await backend.put("principal", biblia.sigla);
      cache.clear();
      return meta;
    },
    async hacerPrincipal(sigla) { if (await backend.get("v:" + sigla)) await backend.put("principal", sigla); },
    async quitar(sigla) {
      const meta = await backend.get("v:" + sigla);
      if (!meta) return;
      await backend.del("v:" + sigla);
      await borrarLibros(sigla, meta.gen);
      if ((await backend.get("principal")) === sigla) {
        const resto = await metas();
        if (resto.length) await backend.put("principal", resto[0].sigla); else await backend.del("principal");
      }
      cache.clear();
    },
    async capitulo(sigla, codigo, cap) {
      const meta = await backend.get("v:" + sigla);
      const n = numeroLibro(codigo);
      if (!meta || !n) return null;
      const clave = `t:${sigla}:${meta.gen}:${n}`;
      if (!cache.has(clave)) cache.set(clave, (await backend.get(clave)) ?? null);
      return cache.get(clave)?.[cap] ?? null;
    },
  };
}
