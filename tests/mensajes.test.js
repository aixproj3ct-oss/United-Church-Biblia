import { test } from "node:test";
import assert from "node:assert/strict";
import { generarCodigo, normalizarCodigo, temaDe, msgPasaje, msgParte, msgEspera, msgEstado, msgLamina, validar, leer, crearOrden, paraArrancar } from "../src/proyeccion/mensajes.js";

test("generarCodigo con azar fijo", () => {
  assert.equal(generarCodigo(() => Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7])), "UC-2345-6789");
  for (let i = 0; i < 200; i++) assert.match(generarCodigo(), /^UC-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
});

test("normalizarCodigo", () => {
  for (const c of ["uc-7k4p-9qx2", " UC 7K4P 9QX2 ", "7k4p9qx2"]) assert.equal(normalizarCodigo(c), "UC-7K4P-9QX2");
  for (const c of ["UC-7K4P-9QX", "UC-0K4P-9QX2", "", null]) assert.equal(normalizarCodigo(c), null);
  assert.equal(normalizarCodigo("UCAB-CDEF"), "UC-UCAB-CDEF");
});

test("temaDe", () => {
  assert.equal(temaDe("UC-7K4P-9QX2"), "uc-proy-7k4p9qx2");
});

const ok = msgPasaje({ codigo: "1CO.13.4-7", sigla: "TLA", completo: false }, 5);

test("msgPasaje y validar ida y vuelta", () => {
  assert.deepEqual(validar(ok), { v: 1, de: "tablet", tipo: "pasaje", codigo: "1CO.13.4-7", sigla: "TLA", completo: false, parte: 0, t: 5 });
  assert.deepEqual(validar(msgParte(2, 6)), { v: 1, de: "tablet", tipo: "parte", parte: 2, t: 6 });
  assert.deepEqual(validar(msgEstado({ codigo: "PSA.119", partes: 3, parte: 1 }, 7)), { v: 1, de: "pantalla", tipo: "estado", codigo: "PSA.119", partes: 3, parte: 1, t: 7 });
});

test("validar rechaza basura (Review Focus 3)", () => {
  const malos = [null, {}, { ...ok, v: 2 }, { ...ok, codigo: "<img>" }, { ...ok, parte: -1 }, { ...ok, parte: 1.5 },
    { ...ok, sigla: "<b>" }, { ...ok, sigla: "" }, { ...ok, completo: "no" }, { ...ok, t: NaN },
    msgEstado({ codigo: "PSA.119", partes: 3, parte: 3 }, 1)];
  for (const m of malos) assert.equal(validar(m), null, JSON.stringify(m));
  assert.equal("extra" in validar({ ...ok, extra: "x" }), false);
});

test("leer nunca lanza", () => {
  assert.equal(leer("{roto"), null);
  assert.equal(leer("null"), null);
  assert.deepEqual(leer(JSON.stringify(msgEspera(9))), { v: 1, de: "tablet", tipo: "espera", t: 9 });
});

test("crearOrden (Review Focus 2)", () => {
  const acepta = crearOrden();
  assert.equal(acepta({ de: "tablet", t: 10 }), true);
  assert.equal(acepta({ de: "tablet", t: 9 }), false);
  assert.equal(acepta({ de: "tablet", t: 10 }), false);
  assert.equal(acepta({ de: "pantalla", t: 5 }), true);
});

test("crearOrden rechaza mensajes con hora más de 5 s en el futuro", () => {
  const acepta = crearOrden(() => 1000);
  assert.equal(acepta({ de: "tablet", t: 900 }), true);
  assert.equal(acepta({ de: "tablet", t: 70000 }), false);
  assert.equal(acepta({ de: "tablet", t: 950 }), true);
});


// ---- Mensaje "lamina" (bosquejo del sermón): solo títulos, frases y referencias, nunca texto bíblico ni notas privadas ----
const bosq = () => ({
  id: "b1", fecha: "2026-10-25", titulo: "Salvos por gracia", cita: "EPH.2.8-9",
  puntos: [{ frase: "Es un regalo", versos: ["EPH.2.8", "ROM.6.23"] }, { frase: "Sin versículos", versos: [] }],
  recuerda: "¡Dios te ama!",
});

