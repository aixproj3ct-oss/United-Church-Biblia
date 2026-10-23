import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacen } from "../src/datos.js";
import { importarBiblia, decodificar, verificarTamano, ErrorBiblia, MAX_BYTES } from "../src/importar.js";
import { crearBiblias, backendMemoria, backendIndexedDB } from "../src/biblias.js";
import { LIBROS } from "../src/libros.js";

const CLAVE = "uc-biblia-v1";
// Almacenamiento de prueba con la misma forma que localStorage (getItem, setItem, removeItem, key, length).
const memoria = () => {
  const m = new Map();
  return { _mapa: m, fallar: false,
    getItem: k => m.get(k) ?? null,
    setItem(k, v) { if (this.fallar) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; } };
};
const cita = (codigo, etiqueta = codigo) => ({ codigo, etiqueta });
const dom = (extra = {}) => ({ fecha: "2026-10-25", titulo: "T", citas: [cita("JHN.3.16")], ...extra });
const vacia = (config = {}) => JSON.stringify({ version: 1, domingos: [], favoritos: [], historial: [], config });

// ---------- C1: guardar devuelve true/false ----------
test("guardar: si setItem lanza, los modificadores devuelven false y persistido() es false", () => {
  const s = memoria();
  const a = crearAlmacen(s);
  assert.equal(a.agregarFavorito("S", cita("JHN.3.16")), true);
  assert.equal(a.persistido(), true);
  s.fallar = true;
  assert.equal(a.agregarFavorito("S", cita("PSA.23")), false);
  assert.equal(a.persistido(), false);
  assert.equal(a.guardarConfig({ tema: "oscuro" }), false);
  assert.equal(a.marcarRespaldo(), false);
  assert.equal(a.registrarHistorial(cita("PSA.23")), false);
  assert.equal(a.quitarFavorito("no-existe"), false);
  assert.equal(a.borrarDomingo("no-existe"), false);
  // el domingo devuelve su id, pero persistido() avisa que no quedó escrito
  assert.ok(a.guardarDomingo(dom()));
  assert.equal(a.persistido(), false);
  assert.equal(a.domingos().length, 1, "queda en memoria");
  s.fallar = false;
  assert.equal(a.guardarConfig({ tema: "claro" }), true);
  assert.equal(a.persistido(), true);
});

// ---------- C2: poda de copias ----------
test("poda: al abrir quedan solo las 2 copias más recientes de cada tipo", () => {
  const s = memoria();
  s.setItem(CLAVE, JSON.stringify(JSON.parse(vacia())));
  for (const t of [1000, 3000, 2000, 5000, 4000]) s.setItem(`${CLAVE}-crudo-${t}`, "x");
  for (const d of ["2026-10-01", "2026-10-04", "2026-10-02", "2026-10-03"]) s.setItem(`${CLAVE}-antes-import-${d}T10:00:00.000Z`, "x");
  crearAlmacen(s);
  const claves = [...s._mapa.keys()];
  assert.deepEqual(claves.filter(k => k.includes("-crudo-")).sort(), [`${CLAVE}-crudo-4000`, `${CLAVE}-crudo-5000`]);
  assert.deepEqual(claves.filter(k => k.includes("-antes-import-")).sort(),
    [`${CLAVE}-antes-import-2026-10-03T10:00:00.000Z`, `${CLAVE}-antes-import-2026-10-04T10:00:00.000Z`]);
  assert.ok(s.getItem(CLAVE), "el estado principal no se toca");
});

test("poda: cada importación deja a lo más 2 copias 'antes-import'", () => {
  const s = memoria();
  let t = 0;
  const a = crearAlmacen(s, () => new Date(Date.UTC(2026, 9, 1, 10, t++)));
  for (let i = 0; i < 5; i++) a.importar(vacia());
  const antes = [...s._mapa.keys()].filter(k => k.includes("-antes-import-"));
  assert.equal(antes.length, 2);
});

test("poda: sin key()/length en el almacenamiento no falla", () => {
  const m = new Map();
  const simple = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
  assert.doesNotThrow(() => crearAlmacen(simple).importar(vacia()));
});

// ---------- C3: elementos descartados ----------
test("al cargar se cuentan los elementos dañados y queda copia cruda", () => {
  const s = memoria();
  const crudo = JSON.stringify({ version: 1,
    domingos: [{ id: "ok", fecha: "2026-10-05", titulo: "B", citas: [cita("JHN.3.16")] }, { id: "mal", fecha: "2026-13-45", titulo: "", citas: [] }],
    favoritos: [{ id: "f", serie: "S", cita: cita("JHN.3.16") }, { id: "g" }],
    historial: [{ cita: cita("JHN.3.16"), cuando: "2026-10-05T12:00:00Z" }, null], config: {} });
  s.setItem(CLAVE, crudo);
  const a = crearAlmacen(s, () => new Date(7000));
  assert.equal(a.descartados(), 3);
  assert.deepEqual(a.infoCarga(), { descartados: 3, ilegible: false, copia: true });
  assert.equal(s.getItem(`${CLAVE}-crudo-7000`), crudo);
  assert.equal(a.domingos().length, 1);
});

