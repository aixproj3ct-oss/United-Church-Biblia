import { test } from "node:test";
import assert from "node:assert/strict";
import { sanearBosquejo, laminasDe, publicoDe, citasDe, fechaLamina, notasDe, domingoParaBosquejo } from "../src/bosquejo/modelo.js";

// Ayudantes: una cita {codigo, etiqueta} y un bosquejo válido con fecha real.
const v = (codigo, etiqueta = codigo) => ({ codigo, etiqueta });
const ejemplo = (o = {}) => ({
  id: "b1", domingoId: null, fecha: "2026-10-25", titulo: "La gracia", cita: null, intro: "", ...o,
  puntos: o.puntos ?? [{ frase: "Primero", versos: [] }],
  aplicacion: o.aplicacion ?? "", recuerda: o.recuerda ?? "Confía", conclusion: o.conclusion ?? "", actualizado: "2026-10-23T10:00:00.000Z",
});
const dom = (id, fecha, codigos = []) => ({ id, fecha, titulo: "", citas: codigos.map(c => v(c)) });

test("laminasDe: título, un punto sin versículos, un punto con dos, y ¡Recuerda!", () => {
  const b = ejemplo({ puntos: [{ frase: "A", versos: [] }, { frase: "B", versos: [v("EPH.2.8"), v("ROM.3.24")] }], recuerda: "Ora" });
  assert.deepEqual(laminasDe(b), [{ tipo: "titulo" }, { tipo: "punto", p: 0, v: null },
    { tipo: "punto", p: 1, v: 0 }, { tipo: "punto", p: 1, v: 1 }, { tipo: "recuerda" }]);
});
test("sin frase de ¡Recuerda! no hay lámina final", () => assert.equal(laminasDe(ejemplo({ recuerda: "" })).at(-1).tipo, "punto"));
test("fechaLamina usa el formato que pidió el usuario", () => {
  assert.equal(fechaLamina("2026-10-25"), "Octubre 25, 2026");
  assert.equal(fechaLamina("2026-01-04"), "Enero 4, 2026");
  assert.equal(fechaLamina("2026-12-06"), "Diciembre 6, 2026");
});
test("publicoDe no lleva notas privadas", () => {
  const s = JSON.stringify(publicoDe(ejemplo({ intro: "SECRETO1", conclusion: "SECRETO2", aplicacion: "SECRETO3",
    puntos: [{ frase: "A", versos: [], explicacion: "SECRETO4", ilustracion: "SECRETO5" }] })));
  assert.doesNotMatch(s, /SECRETO/);
});
test("publicoDe lleva solo códigos, sin etiquetas ni texto bíblico", () => {
  const p = publicoDe(ejemplo({ cita: v("EPH.2.8-9", "Efesios 2:8-9"), recuerda: "Ora",
    puntos: [{ frase: "A", versos: [v("ROM.3.24", "Romanos 3:24")] }] }));
  assert.deepEqual(p, { id: "b1", fecha: "2026-10-25", titulo: "La gracia", cita: "EPH.2.8-9",
    puntos: [{ frase: "A", versos: ["ROM.3.24"] }], recuerda: "Ora" });
  assert.equal(publicoDe(ejemplo()).cita, null);
});
test("citasDe: cita principal primero, sin repetir", () => {
  const b = ejemplo({ cita: v("EPH.2.8-9"), puntos: [{ frase: "A", versos: [v("EPH.2.8-9"), v("ROM.3.24")] }] });
  assert.deepEqual(citasDe(b).map(c => c.codigo), ["EPH.2.8-9", "ROM.3.24"]);
});
test("citasDe: sin cita principal, solo los versículos de los puntos en orden", () => {
  const b = ejemplo({ puntos: [{ frase: "A", versos: [v("ROM.3.24")] }, { frase: "B", versos: [v("JHN.3.16"), v("ROM.3.24")] }] });
  assert.deepEqual(citasDe(b), [v("ROM.3.24"), v("JHN.3.16")]);
});
test("sanearBosquejo rechaza 0 y 7 puntos y recorta textos largos", () => {
  assert.equal(sanearBosquejo(ejemplo({ puntos: [] })), null);
  assert.equal(sanearBosquejo(ejemplo({ puntos: Array(7).fill({ frase: "x", versos: [] }) })), null);
  assert.equal(sanearBosquejo(ejemplo({ titulo: "t".repeat(300) })).titulo.length, 120);
});
test("sanearBosquejo: largos máximos de cada campo y espacios de los extremos", () => {
  const largo = "x".repeat(5000);
  const s = sanearBosquejo(ejemplo({ titulo: "  Hola  ", intro: largo, aplicacion: largo, conclusion: largo, recuerda: "r".repeat(300),
    puntos: [{ frase: "f".repeat(300), versos: [], explicacion: largo, ilustracion: largo }] }));
  assert.equal(s.titulo, "Hola");
  assert.equal(s.intro.length, 4000);
  assert.equal(s.aplicacion.length, 4000);
  assert.equal(s.conclusion.length, 4000);
  assert.equal(s.recuerda.length, 200);
  assert.equal(s.puntos[0].frase.length, 160);
  assert.equal(s.puntos[0].explicacion.length, 4000);
  assert.equal(s.puntos[0].ilustracion.length, 4000);
});
test("sanearBosquejo rechaza lo inválido: sin id, fecha inexistente, cita mal formada", () => {
  assert.equal(sanearBosquejo(ejemplo({ id: "" })), null);
  assert.equal(sanearBosquejo(ejemplo({ id: undefined })), null);
  assert.equal(sanearBosquejo(ejemplo({ fecha: "2026-02-30" })), null);
  assert.equal(sanearBosquejo(ejemplo({ cita: { codigo: "xx", etiqueta: "x" } })), null);
  assert.equal(sanearBosquejo(ejemplo({ puntos: [{ frase: "A", versos: [{ codigo: "no es", etiqueta: "x" }] }] })), null);
  assert.equal(sanearBosquejo(null), null);
  assert.equal(sanearBosquejo("hola"), null);
});
test("sanearBosquejo acepta un bosquejo válido y limita a 6 versículos por punto", () => {
  const s = sanearBosquejo(ejemplo({ cita: v("EPH.2.8", "Efesios 2:8"),
    puntos: [{ frase: "A", versos: Array.from({ length: 8 }, (_, i) => v(`ROM.3.${i + 1}`)) }] }));
  assert.equal(s.cita.codigo, "EPH.2.8");
  assert.equal(s.puntos[0].versos.length, 6);
  assert.equal(s.domingoId, null);
  assert.equal(s.puntos[0].explicacion, "");
});
test("domingoParaBosquejo: por id, si no por fecha (el más reciente), y marca conflicto", () => {
  const b = ejemplo({ domingoId: "d2", cita: v("EPH.2.8"), puntos: [{ frase: "A", versos: [v("ROM.3.24")] }] });
  // 1) por id, con las mismas citas en el mismo orden: sin conflicto
  const ds = [dom("d1", "2026-10-25"), dom("d2", "2026-10-25", ["EPH.2.8", "ROM.3.24"])];
  assert.deepEqual(domingoParaBosquejo(ds, b), { domingo: ds[1], conflicto: false });
  // 2) sin domingoId: el más reciente de esa fecha (el último guardado), y sus citas distintas son conflicto
  const sinId = ejemplo({ cita: v("EPH.2.8") });
  const dd = [dom("d1", "2026-10-25", ["JHN.3.16"]), dom("d2", "2026-10-18"), dom("d3", "2026-10-25", ["JHN.3.16"])];
  assert.deepEqual(domingoParaBosquejo(dd, sinId), { domingo: dd[2], conflicto: true });
  // 3) mismas citas en otro orden también es conflicto; un domingo sin citas no lo es
  assert.equal(domingoParaBosquejo([dom("d1", "2026-10-25", ["ROM.3.24", "EPH.2.8"])], b).conflicto, true);
  assert.equal(domingoParaBosquejo([dom("d1", "2026-10-25")], b).conflicto, false);
  // sin ningún domingo de esa fecha
  assert.deepEqual(domingoParaBosquejo([dom("d1", "2026-10-18")], b), { domingo: null, conflicto: false });
  assert.deepEqual(domingoParaBosquejo([], b), { domingo: null, conflicto: false });
});
test("domingoParaBosquejo: si cambió la fecha, deja el domingo viejo y busca el de la fecha nueva", () => {
  const b = ejemplo({ domingoId: "viejo", fecha: "2026-11-01" });
  // domingoId apunta a un domingo de otra fecha y no hay uno de la fecha nueva: ninguno
  assert.deepEqual(domingoParaBosquejo([dom("viejo", "2026-10-25", ["JHN.3.16"])], b), { domingo: null, conflicto: false });
  // si ya existe uno con la fecha nueva, se une a ese y el viejo conserva sus citas
  const nuevo = dom("nuevo", "2026-11-01");
  const r = domingoParaBosquejo([dom("viejo", "2026-10-25", ["JHN.3.16"]), nuevo], b);
  assert.equal(r.domingo, nuevo);
});
test("notasDe omite las vacías y no escapa (eso lo hace la vista)", () => {
  const b = ejemplo({ intro: "<b>hola</b> & \"x\"", aplicacion: "", conclusion: "Fin",
    puntos: [{ frase: "A", versos: [], explicacion: "", ilustracion: "Una <i>historia</i>" }, { frase: "B", versos: [], explicacion: "", ilustracion: "" }] });
  assert.deepEqual(notasDe(b, { tipo: "titulo" }).partes, [{ eti: "Introducción", texto: "<b>hola</b> & \"x\"" }]);
  assert.deepEqual(notasDe(b, { tipo: "punto", p: 0, v: null }).partes, [{ eti: "Ilustración", texto: "Una <i>historia</i>" }]);
  assert.deepEqual(notasDe(b, { tipo: "punto", p: 1, v: null }).partes, []);
  assert.deepEqual(notasDe(b, { tipo: "recuerda" }).partes, [{ eti: "Conclusión / llamado", texto: "Fin" }]);
  const c = ejemplo({ aplicacion: "Haz esto", conclusion: "Y esto" });
  assert.deepEqual(notasDe(c, { tipo: "recuerda" }).partes.map(x => x.eti), ["Aplicación", "Conclusión / llamado"]);
  assert.deepEqual(notasDe(c, { tipo: "punto", p: 9, v: null }).partes, []);
  assert.equal(typeof notasDe(c, { tipo: "titulo" }).titulo, "string");
});

