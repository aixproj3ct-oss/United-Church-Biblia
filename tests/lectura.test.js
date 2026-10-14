import { test } from "node:test";
import assert from "node:assert/strict";
import { nuevaLectura } from "../src/lectura.js";

const ref = { codigo: "JHN", cap: 4, v1: null, v2: null };
const cita = { codigo: "JHN.4", etiqueta: "Juan 4" };

test("una cita nueva abre en la versión principal y agrega una entrada al historial del navegador", () => {
  const r = nuevaLectura({ sigla: "RVR 1960" }, cita, ref);
  assert.equal(r.lectura.sigla, null);
  assert.equal(r.reemplazar, false);
  assert.equal(r.lectura.completo, true);
});

test("capítulo anterior/siguiente dentro del lector conserva la versión y reemplaza la entrada (Atrás cierra el lector)", () => {
  const r = nuevaLectura({ sigla: "RVR 1960" }, cita, ref, { navegando: true });
  assert.equal(r.lectura.sigla, "RVR 1960");
  assert.equal(r.reemplazar, true);
});

test("navegar sin lectura previa no reemplaza", () => {
  assert.equal(nuevaLectura(null, cita, ref, { navegando: true }).reemplazar, false);
});

test("una cita con versículo no abre el capítulo completo salvo que se pida", () => {
  const r1 = { codigo: "JHN", cap: 3, v1: 16, v2: null };
  assert.equal(nuevaLectura(null, cita, r1).lectura.completo, false);
  assert.equal(nuevaLectura(null, cita, r1, { completo: true }).lectura.completo, true);
});
