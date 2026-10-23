import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCita } from "../src/citas.js";
import { refDeCodigo, etiquetaRef } from "../src/pasaje.js";
import { LIBROS } from "../src/libros.js";
import { crearAlmacen } from "../src/datos.js";

// Lo que el pastor escribe, lo que la tablet muestra y lo que la pantalla de la iglesia recibe deben ser lo mismo.
test("las 66 libros: cada nombre y abreviatura se lee igual en la tablet y en la pantalla (ida y vuelta)", () => {
  const fallos = [];
  for (const [codigo, nombre, caps, alias] of LIBROS) {
    const cap = caps >= 2 ? 2 : 1;
    for (const a of [nombre, ...alias]) {
      for (const texto of [`${a} ${cap}`, `${a} ${cap} 3`, `${a} ${cap} 3-4`]) {
        const r = parseCita(texto);
        if (!r.ok) { fallos.push(`${texto}: no se entendió`); continue; }
        if (r.ref.codigo !== codigo) { fallos.push(`${texto}: abrió ${r.ref.codigo} en vez de ${codigo}`); continue; }
        const ref = refDeCodigo(r.codigoRef);
        if (!ref) { fallos.push(`${texto}: la pantalla no acepta ${r.codigoRef}`); continue; }
        if (ref.cap !== r.ref.cap || ref.v1 !== r.ref.v1 || ref.v2 !== r.ref.v2) fallos.push(`${texto}: ${r.codigoRef} cambia los números`);
        if (etiquetaRef(ref) !== r.etiqueta) fallos.push(`${texto}: tablet "${r.etiqueta}" y pantalla "${etiquetaRef(ref)}"`);
        const otra = parseCita(r.etiqueta); // el editor del Domingo vuelve a escribir la etiqueta y la vuelve a leer
        if (!otra.ok || otra.codigoRef !== r.codigoRef) fallos.push(`${texto}: la etiqueta "${r.etiqueta}" no se vuelve a leer igual`);
      }
    }
  }
  assert.deepEqual(fallos, []);
});

test("un rango que cruza capítulos se rechaza (nunca se proyecta algo distinto de lo escrito)", () => {
  assert.equal(parseCita("jn 3 16 al 4 2").ok, false);
});

const memoria = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
};

test("el día del culto aparece el Domingo de hoy, no el anterior ni el siguiente", () => {
  const a = crearAlmacen(memoria());
  const cita = [{ codigo: "JHN.3.16", etiqueta: "Juan 3:16", titulo: "" }];
  a.guardarDomingo({ fecha: "2026-10-18", titulo: "Anterior", citas: cita });
  a.guardarDomingo({ fecha: "2026-10-25", titulo: "Hoy", citas: cita });
  a.guardarDomingo({ fecha: "2026-11-01", titulo: "Siguiente", citas: cita });
  assert.equal(a.domingoActual("2026-10-25").titulo, "Hoy");
  assert.equal(a.domingoActual("2026-10-24").titulo, "Hoy", "el sábado ya se ve el del día siguiente");
  assert.equal(a.domingoActual("2026-10-26").titulo, "Siguiente");
});
