import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlTitulo, htmlEncabezado, htmlRecuerda, htmlPunto, TAMANOS_BOSQUEJO } from "../src/proyeccion/lamina-bosquejo.js";
import { laminasDe, publicoDe } from "../src/bosquejo/modelo.js";

const pub = (extra = {}) => ({
  id: "b1", fecha: "2026-10-25", titulo: "La gracia que salva", cita: "EPH.2.8-9",
  puntos: [
    { frase: "Somos salvos por gracia", versos: ["EPH.2.8", "ROM.3.24"] },
    { frase: "Nada nos separa de su amor", versos: ["ROM.8.38-39"] },
    { frase: "Dios cumple lo que promete", versos: [] },
  ],
  recuerda: "Agradece cada día lo que Dios te dio", ...extra,
});

test("htmlTitulo muestra 'Octubre 25, 2026', el título y la cita", () => {
  const h = htmlTitulo(pub());
  assert.match(h, /Octubre 25, 2026/);
  assert.match(h, /La gracia que salva/);
  assert.match(h, /Efesios 2:8-9/);
  assert.match(h, /United Church/);
});

test("htmlEncabezado dice 'Punto 2 de 3'", () => {
  const h = htmlEncabezado(pub(), 1);
  assert.match(h, /Punto 2 de 3/);
  assert.match(h, />2</); // el número en el círculo
  assert.match(h, /Nada nos separa de su amor/);
});

test("htmlRecuerda dice ¡Recuerda!", () => {
  const h = htmlRecuerda(pub());
  assert.match(h, /¡Recuerda!/);
  assert.match(h, /Agradece cada día/);
  assert.match(h, /La gracia que salva/); // el título va en el pie
});

test("el texto del pastor con <script> & comillas sale escapado", () => {
  const raro = pub({ titulo: `<script>alert(1)</script> & "x"`, recuerda: `<b>fuerte</b> & 'ya'` });
  raro.puntos[0].frase = `<img src=x onerror=alert(1)> & "q"`;
  for (const h of [htmlTitulo(raro), htmlEncabezado(raro, 0), htmlRecuerda(raro), htmlPunto(raro, 0, { pie: "<i>pie</i>" })]) {
    assert.ok(!/<script|<img|<b>|<i>/.test(h), h);
  }
  assert.match(htmlTitulo(raro), /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;/);
  assert.match(htmlEncabezado(raro, 0), /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;q&quot;/);
  assert.match(htmlRecuerda(raro), /&lt;b&gt;fuerte&lt;\/b&gt; &amp; &#39;ya&#39;/);
});

test("htmlTitulo sin cita principal no deja un hueco con 'undefined'", () => {
  const h = htmlTitulo(pub({ cita: null }));
  assert.ok(!/undefined|null/.test(h));
  assert.ok(!/class="b-cita"/.test(h));
  assert.match(h, /La gracia que salva/);
});

test("htmlTitulo con una cita que no se entiende tampoco la dibuja", () => {
  assert.ok(!/b-cita/.test(htmlTitulo(pub({ cita: "XXX.9" }))));
});

test("htmlPunto junta encabezado, versículo y pie; con aviso no pone texto bíblico", () => {
  const h = htmlPunto(pub(), 0, { ref: "Efesios 2:8", cuerpo: "<span class=\"vers\">texto</span>", tam: 52, pie: "Reina-Valera 1960 · versículo 1 de 2" });
  assert.match(h, /Punto 1 de 3/);
  assert.match(h, /Efesios 2:8/);
  assert.match(h, /font-size:52px/);
  assert.match(h, /<span class="vers">texto<\/span>/);
  assert.match(h, /versículo 1 de 2/);
  const sin = htmlPunto(pub(), 0, { ref: "Efesios 2:8", aviso: "Este versículo no está <aquí>", pie: "RV" });
  assert.match(sin, /Este versículo no está &lt;aquí&gt;/);
});

test("htmlPunto sin versículo deja solo el encabezado", () => {
  const h = htmlPunto(pub(), 2, {});
  assert.match(h, /Punto 3 de 3/);
  assert.ok(!/b-ref|b-texto|class="pie"/.test(h));
});

test("funciona con el objeto público de verdad: laminasDe lo entiende y no hay notas privadas", () => {
  const completo = { id: "b1", domingoId: null, fecha: "2026-10-25", titulo: "T", cita: { codigo: "EPH.2.8", etiqueta: "Efesios 2:8" },
    intro: "NOTA-INTRO", puntos: [{ frase: "F", versos: [{ codigo: "EPH.2.8", etiqueta: "Efesios 2:8" }], explicacion: "NOTA-EXPL", ilustracion: "NOTA-ILU" }],
    aplicacion: "NOTA-APL", recuerda: "R", conclusion: "NOTA-CON", actualizado: "" };
  const p = publicoDe(completo);
  const lams = laminasDe(p);
  assert.deepEqual(lams.map(l => l.tipo), ["titulo", "punto", "recuerda"]);
  const todo = [htmlTitulo(p), htmlEncabezado(p, 0), htmlPunto(p, 0, { pie: "x" }), htmlRecuerda(p)].join("");
  assert.ok(!/NOTA-/.test(todo));
});

test("los tamaños del versículo en el bosquejo van de 58 a 41", () => {
  assert.deepEqual(TAMANOS_BOSQUEJO, [58, 52, 47, 41]);
});
