import { test } from "node:test";
import assert from "node:assert/strict";
import { LIBROS } from "../src/libros.js";

test("66 libros con códigos únicos", () => {
  assert.equal(LIBROS.length, 66);
  assert.equal(new Set(LIBROS.map(l => l[0])).size, 66);
});

test("capítulos: total protestante 1189 (Joel y Malaquías con margen de 1)", () => {
  const total = LIBROS.reduce((s, l) => s + l[2], 0);
  assert.equal(total, 1189 + 2); // JOL 4 y MAL 4 permiten la numeración de algunas Biblias en español
  assert.equal(LIBROS.find(l => l[0] === "PSA")[2], 150);
  assert.equal(LIBROS.find(l => l[0] === "JHN")[2], 21);
});

test("ningún alias apunta a dos libros y todos están normalizados", () => {
  const visto = new Map();
  for (const [codigo, , , alias] of LIBROS) for (const a of alias) {
    assert.match(a, /^[1-3]?[a-z]+$/, `alias mal normalizado: ${a}`);
    assert.ok(!visto.has(a) || visto.get(a) === codigo, `alias repetido: ${a}`);
    visto.set(a, codigo);
  }
});