test("al cargar sin nada dañado no hay descartados ni copia; un estado ilegible se marca", () => {
  const limpio = memoria();
  limpio.setItem(CLAVE, vacia());
  const a = crearAlmacen(limpio, () => new Date(7000));
  assert.deepEqual(a.infoCarga(), { descartados: 0, ilegible: false, copia: false });
  assert.equal(limpio.getItem(`${CLAVE}-crudo-7000`), null);
  const roto = memoria();
  roto.setItem(CLAVE, "{roto");
  assert.deepEqual(crearAlmacen(roto, () => new Date(7000)).infoCarga(), { descartados: 0, ilegible: true, copia: true });
});

test("si no cabe la copia cruda, infoCarga.copia es false (no se promete una copia que no existe)", () => {
  const s = memoria();
  s.setItem(CLAVE, JSON.stringify({ version: 1, domingos: [{ id: "mal", fecha: "x", titulo: "", citas: [] }], favoritos: [], historial: [], config: {} }));
  s.fallar = true;
  assert.deepEqual(crearAlmacen(s).infoCarga(), { descartados: 1, ilegible: false, copia: false });
});

// ---------- C3: guardarDomingo rechaza lo inválido ----------
test("guardarDomingo rechaza fechas mal formadas o inexistentes y citas inválidas", () => {
  const s = memoria();
  const a = crearAlmacen(s);
  for (const fecha of ["", "mañana", "2026-13-45", "2026-02-30", "2026-02-29", "26-10-05", undefined])
    assert.equal(a.guardarDomingo(dom({ fecha })), null, `fecha ${fecha}`);
  assert.equal(a.guardarDomingo(dom({ citas: [{ codigo: "Juan", etiqueta: "Juan" }] })), null);
  assert.equal(a.guardarDomingo(dom({ citas: "no" })), null);
  assert.equal(a.domingos().length, 0);
  assert.equal(s.getItem(CLAVE), null, "no se escribió nada");
  assert.ok(a.guardarDomingo(dom({ fecha: "2028-02-29" })), "2028 es bisiesto");
  assert.ok(a.guardarDomingo(dom({ titulo: undefined })), "sin título es válido");
  assert.equal(a.domingos().length, 2);
});

// ---------- C6: la copia no lleva el código de pantalla ----------
test("exportar no incluye el código de la pantalla", () => {
  const a = crearAlmacen(memoria());
  a.guardarConfig({ pantalla: "UC-7K4P-9QX2", tema: "oscuro" });
  const copia = JSON.parse(a.exportar());
  assert.equal("pantalla" in copia.config, false);
  assert.equal(copia.config.tema, "oscuro");
  assert.doesNotMatch(a.exportar(), /UC-7K4P-9QX2/);
});

test("importar conserva la pantalla de la tablet y ignora la del archivo", () => {
  const a = crearAlmacen(memoria());
  a.guardarConfig({ pantalla: "UC-7K4P-9QX2" });
  a.importar(vacia({ pantalla: "UC-AAAA-BBBB", tema: "oscuro" }));
  assert.equal(a.config().pantalla, "UC-7K4P-9QX2");
  assert.equal(a.config().tema, "oscuro");
  a.importar(vacia());
  assert.equal(a.config().pantalla, "UC-7K4P-9QX2");
  const b = crearAlmacen(memoria());
  b.importar(vacia({ pantalla: "UC-AAAA-BBBB" }));
  assert.equal(b.config().pantalla, null);
});

// ---------- C7: importar.js ----------
const versos = n => Array.from({ length: n }, (_, i) => `<VERS vnumber="${i + 1}">texto ${i + 1}</VERS>`).join("");
const biblia1 = extra => `<XMLBIBLE biblename="P"><INFORMATION><identifier>P</identifier></INFORMATION>
  <BIBLEBOOK bnumber="1"><CHAPTER cnumber="1">${versos(1100)}${extra}</CHAPTER></BIBLEBOOK></XMLBIBLE>`;

test("limpiar: <BR/>, <br>, <DIV> y <P> separan palabras; las etiquetas de estilo no", () => {
  const b = importarBiblia(biblia1(`<VERS vnumber="2000">uno<BR/>dos</VERS><VERS vnumber="2001">tres<br>cuatro</VERS>
    <VERS vnumber="2002">cinco<DIV>seis</DIV>siete</VERS><VERS vnumber="2003"><P>ocho</P><P>nueve</P></VERS>
    <VERS vnumber="2004">sub<STYLE css="x">ra</STYLE>yado</VERS>`));
  const c = b.libros[1][1];
  assert.equal(c[2000], "uno dos");
  assert.equal(c[2001], "tres cuatro");
  assert.equal(c[2002], "cinco seis siete");
  assert.equal(c[2003], "ocho nueve");
  assert.equal(c[2004], "subrayado");
});