test("msgLamina ida y vuelta por leer()", () => {
  const m = msgLamina({ bosquejo: bosq(), i: 2, sigla: "TLA" }, 50);
  assert.deepEqual(m, { v: 1, de: "tablet", tipo: "lamina", bosquejo: bosq(), i: 2, sigla: "TLA", parte: 0, t: 50 });
  assert.deepEqual(leer(JSON.stringify(m)), m);
  assert.equal(msgLamina({ bosquejo: bosq(), i: 1, sigla: "TLA", parte: 3 }, 51).parte, 3);
  // cita nula y recuerda vacío son válidos; los caracteres especiales pasan tal cual (se escapan al dibujar)
  const raro = { ...bosq(), cita: null, recuerda: "", titulo: "<b>\"A\" & 'B'</b>" };
  assert.deepEqual(leer(JSON.stringify(msgLamina({ bosquejo: raro, i: 0, sigla: "RVR60" }, 52))).bosquejo, raro);
});

test("lamina con un texto de más de 160 en una frase se rechaza", () => {
  const b = bosq();
  b.puntos[0].frase = "x".repeat(161);
  assert.equal(validar(msgLamina({ bosquejo: b, i: 1, sigla: "TLA" }, 1)), null);
  b.puntos[0].frase = "x".repeat(160);
  assert.notEqual(validar(msgLamina({ bosquejo: b, i: 1, sigla: "TLA" }, 1)), null);
});

test("lamina con un código bíblico inválido se rechaza", () => {
  const con = f => { const b = bosq(); f(b); return validar(msgLamina({ bosquejo: b, i: 1, sigla: "TLA" }, 1)); };
  assert.equal(con(b => { b.puntos[0].versos[1] = "<img>"; }), null);
  assert.equal(con(b => { b.cita = "XYZ.1.1"; }), null);
  assert.equal(con(b => { b.cita = 5; }), null);
  assert.equal(con(b => { b.puntos[0].versos[0] = null; }), null);
});

test("lamina rechaza tipos, largos y topes incorrectos", () => {
  const con = (f, extra = {}) => { const b = bosq(); f(b); return validar({ ...msgLamina({ bosquejo: b, i: 1, sigla: "TLA" }, 1), ...extra }); };
  assert.notEqual(con(() => {}), null);
  const malos = [
    b => { b.titulo = ""; }, b => { b.titulo = "x".repeat(121); }, b => { b.titulo = 7; },
    b => { b.puntos[0].frase = ""; }, b => { b.puntos[0].frase = 7; },
    b => { b.recuerda = "x".repeat(201); }, b => { b.recuerda = null; },
    b => { b.fecha = "2026-02-30"; }, b => { b.fecha = "25/10/2026"; },
    b => { b.id = ""; }, b => { b.id = "x".repeat(41); }, b => { b.id = 4; },
    b => { b.puntos = []; }, b => { b.puntos = Array(7).fill({ frase: "a", versos: [] }); },
    b => { b.puntos[0].versos = Array(7).fill("EPH.2.8"); }, b => { b.puntos[0].versos = "EPH.2.8"; },
    b => { b.puntos = "no"; }, b => { b.puntos[0] = null; },
  ];
  for (const f of malos) assert.equal(con(f), null, f.toString());
  assert.equal(validar({ ...msgLamina({ bosquejo: null, i: 1, sigla: "TLA" }, 1) }), null);
  assert.equal(con(() => {}, { i: -1 }), null);
  assert.equal(con(() => {}, { i: 1.5 }), null);
  assert.equal(con(() => {}, { parte: 500 }), null);
  assert.equal(con(() => {}, { sigla: "<b>" }), null);
  // seis puntos y seis versos son el tope y valen
  assert.notEqual(con(b => { b.puntos = Array(6).fill({ frase: "a", versos: Array(6).fill("EPH.2.8") }); }), null);
});

test("lamina valida solo reconstruye los campos conocidos", () => {
  const m = { ...msgLamina({ bosquejo: bosq(), i: 1, sigla: "TLA" }, 1), extra: "x" };
  m.bosquejo = { ...m.bosquejo, intro: "nota privada" };
  m.bosquejo.puntos = m.bosquejo.puntos.map(p => ({ ...p, explicacion: "nota privada" }));
  const v = validar(m);
  assert.equal("extra" in v, false);
  assert.equal("intro" in v.bosquejo, false);
  assert.equal("explicacion" in v.bosquejo.puntos[0], false);
  assert.deepEqual(v.bosquejo, bosq());
});

