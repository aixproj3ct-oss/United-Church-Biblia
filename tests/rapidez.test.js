// Rapidez de la búsqueda y del guardado de Biblias (paquete F). Todo el texto es inventado: el repositorio
// nunca guarda texto bíblico real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fichas, crearIndice, crearIndiceAsync, armarIndiceDesde, buscar } from "../src/busqueda.js";
import { crearBiblias, backendMemoria, backendIndexedDB } from "../src/biblias.js";

// ---------- implementación ANTERIOR de la búsqueda (referencia congelada) ----------
const VACIAS = new Set("el la los las un una unos unas de del al a y o que en por para con se lo le les su sus es no me te nos mas muy".split(" "));
function crearIndiceViejo(versiones) {
  const indice = [];
  for (const { sigla, libros } of versiones)
    for (const [libro, caps] of Object.entries(libros || {}))
      for (const [cap, vs] of Object.entries(caps || {}))
        for (const [v, texto] of Object.entries(vs || {}))
          if (texto) indice.push({ sigla, libro: +libro, cap: +cap, v: +v, texto, fichas: fichas(texto) });
  return indice;
}
function buscarViejo(indice, consulta, { sigla = null, max = 20 } = {}) {
  const q = fichas(consulta);
  if (!q.length) return [];
  const contenido = q.filter(w => !VACIAS.has(w));
  const qc = contenido.length ? contenido : q;
  const pares = q.slice(1).map((w, i) => q[i] + " " + w);
  const minimo = Math.ceil(0.6 * qc.length);
  const mejores = new Map();
  for (const e of indice) {
    if (sigla && e.sigla !== sigla) continue;
    const set = new Set(e.fichas);
    let hits = 0;
    for (const w of qc) if (set.has(w)) hits++;
    if (hits < minimo) continue;
    let seguidos = 0;
    if (pares.length) {
      const pe = new Set(e.fichas.slice(1).map((w, i) => e.fichas[i] + " " + w));
      for (const p of pares) if (pe.has(p)) seguidos++;
    }
    const puntaje = hits / qc.length + 0.8 * (pares.length ? seguidos / pares.length : 0) - 0.002 * e.fichas.length;
    const clave = `${e.libro}.${e.cap}.${e.v}`;
    const previo = mejores.get(clave);
    if (!previo || puntaje > previo.puntaje)
      mejores.set(clave, { sigla: e.sigla, libro: e.libro, cap: e.cap, v: e.v, texto: e.texto, puntaje });
  }
  return [...mejores.values()].sort((a, b) => b.puntaje - a.puntaje).slice(0, max);
}

// ---------- corpus inventado y determinista ----------
const prng = semilla => { let s = semilla >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const SILABAS = "ba be bi bo bu ca ce ci co cu da de di do du fa fe fi fo la le li lo lu ma me mi mo mu na ne ni no nu pa pe pi po pu ra re ri ro ru sa se si so su ta te ti to tu va ve vi vo xa ñe ñi ño".split(" ");
const EXTRA = ["Señor", "Jehová", "Cristo", "Jesucristo", "Dios", "pastores", "corazones", "amó", "fuerza"];

function crearCorpus({ versiculos, versiones = ["AAA", "BBB"], vocab = 1500, semilla = 7 }) {
  const r = prng(semilla);
  const palabras = Array.from({ length: vocab }, () => {
    let w = "";
    for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) w += SILABAS[Math.floor(r() * SILABAS.length)];
    return w;
  });
  const palabra = () => {
    const u = r();
    if (u < 0.3) return [...VACIAS][Math.floor(r() * VACIAS.size)];
    if (u < 0.32) return EXTRA[Math.floor(r() * EXTRA.length)];
    const w = palabras[Math.floor(vocab * Math.pow(r(), 2.2))], m = r();
    return m < 0.1 ? w + "s" : m < 0.15 ? w + "es" : m < 0.18 ? w[0].toUpperCase() + w.slice(1) + "," : w;
  };
  const frases = [], out = [];
  for (const sigla of versiones) {
    const libros = {};
    let n = 0, libro = 1, cap = 1, v = 1;
    while (n++ < versiculos) {
      const ws = Array.from({ length: 8 + Math.floor(r() * 25) }, palabra);
      const texto = r() < 0.03 ? "" : ws.join(" ");           // algunos versículos agrupados (vacíos)
      ((libros[libro] ??= {})[cap] ??= {})[v] = texto;
      if (texto && r() < 0.02) frases.push(ws);
      if (++v > 25 + Math.floor(r() * 10)) { v = 1; if (++cap > 30) { cap = 1; libro = libro % 66 + 1; } }
    }
    out.push({ sigla, libros });
  }
  return { versiones: out, frases };
}

