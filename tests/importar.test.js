import { test } from "node:test";
import assert from "node:assert/strict";
import { importarBiblia, decodificar, ErrorBiblia, CargaCancelada, cargarBiblia, MAX_BYTES } from "../src/importar.js";
import { crearBiblias, backendMemoria } from "../src/biblias.js";

// Biblias de muestra con texto inventado: el repositorio nunca guarda texto bíblico real.
const versos = n => Array.from({ length: n }, (_, i) => `<VERS vnumber="${i + 1}">texto ${i + 1}</VERS>`).join("");
const zefania = (extra = "") => `<?xml version='1.0' encoding='utf-8'?>
<XMLBIBLE biblename="Versión de Prueba" type="x-bible">
  <INFORMATION><title>Versión de Prueba</title><identifier>VP</identifier><rights>© Nadie &amp; Otros</rights></INFORMATION>
  <BIBLEBOOK bnumber="1" bname="Genesis"><CHAPTER cnumber="1">${versos(1100)}</CHAPTER>
    <CHAPTER cnumber="2"><VERS vnumber="1">uno <NOTE>nota</NOTE>y <STYLE css="x">dos</STYLE></VERS><VERS vnumber="2" /><VERS vnumber="3"></VERS><VERS vnumber="4">cuatro &#233;l</VERS></CHAPTER></BIBLEBOOK>
  <BIBLEBOOK bnumber="67" bname="Apocrifo"><CHAPTER cnumber="1"><VERS vnumber="1">fuera</VERS></CHAPTER></BIBLEBOOK>${extra}
</XMLBIBLE>`;
const formatoBible = traduccion => `﻿<?xml version="1.0" encoding="UTF-8"?>
<bible translation="${traduccion}" status="© Sociedad">
  <testament name="Old"><book number="1"><chapter number="1">${Array.from({ length: 1001 }, (_, i) => `<verse number="${i + 1}">línea ${i + 1}</verse>`).join("")}</chapter></book></testament>
  <testament name="New"><book number="43"><chapter number="3"><verse number="16">porque de tal manera</verse><verse number="17"></verse></chapter></book></testament>
</bible>`;

test("Zefania: sigla, nombre, derechos, texto limpio y agrupados", () => {
  const b = importarBiblia(zefania());
  assert.equal(b.sigla, "VP");
  assert.equal(b.nombre, "Versión de Prueba");
  assert.equal(b.derechos, "© Nadie & Otros");
  assert.equal(b.libros[1][2][1], "uno y dos");
  assert.equal(b.libros[1][2][2], "");
  assert.equal(b.libros[1][2][3], "");
  assert.equal(b.libros[1][2][4], "cuatro él");
  assert.equal(b.libros[67], undefined, "los libros fuera de 1-66 se ignoran");
  assert.deepEqual(b.resumen, { libros: 1, versiculos: 1104, agrupados: 2 });
});

test("formato bible: BOM, sigla y nombre desde translation", () => {
  const b = importarBiblia(formatoBible("Spanish TLA (Traducción en Lenguaje Actual)"));
  assert.equal(b.sigla, "TLA");
  assert.equal(b.nombre, "Traducción en Lenguaje Actual");
  assert.equal(b.derechos, "© Sociedad");
  assert.equal(b.libros[43][3][16], "porque de tal manera");
  assert.equal(b.libros[43][3][17], "");
  assert.deepEqual(b.resumen, { libros: 2, versiculos: 1003, agrupados: 1 });
});

test("formato bible: el paréntesis 'Más información' no se usa como nombre", () => {
  const b = importarBiblia(formatoBible("Spanish RVR 1960 (Más información sobre Biblia Reina Valera 1960)"));
  assert.equal(b.sigla, "RVR 1960");
  assert.equal(b.nombre, "RVR 1960");
});

test("sin sigla deducible devuelve sigla vacía (la pantalla la pide)", () => {
  assert.equal(importarBiblia(formatoBible("")).sigla, "");
});

test("archivos que no son una Biblia completa lanzan ErrorBiblia", () => {
  assert.throws(() => importarBiblia("<html><body>hola</body></html>"), ErrorBiblia);
  assert.throws(() => importarBiblia(`<XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1">${versos(10)}</CHAPTER></BIBLEBOOK></XMLBIBLE>`), ErrorBiblia);
  assert.throws(() => importarBiblia("SQLite format 3\u0000\u0010\u0000"), ErrorBiblia);
  assert.throws(() => importarBiblia(""), /no parece una Biblia/);
});

test("decodificar: UTF-8 con BOM y respaldo windows-1252", () => {
  const utf8 = new TextEncoder().encode("﻿Jesús");
  assert.equal(decodificar(utf8), "Jesús");
  assert.equal(decodificar(utf8.buffer), "Jesús");
  assert.equal(decodificar(new Uint8Array([0x4a, 0x65, 0x73, 0xfa, 0x73])), "Jesús");
});

// ---------- cargarBiblia: leer, decodificar, importar, sigla, confirmar y guardar en un solo paso ----------
const archivoDe = (xml, size) => { const u8 = new TextEncoder().encode(xml); return { size: size ?? u8.byteLength, arrayBuffer: async () => u8.buffer }; };
const opciones = (extra = {}) => {
  const avisos = [], llamadas = { sigla: 0, confirmar: [], invalidar: 0 };
  return { avisos, llamadas, opc: { avisar: (t, ms) => avisos.push([t, ms]), invalidar: () => llamadas.invalidar++,
    pedirSigla: () => { llamadas.sigla++; return "  NUEVA  "; }, confirmar: s => { llamadas.confirmar.push(s); return true; }, ...extra } };
};