test("estado con bosquejo+lamina sin codigo es válido; con lamina pero sin bosquejo no", () => {
  const e = msgEstado({ bosquejo: "b1", lamina: 2, partes: 2, parte: 1, sigla: "TLA", sinTexto: 1, error: "mostrar" }, 9);
  assert.deepEqual(validar(e), { v: 1, de: "pantalla", tipo: "estado", bosquejo: "b1", lamina: 2, partes: 2, parte: 1, sigla: "TLA", sinTexto: 1, error: "mostrar", t: 9 });
  assert.equal("codigo" in validar(e), false);
  assert.notEqual(validar(msgEstado({ bosquejo: "b1", lamina: 0, partes: 1, parte: 0 }, 9)), null);
  const malos = [
    { lamina: 2, partes: 2, parte: 1 },                                   // lamina sin bosquejo
    { bosquejo: "b1", partes: 2, parte: 1 },                              // bosquejo sin lamina
    { bosquejo: "", lamina: 0, partes: 1, parte: 0 }, { bosquejo: "x".repeat(41), lamina: 0, partes: 1, parte: 0 },
    { bosquejo: 3, lamina: 0, partes: 1, parte: 0 }, { bosquejo: "b1", lamina: -1, partes: 1, parte: 0 },
    { bosquejo: "b1", lamina: 0, partes: 1, parte: 1 }, { bosquejo: "b1", lamina: 0, partes: 0, parte: 0 },
    { bosquejo: "b1", lamina: 0, partes: 1, parte: 0, codigo: "PSA.119" },  // en lugar de codigo, no junto
    { bosquejo: "b1", lamina: 0, partes: 1, parte: 0, sigla: "<b>" },
    { bosquejo: "b1", lamina: 0, partes: 1, parte: 0, sinTexto: -1 },
    { bosquejo: "b1", lamina: 0, partes: 1, parte: 0, error: "otro" },
    { bosquejo: "b1", lamina: 0, partes: 1, parte: 0, espera: true },
  ];
  for (const x of malos) assert.equal(validar({ v: 1, de: "pantalla", tipo: "estado", ...x, t: 1 }), null, JSON.stringify(x));
  // el estado viejo sigue igual
  assert.deepEqual(validar(msgEstado({ codigo: "PSA.119", partes: 3, parte: 1 }, 7)), { v: 1, de: "pantalla", tipo: "estado", codigo: "PSA.119", partes: 3, parte: 1, t: 7 });
  assert.deepEqual(validar(msgEstado({ espera: true }, 8)), { v: 1, de: "pantalla", tipo: "estado", espera: true, t: 8 });
});

const H = 3600 * 1000;
test("paraArrancar repite la última lamina y los parte posteriores", () => {
  const ahora = 100 * H;
  const lam = msgLamina({ bosquejo: bosq(), i: 2, sigla: "TLA" }, ahora - H);
  const p1 = msgParte(1, ahora - H + 10), p2 = msgParte(2, ahora - H + 20);
  const viejaLam = msgLamina({ bosquejo: bosq(), i: 0, sigla: "TLA" }, ahora - 2 * H);
  assert.deepEqual(paraArrancar([viejaLam, lam, p1, p2], ahora), [lam, p1, p2]);
  // un pasaje posterior reemplaza a la lámina, y una lámina posterior al pasaje lo reemplaza a él
  const pas = msgPasaje({ codigo: "PSA.23", sigla: "TLA", completo: true }, ahora - 30 * 60 * 1000);
  assert.deepEqual(paraArrancar([lam, pas], ahora), [pas]);
  assert.deepEqual(paraArrancar([pas, lam, p1], ahora), [lam, p1]);
});

test("una lamina de hace 7 h no se repite", () => {
  const ahora = 100 * H;
  const lam = msgLamina({ bosquejo: bosq(), i: 2, sigla: "TLA" }, ahora - 7 * H);
  assert.deepEqual(paraArrancar([lam, msgParte(1, ahora - 7 * H + 1000)], ahora), []);
});

test("el mensaje lamina más grande permitido mide menos de 4000 bytes", () => {
  const b = {
    id: "x".repeat(40), fecha: "2026-10-25", titulo: "T".repeat(120), cita: "EPH.2.8-9",
    puntos: Array(6).fill(0).map(() => ({ frase: "F".repeat(160), versos: Array(6).fill("EPH.2.8-9") })),
    recuerda: "R".repeat(200),
  };
  const m = msgLamina({ bosquejo: b, i: 40, sigla: "RVR1960", parte: 499 }, Date.now());
  assert.notEqual(validar(m), null);
  assert.ok(JSON.stringify(m).length < 4000, String(JSON.stringify(m).length));
});