function consultasDe(corpus, cuantas) {
  const r = prng(11), qs = [];
  for (let i = 0; i < cuantas; i++) {
    const f = corpus.frases[Math.floor(r() * corpus.frases.length)], u = r();
    let q = f.slice(Math.floor(r() * Math.max(1, f.length - 4))).slice(0, 1 + Math.floor(r() * 6));
    if (u < 0.15) q = [...q].reverse();            // palabras sueltas, sin el orden de la frase
    else if (u < 0.3) q = q.filter((_, j) => j % 2 === 0);
    else if (u < 0.35) q = [...q, q[0]];           // una palabra repetida en la consulta
    qs.push(q.join(" "));
  }
  // casos raros: vacías, solo palabras pequeñas, sinónimos, acentos, palabras que no existen
  qs.push("", "   ", "de", "el la", "dios", "señor es mi pastor", "SEÑOR", "Jehová Cristo", "amó fuerza dios", "dios dios dios",
    "ba", "zzzz qqqq", "pastores corazones", "¡Jesucristo!", "el el el");
  return qs;
}

// ---------- F1: mismo resultado que la implementación anterior ----------
test("F1: el índice invertido da los mismos resultados, puntaje y orden que la búsqueda anterior", () => {
  const corpus = crearCorpus({ versiculos: 2500 });                      // 5 000 versículos en 2 versiones
  const viejo = crearIndiceViejo(corpus.versiones), nuevo = crearIndice(corpus.versiones);
  assert.equal(nuevo.length, viejo.length);
  let conResultados = 0;
  for (const q of consultasDe(corpus, 150)) {
    for (const opc of [{}, { sigla: "BBB" }, { max: 5 }, { max: 100, sigla: "AAA" }]) {
      const esperado = buscarViejo(viejo, q, opc);
      assert.deepEqual(buscar(nuevo, q, opc), esperado, `consulta «${q}» ${JSON.stringify(opc)}`);
      if (esperado.length) conResultados++;
    }
  }
  assert.ok(conResultados > 150, "la prueba debe ejercitar consultas con resultados");
});

test("F1: las entradas ya no guardan el arreglo de fichas", () => {
  const nuevo = crearIndice(crearCorpus({ versiculos: 50 }).versiones);
  assert.ok(nuevo.length > 0 && nuevo.every(e => !("fichas" in e) && e.n > 0));
});

test("F1: un arreglo de entradas armado a mano también se puede buscar", () => {
  const entradas = [
    { sigla: "X", libro: 1, cap: 1, v: 1, texto: "amor y paz para todos", fichas: fichas("amor y paz para todos") },
    { sigla: "X", libro: 1, cap: 1, v: 2, texto: "paz en la tierra", fichas: fichas("paz en la tierra") },
  ];
  const r = buscar(entradas, "amor paz");
  assert.equal(r[0].v, 1);
  assert.deepEqual(r, buscarViejo(entradas, "amor paz"));
});

test("F1: buscar es bastante más rápido que antes con un corpus grande", () => {
  const corpus = crearCorpus({ versiculos: 6000, vocab: 3000 });           // 12 000 versículos
  const viejo = crearIndiceViejo(corpus.versiones), nuevo = crearIndice(corpus.versiones);
  const qs = consultasDe(corpus, 40);
  const medir = (f, idx) => { const t = performance.now(); for (const q of qs) f(idx, q); return performance.now() - t; };
  medir(buscarViejo, viejo); medir(buscar, nuevo);                         // calentar
  const tViejo = medir(buscarViejo, viejo), tNuevo = medir(buscar, nuevo);
  assert.ok(tNuevo * 2 < tViejo, `nuevo ${tNuevo.toFixed(0)} ms vs anterior ${tViejo.toFixed(0)} ms`);
});

