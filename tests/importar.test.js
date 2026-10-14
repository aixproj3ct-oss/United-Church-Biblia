import { test } from "node:test";
import assert from "node:assert/strict";
import { importarBiblia, decodificar, ErrorBiblia } from "../src/importar.js";

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