test("entidades numéricas inválidas dejan el carácter de reemplazo y no lanzan", () => {
  let b;
  assert.doesNotThrow(() => { b = importarBiblia(biblia1(`<VERS vnumber="2000">a&#99999999;b</VERS><VERS vnumber="2001">c&#xD800;d</VERS><VERS vnumber="2002">e&#0;f &#233;</VERS>`)); });
  assert.equal(b.libros[1][1][2000], "a�b");
  assert.equal(b.libros[1][1][2001], "c�d");
  assert.equal(b.libros[1][1][2002], "e�f é");
});

test("tope de tamaño: un archivo de más de 40 MB se rechaza con un mensaje claro", () => {
  assert.equal(MAX_BYTES, 40 * 1024 * 1024);
  assert.doesNotThrow(() => verificarTamano(MAX_BYTES));
  assert.throws(() => verificarTamano(MAX_BYTES + 1), e => e instanceof ErrorBiblia && /demasiado grande/.test(e.message) && /40 MB/.test(e.message));
  assert.throws(() => decodificar({ byteLength: MAX_BYTES + 1 }), ErrorBiblia);
});

const xmlConLibros = (nums, capsDe = n => LIBROS[n - 1][2]) => `<XMLBIBLE biblename="P"><INFORMATION><identifier>P</identifier></INFORMATION>${nums.map(n =>
  `<BIBLEBOOK bnumber="${n}">${Array.from({ length: capsDe(n) }, (_, c) => `<CHAPTER cnumber="${c + 1}">${versos(5)}</CHAPTER>`).join("")}</BIBLEBOOK>`).join("")}</XMLBIBLE>`;
const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test("una Biblia de 30 libros carga con la advertencia '30 de 66 libros'", () => {
  const b = importarBiblia(xmlConLibros(rango(1, 30)));
  assert.equal(b.resumen.libros, 30);
  assert.deepEqual(b.advertencias, ["Esta Biblia trae 30 de 66 libros"]);
});

test("una Biblia completa y correcta no trae advertencias", () => {
  const b = importarBiblia(xmlConLibros(rango(1, 66)));
  assert.equal(b.resumen.libros, 66);
  assert.deepEqual(b.advertencias, []);
});

test("capítulos fuera de lo esperado generan advertencia por libro", () => {
  const b = importarBiblia(xmlConLibros(rango(1, 66), n => n === 1 ? 55 : n === 2 ? 10 : LIBROS[n - 1][2]));
  assert.equal(b.advertencias.length, 2);
  assert.match(b.advertencias[0], /Génesis.*no existen.*55.*50/);
  assert.match(b.advertencias[1], /Éxodo trae 10 de 40 capítulos/);
});

// ---------- C8: biblias.js ----------
const biblia = (sigla, texto = "t") => ({ sigla, nombre: sigla, derechos: "", libros: { 1: { 1: { 1: `${texto} gn` } } }, resumen: { libros: 1, versiculos: 1, agrupados: 0 } });

test("si falla el borrado de la versión vieja, la caché se invalida igual y el error dice que sí se guardó", async () => {
  const be = backendMemoria();
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "viejo"));
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "viejo gn");   // llena la caché
  be.del = async () => { throw new Error("falla el borrado"); };
  await assert.rejects(b.guardar(biblia("TLA", "nuevo")), e => e.guardada === true && /se guardó/.test(e.message));
  assert.equal((await b.versiones())[0].gen, 2, "la ficha nueva se relee");
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "nuevo gn", "ya no sirve la caché vieja");
});

test("un fallo antes de escribir la ficha no marca guardada y deja la versión anterior", async () => {
  const be = backendMemoria();
  const b = crearBiblias(be);
  await b.guardar(biblia("TLA", "viejo"));
  const put = be.put;
  be.put = async (k, v) => { if (String(k).startsWith("v:")) throw new Error("falla ficha"); return put(k, v); };
  await assert.rejects(b.guardar(biblia("TLA", "nuevo")), e => !e.guardada);
  be.put = put;
  assert.equal((await b.capitulo("TLA", "GEN", 1))[1], "viejo gn");
});

test("backendIndexedDB: si la apertura falla, la siguiente llamada reintenta", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let aperturas = 0;
  const dbFalsa = { transaction() {
    const tx = { objectStore: () => ({ get: () => { const req = { result: "valor" }; queueMicrotask(() => tx.oncomplete()); return req; } }) };
    return tx;
  } };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open() {
    const r = { error: new Error("no se pudo abrir"), result: dbFalsa };
    const n = ++aperturas;
    queueMicrotask(() => n === 1 ? r.onerror() : r.onsuccess());
    return r;
  } } });
  try {
    const be = backendIndexedDB("prueba");
    await assert.rejects(be.get("k"), /no se pudo abrir/);
    assert.equal(await be.get("k"), "valor");
    assert.equal(aperturas, 2);
    assert.equal(await be.get("k"), "valor");
    assert.equal(aperturas, 2, "una apertura exitosa sí se reutiliza");
  } finally {
    if (original) Object.defineProperty(globalThis, "indexedDB", original); else delete globalThis.indexedDB;
  }
});