// ---------- F2: armar el índice sin congelar la pantalla ----------
test("F2: crearIndiceAsync da el mismo índice que crearIndice y cede el turno cada cierto número de libros", async () => {
  const corpus = crearCorpus({ versiculos: 2000 });
  const libros = corpus.versiones.reduce((n, v) => n + Object.keys(v.libros).length, 0);
  let cesiones = 0;
  const asincrono = await crearIndiceAsync(corpus.versiones, { cadaLibros: 2, ceder: async () => { cesiones++; } });
  const sincrono = crearIndice(corpus.versiones);
  assert.deepEqual(asincrono, sincrono);
  assert.ok(cesiones >= Math.floor(libros / 2), `cedió ${cesiones} veces con ${libros} libros`);
  for (const q of consultasDe(corpus, 60)) assert.deepEqual(buscar(asincrono, q), buscar(sincrono, q), q);
});

test("F2: crearIndiceAsync cede de verdad al navegador (setTimeout) por omisión", async () => {
  const corpus = crearCorpus({ versiculos: 300, versiones: ["AAA"] });
  let ticks = 0;
  const reloj = setInterval(() => ticks++, 0);
  await crearIndiceAsync(corpus.versiones);
  clearInterval(reloj);
  assert.ok(ticks >= 1, "otras tareas pudieron correr mientras se armaba");
});

test("F2: armarIndiceDesde lee las Biblias guardadas y da el mismo índice que crearIndice", async () => {
  const corpus = crearCorpus({ versiculos: 1500, versiones: ["AAA", "BBB"] });
  const b = crearBiblias(backendMemoria());
  for (const v of corpus.versiones) await b.guardar({ sigla: v.sigla, nombre: v.sigla, derechos: "", libros: v.libros, resumen: {} });
  let cesiones = 0;
  const desdeBiblias = await armarIndiceDesde(b, { cadaLibros: 1, ceder: async () => { cesiones++; } });
  const esperado = crearIndice(corpus.versiones);
  assert.deepEqual(desdeBiblias, esperado);
  assert.ok(cesiones > 10);
  for (const q of consultasDe(corpus, 40)) assert.deepEqual(buscar(desdeBiblias, q), buscar(esperado, q), q);
  assert.deepEqual(await armarIndiceDesde(crearBiblias(backendMemoria())), [], "sin Biblias, un índice vacío");
});

// ---------- F3: guardar una Biblia en una sola transacción ----------
const biblia = (sigla, texto = "t", libros = 5) => ({ sigla, nombre: sigla, derechos: "", resumen: {},
  libros: Object.fromEntries(Array.from({ length: libros }, (_, i) => [i + 1, { 1: { 1: `${texto} ${i + 1}` } }])) });

test("F3: guardar usa un solo putMany para los libros y borra la generación vieja por rango", async () => {
  const be = backendMemoria();
  const llamadas = { put: [], putMany: [], borrarRango: [], del: 0 };
  const { put, putMany, borrarRango, del } = be;
  be.put = async (k, v) => { llamadas.put.push(k); return put(k, v); };
  be.putMany = async p => { llamadas.putMany.push(p.map(x => x[0])); return putMany(p); };
  be.borrarRango = async (a, z) => { llamadas.borrarRango.push([a, z]); return borrarRango(a, z); };
  be.del = async k => { llamadas.del++; return del(k); };
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "viejo", 66));
  assert.equal(llamadas.putMany.length, 1);
  assert.equal(llamadas.putMany[0].length, 66);
  await b.guardar(biblia("TLA", "nuevo", 66));
  assert.equal(llamadas.putMany.length, 2);
  assert.ok(llamadas.borrarRango.some(([a]) => a === "t:TLA:1:"), "se borra la generación vieja por rango");
  assert.equal(llamadas.del, 66, "el falso borra por rango pasando por del; el real lo hace en una operación");
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "nuevo 1");
  assert.deepEqual((await be.keys()).filter(k => k.startsWith("t:TLA:")).length, 66);
});

