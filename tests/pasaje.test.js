import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPasaje, refDeCodigo, etiquetaRef, codigoRef, capituloVecino, numeroLibro, codigoLibro } from "../src/pasaje.js";

// Capítulo con agrupados: 1 trae el texto de 1-3, 4 y 5 normales, 6-7 agrupados.
const TLA = { 1: "a", 2: "", 3: "", 4: "b", 5: "c", 6: "d", 7: "" };
const RV = { 1: "r1", 2: "r2", 3: "r3", 4: "r4", 5: "r5", 6: "r6", 7: "r7", 8: "r8" };
const p = (desde, hasta, cap = TLA, alt = RV) =>
  armarPasaje({ principal: { sigla: "TLA", cap }, alternativas: alt ? [{ sigla: "RVR 1960", cap: alt }] : [], desde, hasta });
const etiquetas = r => r.bloques.map(b => b.etiqueta);

test("versículo dentro de un grupo muestra el bloque completo", () => {
  const r = p(2, 2);
  assert.deepEqual(r.bloques, [{ desde: 1, hasta: 3, etiqueta: "1-3", texto: "a", sigla: null }]);
  assert.deepEqual(r.rellenoDe, []);
});

test("rango que cruza el final de un grupo (Review Focus 3)", () => {
  assert.deepEqual(etiquetas(p(3, 4)), ["1-3", "4"]);
});

test("grupo al final del capítulo", () => {
  assert.deepEqual(etiquetas(p(7, 7)), ["6-7"]);
});

test("capítulo completo con relleno de lo que falta en la principal", () => {
  const r = p(null, null);
  assert.deepEqual(etiquetas(r), ["1-3", "4", "5", "6-7", "8"]);
  assert.equal(r.bloques[4].sigla, "RVR 1960");
  assert.equal(r.bloques[4].texto, "r8");
  assert.deepEqual(r.rellenoDe, ["RVR 1960"]);
});

test("capítulo vacío en la principal se rellena entero", () => {
  const r = p(1, 2, {});
  assert.deepEqual(r.bloques.map(b => [b.etiqueta, b.texto, b.sigla]), [["1", "r1", "RVR 1960"], ["2", "r2", "RVR 1960"]]);
});

test("principal sin capítulo (null) y sin alternativas: sin texto", () => {
  const r = p(1, 1, null, null);
  assert.deepEqual(r.bloques, []);
  assert.deepEqual(r.sinTexto, [1]);
});

test("versículo que no existe en ninguna versión (Review Focus 2)", () => {
  const r = p(9, 9);
  assert.deepEqual(r.bloques, []);
  assert.deepEqual(r.sinTexto, [9]);
});

test("rango que se pasa del final: muestra lo que hay y no inventa", () => {
  const r = p(7, 12);
  assert.deepEqual(etiquetas(r), ["6-7", "8"]);
  assert.deepEqual(r.sinTexto, [9, 10, 11, 12]);
});

test("un vacío sin versículo anterior con texto se trata como faltante", () => {
  const r = p(1, 1, { 1: "", 2: "x" });
  assert.deepEqual(r.bloques.map(b => [b.etiqueta, b.sigla]), [["1", "RVR 1960"]]);
});

test("refDeCodigo, etiquetaRef y codigoRef", () => {
  assert.deepEqual(refDeCodigo("1CO.13.4-7"), { codigo: "1CO", cap: 13, v1: 4, v2: 7 });
  assert.deepEqual(refDeCodigo("PSA.23"), { codigo: "PSA", cap: 23, v1: null, v2: null });
  assert.deepEqual(refDeCodigo("JHN.3.16"), { codigo: "JHN", cap: 3, v1: 16, v2: null });
  assert.equal(refDeCodigo("XYZ.1"), null);
  assert.equal(refDeCodigo("A"), null);
  assert.equal(refDeCodigo(undefined), null);
  assert.equal(etiquetaRef({ codigo: "PSA", cap: 23, v1: null, v2: null }), "Salmo 23");
  assert.equal(etiquetaRef({ codigo: "1CO", cap: 13, v1: 4, v2: 7 }), "1 Corintios 13:4-7");
  assert.equal(codigoRef({ codigo: "JHN", cap: 3, v1: 16, v2: null }), "JHN.3.16");
});

test("capituloVecino cruza de libro y se detiene en los extremos", () => {
  assert.deepEqual(capituloVecino("JHN", 3, 1), { codigo: "JHN", cap: 4 });
  assert.deepEqual(capituloVecino("MAL", 4, 1), { codigo: "MAT", cap: 1 });
  assert.deepEqual(capituloVecino("MAT", 1, -1), { codigo: "MAL", cap: 4 });
  assert.equal(capituloVecino("GEN", 1, -1), null);
  assert.equal(capituloVecino("REV", 22, 1), null);
  assert.equal(numeroLibro("GEN"), 1);
  assert.equal(numeroLibro("REV"), 66);
  assert.equal(codigoLibro(43), "JHN");
});

test("capítulo que no tiene ninguna versión cargada: marca vacio (nunca pantalla en blanco)", () => {
  const r = armarPasaje({ principal: { sigla: "X", cap: null }, alternativas: [], desde: null, hasta: null });
  assert.equal(r.vacio, true);
  assert.equal(p(null, null).vacio, false);
});

test("ordenAlternativas pone la RV 1960 primero", async () => {
  const { ordenAlternativas } = await import("../src/pasaje.js");
  const ms = [{ sigla: "TLA", orden: 1 }, { sigla: "NVI", orden: 2 }, { sigla: "RVR 1960", orden: 3 }];
  assert.deepEqual(ordenAlternativas(ms, "TLA").map(m => m.sigla), ["RVR 1960", "NVI"]);
});
