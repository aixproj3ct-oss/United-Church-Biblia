import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacen } from "../src/datos.js";

const memoria = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const cita = (codigo, etiqueta = codigo) => ({ codigo, etiqueta, url: `https://www.bible.com/bible/176/${codigo}.TLA` });

test("domingos: guardar, ordenar, actual y borrar", () => {
  const a = crearAlmacen(memoria());
  const id1 = a.guardarDomingo({ fecha: "2026-10-05", titulo: "Pasado", citas: [cita("JHN.3.16")] });
  const id2 = a.guardarDomingo({ fecha: "2026-10-12", titulo: "Próximo", citas: [cita("EPH.2.8-9")] });
  assert.deepEqual(a.domingos().map(d => d.titulo), ["Próximo", "Pasado"]);
  assert.equal(a.domingoActual("2026-10-08").id, id2);
  assert.equal(a.domingoActual("2026-10-20").id, id2);
  a.guardarDomingo({ id: id1, fecha: "2026-10-05", titulo: "Editado", citas: [] });
  assert.equal(a.domingos().find(d => d.id === id1).titulo, "Editado");
  a.borrarDomingo(id2);
  assert.equal(a.domingoActual("2026-10-08").id, id1);
  assert.equal(crearAlmacen(memoria()).domingoActual("2026-10-08"), null);
});

test("favoritos por serie sin duplicados", () => {
  const a = crearAlmacen(memoria());
  a.agregarFavorito("Bodas", cita("1CO.13.4-7"));
  a.agregarFavorito("Bodas", cita("1CO.13.4-7"));
  a.agregarFavorito("Evangelismo", cita("JHN.3.16"));
  assert.equal(a.favoritos().length, 2);
  assert.deepEqual(a.series(), ["Bodas", "Evangelismo"]);
  a.quitarFavorito(a.favoritos()[0].id);
  assert.equal(a.favoritos().length, 1);
});

test("historial: el más reciente primero, sin repetir, máximo 30", () => {
  let t = 0; const a = crearAlmacen(memoria(), () => new Date(2026, 9, 5, 10, t++));
  for (let i = 1; i <= 35; i++) a.registrarHistorial(cita(`PSA.${i}`));
  a.registrarHistorial(cita("PSA.10"));
  const h = a.historial();
  assert.equal(h.length, 30);
  assert.equal(h[0].cita.codigo, "PSA.10");
  assert.equal(h.filter(x => x.cita.codigo === "PSA.10").length, 1);
});

test("persiste entre instancias y config por defecto", () => {
  const s = memoria();
  const a = crearAlmacen(s);
  assert.deepEqual(a.config(), { nombre: "pastor", letra: "grande", ultimoRespaldo: null });
  a.guardarConfig({ nombre: "Pastor Luis" });
  assert.equal(crearAlmacen(s).config().nombre, "Pastor Luis");
});

test("exportar e importar; importar inválido no borra nada", () => {
  const a = crearAlmacen(memoria(), () => new Date("2026-10-05T12:00:00Z"));
  a.agregarFavorito("Bodas", cita("1CO.13.4-7"));
  const copia = a.exportar();
  assert.equal(a.config().ultimoRespaldo, "2026-10-05T12:00:00.000Z");
  const b = crearAlmacen(memoria());
  b.importar(copia);
  assert.equal(b.favoritos()[0].serie, "Bodas");
  assert.throws(() => b.importar("{\"hola\":1}"), /Archivo no válido/);
  assert.throws(() => b.importar("no es json"), /Archivo no válido/);
  assert.equal(b.favoritos().length, 1);
});

test("storage corrupto arranca vacío sin romperse", () => {
  const s = memoria(); s.setItem("uc-biblia-v1", "{roto");
  assert.deepEqual(crearAlmacen(s).domingos(), []);
});