test("sanearBosquejo: el título y la frase de cada punto son obligatorios (solo espacios cuenta como vacío)", () => {
  assert.equal(sanearBosquejo(ejemplo({ titulo: "" })), null);
  assert.equal(sanearBosquejo(ejemplo({ titulo: "   " })), null);
  assert.equal(sanearBosquejo(ejemplo({ puntos: [{ frase: "   ", versos: [] }] })), null);
  assert.equal(sanearBosquejo(ejemplo({ puntos: [{ frase: "A", versos: [] }, { frase: "", versos: [] }] })), null);
  assert.ok(sanearBosquejo(ejemplo({ puntos: [{ frase: "A", versos: [] }, { frase: "B", versos: [] }] })));
});

test("notasDe: sin ¡Recuerda! la Aplicación y la Conclusión van en las notas de la última lámina", () => {
  const b = ejemplo({ recuerda: "", aplicacion: "Aplica", conclusion: "Cierra",
    puntos: [{ frase: "A", versos: [], explicacion: "E1", ilustracion: "" }, { frase: "B", versos: [v("EPH.2.8"), v("ROM.3.24")], explicacion: "E2", ilustracion: "" }] });
  const ls = laminasDe(b);
  assert.deepEqual(notasDe(b, ls.at(-1)).partes.map(x => x.eti), ["Explicación", "Aplicación", "Conclusión / llamado"]);
  assert.deepEqual(notasDe(b, ls.at(-2)).partes.map(x => x.eti), ["Explicación"], "solo la última");
  assert.deepEqual(notasDe({ ...b, recuerda: "Ora" }, ls.at(-1)).partes.map(x => x.eti), ["Explicación"], "con ¡Recuerda! no cambia");
});
test("sanearBosquejo rechaza códigos que la PC no podría leer (cita principal y versículos)", () => {
  assert.equal(sanearBosquejo(ejemplo({ cita: v("ZZZ.1.1") })), null);
  assert.equal(sanearBosquejo(ejemplo({ cita: v("EPH.99.1") })), null);
  assert.equal(sanearBosquejo(ejemplo({ puntos: [{ frase: "A", versos: [v("EPH.2.8"), v("XXX.1.1")] }] })), null);
  assert.ok(sanearBosquejo(ejemplo({ cita: v("EPH.2.8-9"), puntos: [{ frase: "A", versos: [v("ROM.3.24")] }] })));
});
