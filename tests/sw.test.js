import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// La lista del service worker se mantiene a mano: esta prueba avisa si falta un módulo o una fuente.
const raiz = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const sw = readFileSync(join(raiz, "sw.js"), "utf8");
const archivos = (dir, ext) => readdirSync(join(raiz, dir)).flatMap(f => {
  const ruta = `${dir}/${f}`;
  return statSync(join(raiz, ruta)).isDirectory() ? archivos(ruta, ext) : f.endsWith(ext) ? [ruta] : [];
});

test("el service worker precachea todos los módulos de src/", () => {
  for (const f of archivos("src", ".js")) assert.ok(sw.includes(`"${f}"`), `falta ${f} en ARCHIVOS`);
});

test("el service worker precachea las fuentes y no los fondos de la lámina", () => {
  for (const f of archivos("assets/fuentes", ".woff2")) assert.ok(sw.includes(f.split("/").pop()), `falta ${f}`);
  assert.ok(!sw.includes("assets/proyeccion/fondos"), "los fondos se guardan al usarlos, no se precachean");
  assert.ok(sw.includes('cache: "reload"'), "la instalación no debe usar la caché HTTP");
});
