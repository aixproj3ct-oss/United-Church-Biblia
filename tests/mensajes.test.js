import { test } from "node:test";
import assert from "node:assert/strict";
import { generarCodigo, normalizarCodigo, temaDe, msgPasaje, msgParte, msgEspera, msgEstado, validar, leer, crearOrden } from "../src/proyeccion/mensajes.js";

test("generarCodigo con azar fijo", () => {
  assert.equal(generarCodigo(() => Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7])), "UC-2345-6789");
  for (let i = 0; i < 200; i++) assert.match(generarCodigo(), /^UC-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
});

test("normalizarCodigo", () => {
  for (const c of ["uc-7k4p-9qx2", " UC 7K4P 9QX2 ", "7k4p9qx2"]) assert.equal(normalizarCodigo(c), "UC-7K4P-9QX2");
  for (const c of ["UC-7K4P-9QX", "UC-0K4P-9QX2", "", null]) assert.equal(normalizarCodigo(c), null);
  assert.equal(normalizarCodigo("UCAB-CDEF"), "UC-UCAB-CDEF");
});

test("temaDe", () => {
  assert.equal(temaDe("UC-7K4P-9QX2"), "uc-proy-7k4p9qx2");
});

const ok = msgPasaje({ codigo: "1CO.13.4-7", sigla: "TLA", completo: false }, 5);

test("msgPasaje y validar ida y vuelta", () => {
  assert.deepEqual(validar(ok), { v: 1, de: "tablet", tipo: "pasaje", codigo: "1CO.13.4-7", sigla: "TLA", completo: false, parte: 0, t: 5 });
  assert.deepEqual(validar(msgParte(2, 6)), { v: 1, de: "tablet", tipo: "parte", parte: 2, t: 6 });
  assert.deepEqual(validar(msgEstado({ codigo: "PSA.119", partes: 3, parte: 1 }, 7)), { v: 1, de: "pantalla", tipo: "estado", codigo: "PSA.119", partes: 3, parte: 1, t: 7 });
});

test("validar rechaza basura (Review Focus 3)", () => {
  const malos = [null, {}, { ...ok, v: 2 }, { ...ok, codigo: "<img>" }, { ...ok, parte: -1 }, { ...ok, parte: 1.5 },
    { ...ok, sigla: "<b>" }, { ...ok, sigla: "" }, { ...ok, completo: "no" }, { ...ok, t: NaN },
    msgEstado({ codigo: "PSA.119", partes: 3, parte: 3 }, 1)];
  for (const m of malos) assert.equal(validar(m), null, JSON.stringify(m));
  assert.equal("extra" in validar({ ...ok, extra: "x" }), false);
});

test("leer nunca lanza", () => {
  assert.equal(leer("{roto"), null);
  assert.equal(leer("null"), null);
  assert.deepEqual(leer(JSON.stringify(msgEspera(9))), { v: 1, de: "tablet", tipo: "espera", t: 9 });
});

test("crearOrden (Review Focus 2)", () => {
  const acepta = crearOrden();
  assert.equal(acepta({ de: "tablet", t: 10 }), true);
  assert.equal(acepta({ de: "tablet", t: 9 }), false);
  assert.equal(acepta({ de: "tablet", t: 10 }), false);
  assert.equal(acepta({ de: "pantalla", t: 5 }), true);
});
