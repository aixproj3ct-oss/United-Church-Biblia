import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizar, fichas, crearIndice, buscar, palabrasResaltar } from "../src/busqueda.js";

// Biblias de muestra con texto inventado (el repositorio nunca guarda texto bíblico real).
const A = { sigla: "AAA", libros: {
  50: { 4: { 13: "Todo lo puedo en Cristo que me da fuerza.", 12: "Sé vivir con poco y todo lo acepto." } },
  19: { 23: { 1: "Jehová es mi pastor y nada me falta." } },
  43: { 3: { 16: "Dios amó tanto al mundo que dio a su Hijo.", 17: "" } },
  1: { 1: { 1: "Al principio todo era oscuridad y luego puedo ver." } },
} };
const B = { sigla: "RVR 1960", libros: {
  50: { 4: { 13: "Todo lo puedo en Cristo que me fortalece." } },
  19: { 23: { 2: "En lugares de delicados pastos me hará descansar." } },
} };
const indice = crearIndice([A, B]);

test("normalizar quita acentos, mayúsculas y puntuación", () => {
  assert.equal(normalizar("¡Jehová ES!"), "jehova es");
});

test("fichas aplica sinónimos y raíz simple", () => {
  assert.deepEqual(fichas("Señor Jehová Cristo pastores"), ["dios", "dios", "jesus", "pastor"]);
});

test("la frase exacta queda primera", () => {
  const r = buscar(indice, "todo lo puedo en cristo");
  assert.equal(`${r[0].libro} ${r[0].cap}:${r[0].v}`, "50 4:13");
  assert.ok(r[0].puntaje > (r[1]?.puntaje ?? -1));
});

test("sinónimos: «el señor es mi pastor» encuentra «Jehová es mi pastor»", () => {
  const r = buscar(indice, "el señor es mi pastor");
  assert.ok(r.some(x => x.libro === 19 && x.cap === 23 && x.v === 1));
});

test("una sola versión por cita, la de mayor puntaje", () => {
  const r = buscar(indice, "todo lo puedo en cristo que me fortalece");
  const de413 = r.filter(x => x.libro === 50 && x.cap === 4 && x.v === 13);
  assert.equal(de413.length, 1);
  assert.equal(de413[0].sigla, "RVR 1960");
});

test("filtro por versión", () => {
  const r = buscar(indice, "todo lo puedo en cristo", { sigla: "RVR 1960" });
  assert.ok(r.length > 0 && r.every(x => x.sigla === "RVR 1960"));
});

test("consultas vacías o raras no fallan y respetan max (Review Focus 3)", () => {
  assert.deepEqual(buscar(indice, ""), []);
  assert.deepEqual(buscar(indice, "   "), []);
  assert.doesNotThrow(() => buscar(indice, "de"));
  const grande = crearIndice([{ sigla: "X", libros: { 1: { 1: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [i + 1, "amor y paz"])) } } }]);
  assert.equal(buscar(grande, "amor paz", { max: 20 }).length, 20);
});

test("crearIndice omite versículos agrupados vacíos", () => {
  assert.ok(!indice.some(e => e.libro === 43 && e.v === 17));
});

test("palabrasResaltar devuelve las palabras con contenido normalizadas", () => {
  assert.deepEqual(palabrasResaltar("Todo lo puedo en Cristo"), ["todo", "puedo", "cristo"]);
});
