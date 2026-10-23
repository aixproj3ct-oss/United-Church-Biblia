import { test } from "node:test";
import assert from "node:assert/strict";
import { vistaListaBosquejos, vistaFormBosquejo, revisarCrudo, bosquejoACrudo } from "../src/bosquejo/vistas.js";

// Ayudantes: una cita {codigo, etiqueta} y un bosquejo válido con fecha real.
const v = (codigo, etiqueta = codigo) => ({ codigo, etiqueta });
const ejemplo = (o = {}) => ({
  id: "b1", domingoId: null, fecha: "2026-10-25", titulo: "La gracia", cita: null, intro: "", aplicacion: "", recuerda: "Confía",
  conclusion: "", actualizado: "2026-10-23T10:00:00.000Z", ...o,
  puntos: o.puntos ?? [{ frase: "Primero", versos: [], explicacion: "", ilustracion: "" }],
});
const punto = (frase = "", versos = []) => ({ frase, versos, explicacion: "", ilustracion: "" });
// El <label for="id"> completo de un campo.
const etiqueta = (html, id) => html.match(new RegExp(`<label for="${id}">[\\s\\S]*?</label>`))?.[0] ?? "";

test("el formulario trae las 7 partes en orden", () => {
  const h = vistaFormBosquejo(ejemplo(), { maxPuntos: 6 });
  const orden = ['for="b-titulo"', 'for="b-fecha"', 'for="b-cita"', 'for="b-intro"', "Punto 1", 'for="b-aplicacion"', 'for="b-recuerda"', 'for="b-conclusion"'];
  let desde = 0;
  for (const t of orden) {
    const i = h.indexOf(t, desde);
    assert.ok(i >= 0, `falta o está fuera de orden: ${t}`);
    desde = i + t.length;
  }
  for (const t of ["Título", "Fecha", "Cita principal", "Introducción", "Aplicación", "¡Recuerda!", "Conclusión"]) assert.ok(h.includes(t), t);
});

test("con 6 puntos no se ofrece Agregar punto", () => {
  const seis = ejemplo({ puntos: Array.from({ length: 6 }, (_, i) => punto(`P${i}`)) });
  assert.ok(!/Agregar punto/.test(vistaFormBosquejo(seis, { maxPuntos: 6 })));
  assert.match(vistaFormBosquejo(ejemplo(), { maxPuntos: 6 }), /Agregar punto/);
  assert.match(vistaFormBosquejo(ejemplo({ puntos: [punto(), punto(), punto()] }), { maxPuntos: 6 }), /Agregar punto/);
});

test("Quitar punto solo aparece si hay más de uno", () => {
  assert.ok(!/Quitar punto/.test(vistaFormBosquejo(ejemplo(), { maxPuntos: 6 })));
  const h = vistaFormBosquejo(ejemplo({ puntos: [punto(), punto()] }), { maxPuntos: 6 });
  assert.equal(h.match(/Quitar punto/g).length, 2);
});

test("lo escrito por el pastor sale escapado", () => {
  const raro = `<script>alert("x")</script> & 'q'`;
  const b = ejemplo({ titulo: raro, intro: raro, recuerda: raro, aplicacion: raro, conclusion: raro,
    puntos: [{ frase: raro, versos: [], explicacion: raro, ilustracion: raro }] });
  for (const h of [vistaFormBosquejo(b, { maxPuntos: 6 }), vistaListaBosquejos([b])]) {
    assert.ok(!h.includes("<script>"), "no debe quedar HTML suelto");
    assert.ok(h.includes("&lt;script&gt;"));
  }
  assert.ok(vistaFormBosquejo(b, { maxPuntos: 6 }).includes("&quot;x&quot;"));
});

