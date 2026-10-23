// Pruebas de lo que cuida el culto: orientación fija y pantalla encendida (Wake Lock).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanearConfig, crearAlmacen, ORIENTACIONES } from "../src/datos.js";

// El lector usa document; con uno mínimo basta (visibilityState lo cambia la prueba del Wake Lock).
globalThis.document = { visibilityState: "visible", querySelector: () => ({}) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const L = await import("../src/lector.js");

// ---------- Orientación ----------

test("orientación: sanearConfig acepta solo horizontal o vertical y por defecto es horizontal", () => {
  assert.deepEqual(ORIENTACIONES, ["horizontal", "vertical"]);
  assert.equal(sanearConfig({ orientacion: "horizontal" }).orientacion, "horizontal");
  assert.equal(sanearConfig({ orientacion: "vertical" }).orientacion, "vertical");
  for (const raro of ["Vertical", "diagonal", "portrait", "", null, undefined, 5, {}, ["vertical"]])
    assert.equal(sanearConfig({ orientacion: raro }).orientacion, "horizontal", String(raro));
  assert.equal(sanearConfig({}).orientacion, "horizontal");
  assert.equal(sanearConfig(null).orientacion, "horizontal");
});

test("orientación: se guarda en la tablet, sobrevive a recargar y una copia vieja sin ella queda en horizontal", () => {
  const m = new Map();
  const storage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
  const a = crearAlmacen(storage);
  assert.equal(a.config().orientacion, "horizontal");
  a.guardarConfig({ orientacion: "vertical" });
  assert.equal(crearAlmacen(storage).config().orientacion, "vertical");
  a.guardarConfig({ orientacion: "giratoria" });
  assert.equal(a.config().orientacion, "horizontal", "un valor raro no se guarda");
  a.importar(JSON.stringify({ version: 1, domingos: [], favoritos: [], historial: [], config: { tema: "oscuro" } }));
  assert.equal(a.config().orientacion, "horizontal");
});

// ---------- Pantalla encendida ----------

test("wake lock: se pide en el lector, se vuelve a pedir al volver a la app y se suelta al salir", async () => {
  const pedidos = [];
  const nuevoCandado = () => {
    const l = { liberado: false, oyentes: [], release: async () => { l.liberado = true; }, addEventListener: (t, f) => l.oyentes.push(f) };
    pedidos.push(l);
    return l;
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { wakeLock: { request: async tipo => { assert.equal(tipo, "screen"); return nuevoCandado(); } } } });
  await L.luzDelLector(true);
  assert.equal(pedidos.length, 1);
  await L.luzDelLector(true); // cada pintado lo vuelve a llamar: no pide otra vez
  assert.equal(pedidos.length, 1);
  // La app se oculta: el navegador lo suelta solo. Al volver, si sigue en el lector, se pide de nuevo.
  pedidos[0].oyentes.forEach(f => f());
  await L.luzAlVolver();
  assert.equal(pedidos.length, 2);
  await L.luzDelLector(false);
  assert.equal(pedidos[1].liberado, true);
  await L.luzAlVolver();
  assert.equal(pedidos.length, 2, "fuera del lector no se vuelve a pedir");
  // Con la app oculta no se pide
  document.visibilityState = "hidden";
  await L.luzDelLector(true);
  assert.equal(pedidos.length, 2);
  document.visibilityState = "visible";
  await L.luzDelLector(false);
});

test("wake lock: sin soporte o si el navegador lo rechaza no hay errores", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  await L.luzDelLector(true);
  await L.luzDelLector(false);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { wakeLock: { request: async () => { throw new Error("denegado"); } } } });
  await L.luzDelLector(true);
  await L.luzAlVolver();
  await L.luzDelLector(false);
});
