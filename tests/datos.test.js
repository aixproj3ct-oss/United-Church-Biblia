import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacen } from "../src/datos.js";

const memoria = () => { const m = new Map(); return { _mapa: m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const cita = (codigo, etiqueta = codigo) => ({ codigo, etiqueta });

test("domingos: guardar, ordenar, actual y borrar", () => {
  const a = crearAlmacen(memoria());
  const id1 = a.guardarDomingo({ fecha: "2026-10-05", titulo: "Pasado", citas: [cita("JHN.3.16")] });
  const id2 = a.guardarDomingo({ fecha: "2026-10-12", titulo: "Próximo", citas: [cita("EPH.2.8-9")] });
  assert.deepEqual(a.domingos().map(d => d.titulo), ["Próximo", "Pasado"]);
  assert.equal(a.domingoActual("2026-10-08").id, id2);
  assert.equal(a.domingoActual("2026-10-20").id, id2);
  a.guardarDomingo({ id: id1, fecha: "2026-10-05", titulo: "Editado", citas: [] });
  assert.equal(a.domingos().find(d => d.id === id1).titulo, "Editado");
  a.borrarDomingo(id2);
  assert.equal(a.domingoActual("2026-10-08").id, id1);
  assert.equal(crearAlmacen(memoria()).domingoActual("2026-10-08"), null);
});

test("favoritos por serie sin duplicados", () => {
  const a = crearAlmacen(memoria());
  a.agregarFavorito("Bodas", cita("1CO.13.4-7"));
  a.agregarFavorito("Bodas", cita("1CO.13.4-7"));
  a.agregarFavorito("Evangelismo", cita("JHN.3.16"));
  assert.equal(a.favoritos().length, 2);
  assert.deepEqual(a.series(), ["Bodas", "Evangelismo"]);
  a.quitarFavorito(a.favoritos()[0].id);
  assert.equal(a.favoritos().length, 1);
});

test("historial: el más reciente primero, sin repetir, máximo 30", () => {
  let t = 0; const a = crearAlmacen(memoria(), () => new Date(2026, 9, 5, 10, t++));
  for (let i = 1; i <= 35; i++) a.registrarHistorial(cita(`PSA.${i}`));
  a.registrarHistorial(cita("PSA.10"));
  const h = a.historial();
  assert.equal(h.length, 30);
  assert.equal(h[0].cita.codigo, "PSA.10");
  assert.equal(h.filter(x => x.cita.codigo === "PSA.10").length, 1);
});

test("persiste entre instancias y config por defecto", () => {
  const s = memoria();
  const a = crearAlmacen(s);
  assert.deepEqual(a.config(), { letra: "grande", ultimoRespaldo: null, tema: "claro", pantalla: null });
  a.guardarConfig({ nombre: "Pastor Luis" });
});

test("exportar e importar; importar inválido no borra nada", () => {
  const a = crearAlmacen(memoria(), () => new Date("2026-10-05T12:00:00Z"));
  a.agregarFavorito("Bodas", cita("1CO.13.4-7"));
  const copia = a.exportar();
  a.marcarRespaldo();
  assert.equal(a.config().ultimoRespaldo, "2026-10-05T12:00:00.000Z");
  const b = crearAlmacen(memoria());
  b.importar(copia);
  assert.equal(b.favoritos()[0].serie, "Bodas");
  assert.throws(() => b.importar("{\"hola\":1}"), /Archivo no válido/);
  assert.throws(() => b.importar("no es json"), /Archivo no válido/);
  assert.equal(b.favoritos().length, 1);
});

test("storage corrupto arranca vacío sin romperse", () => {
  const s = memoria(); s.setItem("uc-biblia-v1", "{roto");
  assert.deepEqual(crearAlmacen(s).domingos(), []);
});

test("items corruptos en storage se descartan sin lanzar", () => {
  const s = memoria();
  s.setItem("uc-biblia-v1", JSON.stringify({
    version: 1,
    domingos: [{ id: "ok", fecha: "2026-10-05", titulo: "Bueno", citas: [cita("JHN.3.16")] }, { id: "bad", fecha: "invalid" }],
    favoritos: [{ id: "ok", serie: "Tema", cita: cita("JHN.3.16") }, { id: "bad", serie: "Tema" }],
    historial: [{ cita: cita("JHN.3.16"), cuando: "2026-10-05T12:00:00Z" }, { cita: {} }],
    config: { nombre: "test", letra: "grande", ultimoRespaldo: null }
  }));
  const a = crearAlmacen(s);
  assert.equal(a.domingos().length, 1);
  assert.equal(a.favoritos().length, 1);
  assert.equal(a.historial().length, 1);
  assert.doesNotThrow(() => a.domingos());
  assert.doesNotThrow(() => a.historial());
});

test("importar con 100 entradas de historial guarda 30", () => {
  const a = crearAlmacen(memoria());
  const data = { version: 1, domingos: [], favoritos: [], historial: [], config: { nombre: "test", letra: "grande", ultimoRespaldo: null } };
  data.historial = Array.from({ length: 100 }, (_, i) => ({ cita: cita(`PSA.${i+1}`), cuando: "2026-10-05T12:00:00Z" }));
  a.importar(JSON.stringify(data));
  assert.equal(a.historial().length, 30);
});

test("importar con config:{} usa valores por defecto", () => {
  const a = crearAlmacen(memoria());
  const data = { version: 1, domingos: [], favoritos: [], historial: [], config: {} };
  a.importar(JSON.stringify(data));
  const cfg = a.config();
  assert.equal(cfg.letra, "grande");
  assert.equal(cfg.ultimoRespaldo, null);
});

test("setItem lanzando excepción no rompe guardarDomingo", () => {
  const memFailing = () => {
    const m = new Map();
    return {
      getItem: k => m.get(k) ?? null,
      setItem: () => { throw new Error("quota exceeded"); }
    };
  };
  const a = crearAlmacen(memFailing());
  assert.doesNotThrow(() => {
    a.guardarDomingo({ fecha: "2026-10-05", titulo: "Test", citas: [cita("JHN.3.16")] });
  });
  assert.equal(a.domingos().length, 1);
});

test("agregarFavorito ignora cita sin codigo string", () => {
  const a = crearAlmacen(memoria());
  a.agregarFavorito("Serie", { etiqueta: "test", url: "https://www.bible.com/bible/176/JHN.3.TLA" });
  a.agregarFavorito("Serie", { codigo: null, etiqueta: "test", url: "https://www.bible.com/bible/176/JHN.3.TLA" });
  assert.equal(a.favoritos().length, 0);
});

test("config se sanea al cargar: tipos inválidos y claves desconocidas", () => {
  const m = memoria();
  m.setItem("uc-biblia-v1", JSON.stringify({ version: 1, domingos: [], favoritos: [], historial: [],
    config: { nombre: "  ", letra: "enorme", ultimoRespaldo: 5, extra: "x" } }));
  const cfg = crearAlmacen(m).config();
  assert.deepEqual(cfg, { letra: "grande", ultimoRespaldo: null, tema: "claro", pantalla: null });
});

test("config se sanea al importar", () => {
  const a = crearAlmacen(memoria());
  a.importar(JSON.stringify({ version: 1, domingos: [], favoritos: [], historial: [],
    config: { nombre: 42, letra: "muy-grande", ultimoRespaldo: "2026-10-05T00:00:00.000Z", otro: 1 } }));
  assert.deepEqual(a.config(), { letra: "muy-grande", ultimoRespaldo: "2026-10-05T00:00:00.000Z", tema: "claro", pantalla: null });
});

test("crearAlmacen sin argumentos no lanza si localStorage falla o no existe", () => {
  const orig = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("denegado"); } });
    const a = crearAlmacen();
    a.agregarFavorito("S", cita("JHN.3.16"));
    assert.equal(a.favoritos().length, 1);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
    assert.doesNotThrow(() => crearAlmacen());
  } finally {
    if (orig) Object.defineProperty(globalThis, "localStorage", orig); else delete globalThis.localStorage;
  }
});

