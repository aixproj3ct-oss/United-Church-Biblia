import { test } from "node:test";
import assert from "node:assert/strict";
import { repartir, oraciones, refDeParte } from "../src/proyeccion/partes.js";

// Medida falsa: a letra más grande cabe menos. 64 px → 288 caracteres, 58 → 336, 52 → 384, 48 → 416.
const cabe = (bs, tam) => bs.reduce((n, b) => n + b.texto.length, 0) <= (100 - tam) * 8;
const bloque = (n, largo) => ({ desde: n, hasta: n, etiqueta: `${n}`, texto: "a".repeat(largo), sigla: null });

test("cabe entero al tamaño más grande", () => {
  const bs = [bloque(1, 90), bloque(2, 90), bloque(3, 90)];
  assert.deepEqual(repartir(bs, cabe), { tam: 64, partes: [bs] });
});

test("baja de tamaño antes de partir", () => {
  assert.equal(repartir([bloque(1, 100), bloque(2, 100), bloque(3, 100)], cabe).tam, 58);
  const r = repartir([bloque(1, 100), bloque(2, 100), bloque(3, 100), bloque(4, 50)], cabe);
  assert.equal(r.tam, 52);
  assert.equal(r.partes.length, 1);
});

test("parte en varias láminas a 48", () => {
  const bs = [1, 2, 3, 4, 5, 6].map(n => bloque(n, 200));
  const r = repartir(bs, cabe);
  assert.equal(r.tam, 48);
  assert.deepEqual(r.partes, [bs.slice(0, 2), bs.slice(2, 4), bs.slice(4, 6)]);
});

test("versículo gigante por oraciones (Review Focus 4)", () => {
  const texto = Array.from({ length: 5 }, (_, i) => "b".repeat(88) + i + ".").join(" ");
  const r = repartir([{ desde: 4, hasta: 4, etiqueta: "4", texto, sigla: null }], cabe);
  const piezas = r.partes.flat();
  assert.ok(r.partes.length > 1);
  assert.equal(piezas.map(p => p.texto).join("").replace(/\s/g, ""), texto.replace(/\s/g, ""));
  assert.ok(piezas.slice(1).every(p => p.cont === true));
  assert.equal(piezas[0].cont, undefined);
  assert.ok(piezas.every(p => p.desde === 4));
});

test("oraciones", () => {
  assert.deepEqual(oraciones("Uno. ¿Dos? ¡Tres! «Cuatro». cinco"), ["Uno.", "¿Dos?", "¡Tres!", "«Cuatro».", "cinco"]);
});

test("refDeParte", () => {
  const ref = { codigo: "1CO", cap: 13, v1: 4, v2: 7 };
  assert.equal(refDeParte(ref, [bloque(4, 1), bloque(5, 1)]), "1 Corintios 13:4-5");
  assert.equal(refDeParte(ref, [{ ...bloque(1, 1), hasta: 3 }]), "1 Corintios 13:1-3");
  assert.equal(refDeParte(ref, []), "1 Corintios 13:4-7");
});

test("vacío", () => {
  assert.deepEqual(repartir([], cabe), { tam: 64, partes: [[]] });
});