test("cada campo privado dice 'Solo para ti' y cada campo proyectado 'Se proyecta'", () => {
  const h = vistaFormBosquejo(ejemplo(), { maxPuntos: 6 });
  for (const id of ["b-intro", "p0-expl", "p0-ilus", "b-aplicacion", "b-conclusion"]) {
    const e = etiqueta(h, id);
    assert.ok(e, `no hay etiqueta de ${id}`);
    assert.match(e, /Solo para ti/, id);
    assert.ok(!/Se proyecta/.test(e), id);
  }
  for (const id of ["b-titulo", "b-fecha", "b-cita", "p0-frase", "p0-versos", "b-recuerda"]) {
    const e = etiqueta(h, id);
    assert.ok(e, `no hay etiqueta de ${id}`);
    assert.match(e, /Se proyecta/, id);
    assert.ok(!/Solo para ti/.test(e), id);
  }
});

test("los textos tienen el máximo del modelo", () => {
  const h = vistaFormBosquejo(ejemplo(), { maxPuntos: 6 });
  const max = (id, n) => assert.match(h, new RegExp(`id="${id}"[^>]*maxlength="${n}"`), id);
  max("b-titulo", 120); max("p0-frase", 160); max("b-recuerda", 200);
  for (const id of ["b-intro", "p0-expl", "p0-ilus", "b-aplicacion", "b-conclusion"]) max(id, 4000);
});

test("un bosquejo nuevo trae un punto vacío, la fecha del próximo domingo y se guarda sin 'Borrar'", () => {
  const h = vistaFormBosquejo(null, { maxPuntos: 6 });
  assert.match(h, /data-punto="0"/);
  assert.ok(!/data-punto="1"/.test(h));
  assert.match(h, /id="b-fecha"[^>]*value="\d{4}-\d{2}-\d{2}"/);
  assert.match(h, /Guardar bosquejo/);
  assert.ok(!/Borrar bosquejo/.test(h));
});

test("uno que ya existe trae sus valores, las citas como texto y el botón Borrar bosquejo", () => {
  const b = ejemplo({ cita: v("EPH.2.8-9", "Efesios 2:8-9"), intro: "Hola",
    puntos: [{ frase: "A", versos: [v("EPH.2.8", "Efesios 2:8"), v("ROM.3.24", "Romanos 3:24")], explicacion: "Exp", ilustracion: "Ilus" }] });
  const h = vistaFormBosquejo(b, { maxPuntos: 6 });
  assert.match(h, /id="b-titulo"[^>]*value="La gracia"/);
  assert.match(h, /id="b-cita"[^>]*value="Efesios 2:8-9"/);
  assert.match(h, /id="b-fecha"[^>]*value="2026-10-25"/);
  assert.match(h, /id="p0-versos"[^>]*>Efesios 2:8\nRomanos 3:24<\/textarea>/);
  assert.match(h, /Borrar bosquejo/);
  assert.match(h, /✓ Efesios 2:8-9/);
});

test("un versículo mal escrito se marca con ✗ y bloquea el guardado", () => {
  const crudo = { ...bosquejoACrudo(ejemplo()), puntos: [{ frase: "A", versos: "ef 2 8\nxyz 99", explicacion: "", ilustracion: "" }] };
  const r = revisarCrudo(crudo);
  assert.equal(r.malo, true);
  assert.match(r.puntos[0].html, /✓ Efesios 2:8/);
  assert.match(r.puntos[0].html, /✗ “xyz 99”/);
  const h = vistaFormBosquejo(null, { maxPuntos: 6, crudo });
  assert.match(h, /✗ “xyz 99”/);
  assert.match(h, /id="b-guardar"[^>]*disabled/);
  assert.match(h, /id="p0-versos"[^>]*>ef 2 8\nxyz 99<\/textarea>/);
});