test("estado ilegible o inválido se copia crudo antes de sobrescribirse", () => {
  const reloj = () => new Date("2026-10-05T12:00:00Z");
  const t = reloj().getTime();
  for (const [raw, nombre] of [["{no es json", "corrupto"], [JSON.stringify({ version: 2, domingos: [], favoritos: [], historial: [], config: {} }), "versión 2"]]) {
    const m = memoria();
    m.setItem("uc-biblia-v1", raw);
    const a = crearAlmacen(m, reloj);
    assert.equal(m.getItem(`uc-biblia-v1-crudo-${t}`), raw, nombre);
    a.agregarFavorito("Bodas", cita("1CO.13.4-7")); // el guardado sobrescribe la clave principal, el crudo sigue ahí
    assert.equal(m.getItem(`uc-biblia-v1-crudo-${t}`), raw, nombre);
  }
  const limpio = memoria();
  crearAlmacen(limpio, reloj);
  assert.equal(limpio.getItem(`uc-biblia-v1-crudo-${t}`), null);
});

test("importar devuelve el número de elementos dañados descartados", () => {
  const a = crearAlmacen(memoria());
  const ok = { id: "x", serie: "S", cita: cita("JHN.3.16") };
  const malo = { id: "y", serie: "S", cita: { codigo: "A", etiqueta: "A", url: "http://x" } };
  const n = a.importar(JSON.stringify({ version: 1, domingos: [{ id: "d", fecha: "mala", titulo: "", citas: [] }], favoritos: [ok, malo],
    historial: [{ cita: cita("JHN.3.16"), cuando: "2026-10-05T00:00:00Z" }, { cita: null, cuando: "x" }], config: {} }));
  assert.equal(n, 3);
  assert.equal(a.favoritos().length, 1);
  assert.equal(a.importar(JSON.stringify({ version: 1, domingos: [], favoritos: [], historial: [], config: {} })), 0);
});