test("cargarBiblia: lee, guarda y avisa el resumen (con sigla del archivo)", async () => {
  const b = crearBiblias(backendMemoria());
  const { avisos, llamadas, opc } = opciones();
  const r = await cargarBiblia(archivoDe(zefania()), b, opc);
  assert.equal(r.sigla, "VP");
  assert.match(r.resumen, /^VP: 1 libros, 1[^0-9]?104 versículos [(]2 agrupados[)]$/);
  assert.equal(r.advertencias.length, 2);
  assert.match(r.mensaje, /^VP: .*. Atención: Esta Biblia trae 1 de 66 libros/);
  assert.deepEqual(avisos.map(a => a[0]), ["Leyendo la Biblia…", "Guardando en la tablet…", r.mensaje]);
  assert.equal(avisos.at(-1)[1], 15000, "con advertencias el aviso dura más");
  assert.equal(llamadas.sigla, 0);
  assert.deepEqual(llamadas.confirmar, []);
  assert.equal(llamadas.invalidar, 1);
  assert.equal((await b.capitulo("VP", "GEN", 2))[4], "cuatro él");
  assert.deepEqual((await b.versiones()).map(v => v.sigla), ["VP"]);
});

test("cargarBiblia: sin sigla en el archivo la pide, la recorta y la usa; el nombre del equipo sale en los avisos", async () => {
  const b = crearBiblias(backendMemoria());
  const { avisos, llamadas, opc } = opciones({ dispositivo: "esta PC" });
  const r = await cargarBiblia(archivoDe(formatoBible("")), b, opc);
  assert.equal(r.sigla, "NUEVA");
  assert.equal(llamadas.sigla, 1);
  assert.equal(avisos[1][0], "Guardando en esta PC…");
  assert.ok((await b.versiones()).some(v => v.sigla === "NUEVA"));
});

test("cargarBiblia: sin sigla y el usuario cancela no guarda nada", async () => {
  const b = crearBiblias(backendMemoria());
  for (const respuesta of [null, "", "   "]) {
    const { llamadas, opc } = opciones({ pedirSigla: () => respuesta });
    await assert.rejects(cargarBiblia(archivoDe(formatoBible("")), b, opc), e => e instanceof CargaCancelada && e instanceof ErrorBiblia && e.cancelada && e.message === "Carga cancelada: falta la sigla");
    assert.equal(llamadas.invalidar, 0);
  }
  assert.deepEqual(await b.versiones(), []);
});

test("cargarBiblia: si la versión ya existe pide confirmar; si no se confirma queda la anterior", async () => {
  const b = crearBiblias(backendMemoria());
  await cargarBiblia(archivoDe(zefania()), b, opciones().opc);
  const otra = zefania().replace("texto 1<", "cambiado<");
  const no = opciones({ confirmar: () => false });
  await assert.rejects(cargarBiblia(archivoDe(otra), b, no.opc), e => e instanceof CargaCancelada && e.message === "Carga cancelada");
  assert.equal(no.llamadas.invalidar, 0);
  assert.equal((await b.capitulo("VP", "GEN", 1))[1], "texto 1");
  const si = opciones();
  await cargarBiblia(archivoDe(otra), b, si.opc);
  assert.deepEqual(si.llamadas.confirmar, ["VP"]);
  assert.equal((await b.capitulo("VP", "GEN", 1))[1], "cambiado");
});

test("cargarBiblia: archivos malos lanzan ErrorBiblia en español sin tocar lo guardado", async () => {
  const b = crearBiblias(backendMemoria());
  await assert.rejects(cargarBiblia(archivoDe("<html></html>"), b, opciones().opc), /no parece una Biblia/);
  await assert.rejects(cargarBiblia(archivoDe("", MAX_BYTES + 1), b, opciones().opc), e => e instanceof ErrorBiblia && /demasiado grande/.test(e.message));
  const ilegible = { size: 10, arrayBuffer: async () => { throw new Error("NotReadableError"); } };
  await assert.rejects(cargarBiblia(ilegible, b, opciones().opc), e => e instanceof ErrorBiblia && e.message === "No se pudo leer el archivo. Vuelve a elegirlo.");
  assert.deepEqual(await b.versiones(), []);
});

test("cargarBiblia: si guardar falla dice que la anterior sigue igual; si sobró la vieja, que sí se guardó; siempre invalida", async () => {
  const be = backendMemoria();
  const b = crearBiblias(be);
  await cargarBiblia(archivoDe(zefania()), b, opciones().opc);
  const putMany = be.putMany;
  be.putMany = async () => { throw new Error("QuotaExceededError"); };
  const a = opciones();
  await assert.rejects(cargarBiblia(archivoDe(zefania()), b, a.opc), e => e instanceof ErrorBiblia && !e.guardada && /No se pudo guardar la Biblia [(]¿falta espacio en la tablet[?][)][.] La versión anterior sigue igual[.]/.test(e.message));
  assert.equal(a.llamadas.invalidar, 1);
  be.putMany = putMany;
  const del = be.del;
  be.del = async () => { throw new Error("falla el borrado"); };
  const c = opciones({ dispositivo: "esta PC" });
  await assert.rejects(cargarBiblia(archivoDe(zefania()), b, c.opc), e => e instanceof ErrorBiblia && e.guardada === true && /VP se guardó, pero no se pudo borrar la versión anterior: sigue ocupando espacio en esta PC[.]/.test(e.message));
  assert.equal(c.llamadas.invalidar, 1);
  be.del = del;
});