test("F3: si putMany falla, la versión anterior sigue intacta y no queda marcada como guardada", async () => {
  const be = backendMemoria();
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "viejo"));
  const putMany = be.putMany;
  be.putMany = async () => { throw new Error("QuotaExceededError"); };
  await assert.rejects(b.guardar(biblia("TLA", "nuevo")), e => !e.guardada);
  be.putMany = putMany;
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "viejo 1");
  assert.equal((await b.versiones())[0].gen, 1);
});

test("F3: un backend sin putMany ni borrarRango sigue funcionando (uno por uno)", async () => {
  const base = backendMemoria();
  const be = { get: base.get, put: base.put, del: base.del, keys: base.keys };
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "viejo"));
  await b.guardar(biblia("TLA", "nuevo"));
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "nuevo 1");
  assert.equal((await be.keys()).filter(k => k.startsWith("t:TLA:")).length, 5);
  await b.quitar("TLA");
  assert.equal((await be.keys()).filter(k => k.startsWith("t:")).length, 0);
});

test("F3: el rango de borrado solo alcanza la generación pedida", async () => {
  const be = backendMemoria();
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "a"));
  await b.guardar(biblia("TLA2", "b"));
  await b.guardar(biblia("TLA", "c"));              // gen 2 de TLA; borra la gen 1
  const claves = (await be.keys()).filter(k => k.startsWith("t:")).sort();
  assert.ok(claves.every(k => k.startsWith("t:TLA:2:") || k.startsWith("t:TLA2:1:")), claves.join(","));
  assert.equal(claves.length, 10);
});

// IndexedDB falso: guarda en un Map, aplica las transacciones al terminar (o las descarta si se abortan).
function indexedDBFalso() {
  const datos = new Map(), log = [];
  globalThis.IDBKeyRange = { bound: (a, z) => ({ a, z }) };
  const db = { transaction() {
    const cola = [];
    const tx = { abort() { cola.length = 0; tx.cancelada = true; queueMicrotask(() => { tx.error = new Error("abortada"); tx.onabort?.(); }); },
      objectStore: () => ({
        put: (v, k) => { if (v === "NO CLONABLE") throw new Error("DataCloneError"); cola.push(() => datos.set(k, v)); return {}; },
        delete: k => { cola.push(() => { if (k && k.a !== undefined) { for (const c of [...datos.keys()]) if (c >= k.a && c <= k.z) datos.delete(c); } else datos.delete(k); }); return {}; },
        get: k => { const req = { result: datos.get(k) }; return req; },
        getAllKeys: () => ({ result: [...datos.keys()] }),
      }) };
    queueMicrotask(() => queueMicrotask(() => { if (tx.cancelada) return; cola.forEach(f => f()); log.push(cola.length); tx.oncomplete?.(); }));
    return tx;
  } };
  globalThis.indexedDB = { open() { const r = { result: db }; queueMicrotask(() => r.onsuccess()); return r; } };
  return { datos, log };
}

test("F3: backendIndexedDB.putMany escribe todo en una transacción y borrarRango usa IDBKeyRange", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB"), rango = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");
  try {
    const { datos, log } = indexedDBFalso();
    const be = backendIndexedDB("rapidez");
    await be.putMany([["t:A:1:1", 1], ["t:A:1:2", 2], ["t:A:2:1", 3], ["otro", 4]]);
    assert.deepEqual(log, [4], "una sola transacción con las cuatro escrituras");
    await be.borrarRango("t:A:1:", "t:A:1:" + String.fromCharCode(0xffff));
    assert.deepEqual([...datos.keys()].sort(), ["otro", "t:A:2:1"]);
    assert.deepEqual(log, [4, 1], "el borrado por rango es otra sola transacción");
    // Si una escritura falla al encolarla, se aborta todo: no queda nada a medias.
    await assert.rejects(be.putMany([["x1", 1], ["x2", "NO CLONABLE"]]), /DataCloneError/);
    assert.ok(!datos.has("x1"));
  } finally {
    for (const [n, d] of [["indexedDB", original], ["IDBKeyRange", rango]]) if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n];
  }
});