test("datos viejos con url de bible.com siguen siendo válidos (Review Focus 1)", () => {
  const vieja = { codigo: "JHN.3.16", etiqueta: "Juan 3:16", url: "https://www.bible.com/bible/176/JHN.3.16.TLA" };
  const a = crearAlmacen(memoria());
  a.importar(JSON.stringify({ version: 1, domingos: [{ id: "d", fecha: "2026-10-05", titulo: "T", citas: [vieja] }],
    favoritos: [{ id: "f", serie: "S", cita: vieja }], historial: [{ cita: vieja, cuando: "2026-10-05T12:00:00Z" }],
    config: { letra: "grande", ultimoRespaldo: null, avisoYouVersion: true } }));
  assert.equal(a.domingos()[0].citas[0].codigo, "JHN.3.16");
  assert.equal(a.favoritos()[0].cita.etiqueta, "Juan 3:16");
  assert.equal(a.historial()[0].cita.codigo, "JHN.3.16");
  assert.equal("avisoYouVersion" in a.config(), false);
});

test("una cita nueva sin url es válida; un código mal formado no", () => {
  const a = crearAlmacen(memoria());
  a.registrarHistorial({ codigo: "PSA.23", etiqueta: "Salmo 23" });
  a.registrarHistorial({ codigo: "Juan", etiqueta: "Juan" });
  assert.deepEqual(a.historial().map(h => h.cita.codigo), ["PSA.23"]);
});

test("tema: claro por defecto, acepta oscuro, se sanea lo inválido y se conserva al importar", () => {
  const a = crearAlmacen(memoria());
  assert.equal(a.config().tema, "claro");
  a.guardarConfig({ tema: "oscuro" });
  assert.equal(a.config().tema, "oscuro");
  a.guardarConfig({ tema: "rosado" });
  assert.equal(a.config().tema, "claro");
  a.importar(JSON.stringify({ version: 1, domingos: [], favoritos: [], historial: [], config: { tema: "oscuro" } }));
  assert.equal(a.config().tema, "oscuro");
});

test("pantalla: normaliza el código, rechaza lo inválido y NO viaja en la copia", () => {
  const a = crearAlmacen(memoria());
  a.guardarConfig({ pantalla: "uc-7k4p-9qx2" });
  assert.equal(a.config().pantalla, "UC-7K4P-9QX2");
  a.guardarConfig({ pantalla: "xx" });
  assert.equal(a.config().pantalla, null);
  // el código que venga en el archivo se ignora: la tablet conserva el suyo
  a.importar(JSON.stringify({ version: 1, domingos: [], favoritos: [], historial: [], config: { pantalla: "UC-7K4P-9QX2" } }));
  assert.equal(a.config().pantalla, null);
});

test("exportar no marca el respaldo; marcarRespaldo sí", () => {
  const a = crearAlmacen(memoria(), () => new Date("2026-10-22T10:00:00Z"));
  a.exportar();
  assert.equal(a.config().ultimoRespaldo, null);
  a.marcarRespaldo();
  assert.equal(a.config().ultimoRespaldo, "2026-10-22T10:00:00.000Z");
});

test("importar guarda antes una copia del estado actual y acepta copias viejas (Review Focus 4)", () => {
  const m = memoria();
  const a = crearAlmacen(m, () => new Date("2026-10-22T10:00:00Z"));
  a.guardarDomingo({ fecha: "2026-10-25", titulo: "Actual", citas: [cita("JHN.3.16")] });
  const vieja = { codigo: "PSA.23", etiqueta: "Salmo 23", url: "https://www.bible.com/bible/176/PSA.23.TLA" };
  a.importar(JSON.stringify({ version: 1, domingos: [{ id: "x", fecha: "2026-10-05", titulo: "Viejo", citas: [vieja] }], favoritos: [], historial: [],
    config: { nombre: "Pastor", letra: "grande", ultimoRespaldo: null } }));
  assert.equal(a.domingos()[0].titulo, "Viejo");
  const copia = [...m._mapa.keys()].find(k => k.startsWith("uc-biblia-v1-antes-import-"));
  assert.ok(copia, "debe existir la copia previa");
  assert.equal(JSON.parse(m.getItem(copia)).domingos[0].titulo, "Actual");
  assert.equal("nombre" in a.config(), false);
});