test("el séptimo versículo de un punto se marca con ✗ y bloquea el guardado", () => {
  const siete = Array.from({ length: 7 }, (_, i) => `jn 3 ${i + 1}`).join("\n");
  const r = revisarCrudo({ ...bosquejoACrudo(ejemplo()), puntos: [{ frase: "A", versos: siete, explicacion: "", ilustracion: "" }] });
  assert.equal(r.malo, true);
  assert.match(r.puntos[0].html, /Máximo 6 versículos por punto/);
  assert.equal(r.puntos[0].html.match(/✗/g).length, 1);
  const seis = revisarCrudo({ ...bosquejoACrudo(ejemplo()), puntos: [{ frase: "A", versos: siete.split("\n").slice(0, 6).join("\n"), explicacion: "", ilustracion: "" }] });
  assert.equal(seis.malo, false);
});

test("la cita principal vacía es válida (null) y una mal escrita bloquea", () => {
  const base = bosquejoACrudo(ejemplo());
  assert.equal(revisarCrudo({ ...base, cita: "  " }).b.cita, null);
  assert.equal(revisarCrudo({ ...base, cita: "  " }).malo, false);
  const ok = revisarCrudo({ ...base, cita: "ef 2 8-9" });
  assert.deepEqual(ok.b.cita, { codigo: "EPH.2.8-9", etiqueta: "Efesios 2:8-9" });
  const mal = revisarCrudo({ ...base, cita: "nolibro 4" });
  assert.equal(mal.malo, true);
  assert.match(mal.cita.html, /✗/);
});

test("revisarCrudo arma el bosquejo con las citas de cada línea, sin líneas vacías", () => {
  const crudo = { ...bosquejoACrudo(ejemplo()), puntos: [{ frase: " A ", versos: "\n ef 2 8 \n\nrom 3 24\n", explicacion: "e", ilustracion: "i" }] };
  const r = revisarCrudo(crudo);
  assert.deepEqual(r.b.puntos[0].versos.map(c => c.codigo), ["EPH.2.8", "ROM.3.24"]);
  assert.equal(r.b.puntos[0].explicacion, "e");
  assert.equal(r.b.fecha, "2026-10-25");
});

test("de un bosquejo al crudo y de vuelta no pierde nada", () => {
  const b = ejemplo({ cita: v("EPH.2.8-9", "Efesios 2:8-9"), intro: "I", aplicacion: "A", conclusion: "C", recuerda: "R",
    puntos: [{ frase: "F", versos: [v("EPH.2.8", "Efesios 2:8")], explicacion: "E", ilustracion: "L" }, punto("Dos")] });
  const r = revisarCrudo(bosquejoACrudo(b));
  assert.equal(r.malo, false);
  assert.deepEqual(r.b.cita, b.cita);
  assert.deepEqual(r.b.puntos, b.puntos);
  for (const k of ["titulo", "intro", "aplicacion", "recuerda", "conclusion", "fecha"]) assert.equal(r.b[k], b[k], k);
});

test("un borrador con forma rara no rompe el formulario", () => {
  const h = vistaFormBosquejo(null, { maxPuntos: 6, crudo: { titulo: 5, puntos: [] } });
  assert.match(h, /data-punto="0"/);
  const mucho = vistaFormBosquejo(null, { maxPuntos: 6, crudo: { puntos: Array.from({ length: 9 }, () => ({})) } });
  assert.ok(!/data-punto="6"/.test(mucho));
});

test("la lista: tarjeta con fecha, título y número de puntos, y el botón Nuevo bosquejo", () => {
  const lista = [ejemplo({ id: "a", titulo: "La gracia", puntos: [punto(), punto(), punto()] }),
    ejemplo({ id: "b", fecha: "2026-11-01", titulo: "", puntos: [punto()] })];
  const h = vistaListaBosquejos(lista);
  assert.match(h, /Nuevo bosquejo/);
  assert.match(h, /data-bq-abrir="a"/);
  assert.match(h, /La gracia/);
  assert.match(h, /3 puntos/);
  assert.match(h, /1 punto(?!s)/);
  assert.match(h, /Sin título/);
  assert.match(h, /octubre/);
});

test("la lista vacía invita a escribir el primero", () => {
  const h = vistaListaBosquejos([]);
  assert.match(h, /Nuevo bosquejo/);
  assert.match(h, /Todavía no hay bosquejos/);
});
