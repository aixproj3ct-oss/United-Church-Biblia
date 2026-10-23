// Pruebas de la pantalla confiable: reconexión, tiempos límite, errores honestos, reloj, rangos y estado en la tablet.
// Todo con reloj falso: ninguna prueba espera de verdad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCanal, errorCanal, recientesHastaLograr } from "../src/proyeccion/canal.js";
import { msgPasaje, msgParte, msgEspera, msgEstado, validar, crearOrden, paraArrancar, crearRecargaDiferida } from "../src/proyeccion/mensajes.js";
import { refDeCodigo, armarPasaje } from "../src/pasaje.js";

const vaciar = () => new Promise(r => setImmediate(r));

// Reloj falso: avanzar(ms) dispara los temporizadores que vencen, en orden, dejando correr las promesas entre uno y otro.
function reloj() {
  let t = 0, n = 0;
  const pend = new Map();
  return {
    ahora: () => t,
    setTimeout: (f, ms) => { pend.set(++n, { f, en: t + ms }); return n; },
    clearTimeout: id => { pend.delete(id); },
    async avanzar(ms) {
      const fin = t + ms;
      for (;;) {
        let sig = null;
        for (const [id, x] of pend) if (x.en <= fin && (!sig || x.en < sig[1].en)) sig = [id, x];
        if (!sig) break;
        pend.delete(sig[0]); t = Math.max(t, sig[1].en); sig[1].f();
        await vaciar();
      }
      t = fin;
      await vaciar();
    },
  };
}

class ES {
  static todos = [];
  constructor(url) { this.url = url; this.cerrado = false; this.readyState = 0; this.oyentes = {}; ES.todos.push(this); }
  addEventListener(tipo, f) { (this.oyentes[tipo] ??= []).push(f); }
  emitir(tipo) { this.oyentes[tipo]?.forEach(f => f({})); }
  close() { this.cerrado = true; this.readyState = 2; }
}
const canalCon = (r, extra = {}) => crearCanal("uc-proy-t", { EventSource: ES, setTimeout: r.setTimeout, clearTimeout: r.clearTimeout, ahora: r.ahora, ...extra });

// ---------- A1: reconexión ----------

test("A1: si EventSource se cierra (readyState 2) reabre con espera creciente 1, 2, 5, 10, 30 s y 30 s de tope", async () => {
  ES.todos = [];
  const r = reloj(), estados = [], reconexiones = [];
  canalCon(r).escuchar(() => {}, e => estados.push(e), () => reconexiones.push(r.ahora()));
  assert.equal(ES.todos.length, 1);
  for (const espera of [1000, 2000, 5000, 10000, 30000, 30000]) {
    const es = ES.todos.at(-1), n = ES.todos.length;
    es.readyState = 2; es.onerror();
    assert.equal(es.cerrado, true);
    await r.avanzar(espera - 1);
    assert.equal(ES.todos.length, n, `antes de ${espera} ms no reabre`);
    await r.avanzar(1);
    assert.equal(ES.todos.length, n + 1, `a los ${espera} ms reabre`);
  }
  assert.deepEqual(estados, Array(6).fill(false));
  ES.todos.at(-1).onopen();
  assert.deepEqual(estados.slice(-1), [true]);
  assert.equal(reconexiones.length, 1, "avisa una vez que se reconectó");
  // al conectar se reinicia la espera: la próxima caída vuelve a 1 s
  const es = ES.todos.at(-1), n = ES.todos.length;
  es.readyState = 2; es.onerror();
  await r.avanzar(1000);
  assert.equal(ES.todos.length, n + 1);
});

test("A1: con readyState 0 el navegador reintenta solo (no se abre otra conexión), pero se avisa al reabrir", async () => {
  ES.todos = [];
  const r = reloj(), reconexiones = [];
  canalCon(r).escuchar(() => {}, () => {}, () => reconexiones.push(1));
  const es = ES.todos[0];
  es.readyState = 0; es.onerror();
  await r.avanzar(5000);
  assert.equal(ES.todos.length, 1);
  es.onopen();
  assert.equal(reconexiones.length, 1);
});

test("A1: 90 s sin ninguna señal reconectan; keepalive y open cuentan como señal de vida", async () => {
  ES.todos = [];
  const r = reloj(), estados = [], reconexiones = [];
  canalCon(r).escuchar(() => {}, e => estados.push(e), () => reconexiones.push(1));
  const es1 = ES.todos[0];
  es1.onopen();
  await r.avanzar(60000);
  es1.emitir("keepalive"); // lo que manda ntfy cada 45 s: no llega a onmessage, hay que escucharlo aparte
  await r.avanzar(60000);
  es1.onmessage({ data: JSON.stringify({ event: "keepalive" }) });
  await r.avanzar(60000);
  es1.onmessage({ data: JSON.stringify({ event: "open" }) });
  await r.avanzar(85000);
  assert.equal(ES.todos.length, 1, "con señales de vida cada menos de 90 s no reconecta");
  await r.avanzar(20000);
  assert.equal(ES.todos.length, 2, "pasados 90 s en silencio reabre");
  assert.equal(es1.cerrado, true);
  assert.equal(estados.at(-1), false);
  ES.todos[1].onopen();
  assert.equal(reconexiones.length, 1);
  assert.equal(estados.at(-1), true);
});

test("A1: lo que llega de una conexión vieja se ignora y cerrar() cancela todo", async () => {
  ES.todos = [];
  const r = reloj(), recibidos = [];
  const cerrar = canalCon(r).escuchar(m => recibidos.push(m));
  const es1 = ES.todos[0];
  es1.readyState = 2; es1.onerror();
  await r.avanzar(1000);
  es1.onmessage({ data: JSON.stringify({ event: "message", message: JSON.stringify(msgEspera(1)) }) });
  assert.equal(recibidos.length, 0);
  ES.todos[1].onmessage({ data: JSON.stringify({ event: "message", message: JSON.stringify(msgEspera(1)) }) });
  assert.equal(recibidos.length, 1);
  const es2 = ES.todos[1];
  es2.readyState = 2; es2.onerror();
  cerrar();
  await r.avanzar(200000);
  assert.equal(ES.todos.length, 2, "tras cerrar no reabre ni vigila");
});

// ---------- A2: publicar ----------

const fetchQueEspera = () => (url, o) => new Promise((_, rechazar) => o.signal.addEventListener("abort", () => rechazar(new Error("abortado"))));

test("A2: publicar sin respuesta a los 8 s lanza tipo red", async () => {
  const r = reloj();
  let termino = false;
  const p = crearCanal("t", { fetch: fetchQueEspera(), setTimeout: r.setTimeout, clearTimeout: r.clearTimeout }).publicar(msgEspera(1));
  const visto = assert.rejects(p, e => e.tipo === "red" && e.codigo === undefined).then(() => { termino = true; });
  await r.avanzar(7999);
  assert.equal(termino, false);
  await r.avanzar(1);
  await visto;
});

test("A2: el tiempo límite también funciona con AbortSignal.timeout real", async () => {
  const vivo = setInterval(() => {}, 5); // el temporizador de AbortSignal no mantiene vivo el proceso
  try {
    await assert.rejects(crearCanal("t", { fetch: fetchQueEspera(), plazo: 20 }).publicar(msgEspera(1)), e => e.tipo === "red");
  } finally { clearInterval(vivo); }
});

test("A2: sin red (fetch falla) es tipo red; 429 es tipo rechazo con su código", async () => {
  await assert.rejects(crearCanal("t", { fetch: async () => { throw new TypeError("Failed to fetch"); } }).publicar(msgEspera(1)), e => e.tipo === "red");
  await assert.rejects(crearCanal("t", { fetch: async () => ({ ok: false, status: 429 }) }).publicar(msgEspera(1)),
    e => e.tipo === "rechazo" && e.codigo === 429 && /ntfy 429/.test(e.message));
  await crearCanal("t", { fetch: async () => ({ ok: true, status: 200 }) }).publicar(msgEspera(1));
  const e = errorCanal("red", "x");
  assert.equal("codigo" in e, false);
});

// ---------- A3: recientes con estado y arranque ----------

const lineas = ms => ms.map(m => JSON.stringify({ event: "message", message: JSON.stringify(m) })).join("\n");

test("A3: recientesConEstado dice si falló; recientes y ultimo siguen igual", async () => {
  const ms = [msgPasaje({ codigo: "JHN.3.16", sigla: "TLA", completo: false }, 10), msgEstado({ codigo: "JHN.3.16", partes: 1, parte: 0 }, 11)];
  const bien = crearCanal("t", { fetch: async () => ({ ok: true, status: 200, text: async () => lineas(ms) }) });
  const r1 = await bien.recientesConEstado("tablet");
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.mensajes.map(m => m.t), [10]);
  for (const f of [async () => ({ ok: false, status: 500 }), async () => { throw new Error("sin red"); }]) {
    const mal = crearCanal("t", { fetch: f });
    assert.deepEqual(await mal.recientesConEstado("tablet"), { mensajes: [], ok: false });
    assert.deepEqual(await mal.recientes("tablet"), []);
    assert.equal(await mal.ultimo("tablet"), null);
  }
  // vacío pero bien: ok true (no es un fallo)
  assert.deepEqual(await crearCanal("t", { fetch: async () => ({ ok: true, text: async () => "" }) }).recientesConEstado("tablet"), { mensajes: [], ok: true });
});

test("A3: si pedir lo reciente falla se reintenta cada 10 s hasta lograrlo", async () => {
  const r = reloj(), fallos = [];
  let llamadas = 0;
  const canal = { recientesConEstado: async () => (++llamadas < 3 ? { mensajes: [], ok: false } : { mensajes: [msgEspera(5)], ok: true }) };
  let resultado = null;
  recientesHastaLograr(canal, "tablet", { setTimeout: r.setTimeout, alFallo: f => fallos.push(f) }).then(x => { resultado = x; });
  await vaciar();
  assert.equal(llamadas, 1);
  await r.avanzar(9999);
  assert.equal(llamadas, 1);
  await r.avanzar(1);
  assert.equal(llamadas, 2);
  await r.avanzar(10000);
  assert.equal(llamadas, 3);
  assert.deepEqual(resultado, [msgEspera(5)]);
  assert.deepEqual(fallos, [true, true, false]);
});

test("A3: reintentar se detiene si ya no es vigente (se cambió el código o se cerró)", async () => {
  const r = reloj();
  let vigente = true, llamadas = 0;
  const canal = { recientesConEstado: async () => { llamadas++; return { mensajes: [], ok: false }; } };
  let resultado;
  recientesHastaLograr(canal, "tablet", { setTimeout: r.setTimeout, vigente: () => vigente }).then(x => { resultado = x; });
  await vaciar();
  vigente = false;
  await r.avanzar(10000);
  assert.equal(resultado, null);
  assert.equal(llamadas, 1);
});

test("A3: al arrancar, un pasaje de más de 6 h no se muestra (queda la espera)", () => {
  const H = 3600 * 1000, ahora = 100 * H;
  const viejo = msgPasaje({ codigo: "JHN.3.16", sigla: "TLA", completo: false }, ahora - 7 * H);
  assert.deepEqual(paraArrancar([viejo, msgParte(1, ahora - 7 * H + 1000)], ahora), []);
  const reciente = msgPasaje({ codigo: "JHN.3.16", sigla: "TLA", completo: false }, ahora - 5 * H);
  const parte = msgParte(1, ahora - 4 * H);
  assert.deepEqual(paraArrancar([msgEspera(1), reciente, parte], ahora), [reciente, parte]);
  assert.deepEqual(paraArrancar([], ahora), []);
  // un mensaje forjado con hora del futuro no tapa al último verdadero
  const forjado = msgPasaje({ codigo: "GEN.1", sigla: "TLA", completo: true }, ahora + 3600 * 1000);
  assert.deepEqual(paraArrancar([reciente, forjado], ahora), [reciente]);
  assert.deepEqual(paraArrancar([parte], ahora), [], "solo cambios de parte sin pasaje: nada que repetir");
  // una espera siempre se repite, por vieja que sea: es lo seguro
  assert.deepEqual(paraArrancar([viejo, msgEspera(ahora - 8 * H + 5)], ahora).map(m => m.tipo), ["espera"]);
});

// ---------- A4: recarga diferida ----------

test("A4: la versión nueva no recarga con un pasaje en pantalla; recarga al pasar a espera", () => {
  let recargas = 0;
  const x = crearRecargaDiferida(() => recargas++);
  x.alEspera();
  assert.equal(recargas, 0, "sin versión nueva no hay nada pendiente");
  x.nuevaVersion(true);
  assert.equal(recargas, 0);
  x.alEspera();
  assert.equal(recargas, 1);
  x.alEspera();
  assert.equal(recargas, 1, "solo una vez");
  x.nuevaVersion(false);
  assert.equal(recargas, 2, "en espera recarga de inmediato");
});

// ---------- A6: reloj ----------

test("A6: tolerancia de 5 s al futuro: 4 s pasa, 6 s se rechaza y cuenta el desfase; un adelantado bloquea como mucho 5 s", () => {
  let ahora = 1_000_000;
  const orden = crearOrden(() => ahora);
  assert.equal(orden({ de: "tablet", t: ahora + 4000 }), true);
  assert.equal(orden({ de: "tablet", t: ahora + 6000 }), false);
  assert.equal(orden.ultimoRechazo, "reloj");
  assert.equal(orden.desfases, 1);
  ahora += 5000; // pasado el adelanto, el siguiente legítimo entra
  assert.equal(orden({ de: "tablet", t: ahora - 200 }), true, "el adelantado no bloquea más allá de la tolerancia");
  assert.equal(orden.ultimoRechazo, null);
  assert.equal(orden({ de: "tablet", t: ahora - 200 }), false, "el mismo mensaje otra vez es repetido");
  assert.equal(orden.ultimoRechazo, "viejo");
  assert.equal(orden.desfases, 1);
});

test("A6: un mensaje forjado con hora lejana no deja nada guardado", () => {
  const ahora = 1_000_000;
  const orden = crearOrden(() => ahora);
  assert.equal(orden({ de: "tablet", t: ahora + 10 * 3600 * 1000 }), false);
  assert.equal(orden({ de: "tablet", t: ahora - 1000 }), true);
});

test("A6: un pasaje anterior que llega después (del historial) no reemplaza al nuevo, aunque la tablet esté adelantada", () => {
  // Revisión de Codex (2026-10-23): con la tablet 4 s adelantada, B llega por SSE y luego A (anterior) desde el historial.
  let ahora = 1_000_000;
  const orden = crearOrden(() => ahora);
  const A = { de: "tablet", t: ahora + 2000 }, B = { de: "tablet", t: ahora + 4000 };
  assert.equal(orden(B), true);
  assert.equal(orden(A), false, "A es anterior a B: no se muestra");
});

// ---------- A7: estado ampliado ----------

test("A7: el estado nuevo con sigla, completo, sinTexto y error es válido y viaja completo", () => {
  const m = msgEstado({ codigo: "PSA.119", partes: 3, parte: 1, sigla: "TLA", completo: true, sinTexto: 2, error: "mostrar" }, 7);
  assert.deepEqual(validar(m), { v: 1, de: "pantalla", tipo: "estado", codigo: "PSA.119", partes: 3, parte: 1, sigla: "TLA", completo: true, sinTexto: 2, error: "mostrar", t: 7 });
});

test("A7: el estado viejo (sin campos nuevos) sigue siendo válido y no se le inventan campos", () => {
  const viejo = { v: 1, de: "pantalla", tipo: "estado", codigo: "PSA.119", partes: 3, parte: 1, t: 7 };
  assert.deepEqual(validar(viejo), viejo);
  assert.deepEqual(msgEstado({ codigo: "PSA.119", partes: 3, parte: 1 }, 7), viejo);
});

test("A7: error sin pasaje (reloj) es válido; campos nuevos malos se rechazan", () => {
  assert.deepEqual(validar(msgEstado({ error: "reloj" }, 9)), { v: 1, de: "pantalla", tipo: "estado", error: "reloj", t: 9 });
  const base = { v: 1, de: "pantalla", tipo: "estado", codigo: "PSA.119", partes: 3, parte: 1, t: 7 };
  for (const mal of [{ ...base, sigla: "<b>" }, { ...base, completo: "si" }, { ...base, sinTexto: -1 }, { ...base, sinTexto: 1.5 }, { ...base, error: "raro" },
    { v: 1, de: "pantalla", tipo: "estado", t: 7 }, { v: 1, de: "pantalla", tipo: "estado", partes: 1, parte: 0, t: 7 }])
    assert.equal(validar(mal), null, JSON.stringify(mal));
});

// ---------- B1: rangos ----------

test("B1: refDeCodigo rechaza capítulos fuera del libro y versículos imposibles", () => {
  for (const c of ["PSA.200.1", "PSA.151", "JHN.22", "JHN.0", "PSA.119.1-10000000", "PSA.119.177", "PSA.119.0", "JHN.3.16-3", "JHN.3.5-4", "PSA.99999999999999999999"])
    assert.equal(refDeCodigo(c), null, c);
  assert.deepEqual(refDeCodigo("PSA.150"), { codigo: "PSA", cap: 150, v1: null, v2: null });
  assert.deepEqual(refDeCodigo("PSA.119.1-176"), { codigo: "PSA", cap: 119, v1: 1, v2: 176 });
  assert.deepEqual(refDeCodigo("JHN.3.16-16"), { codigo: "JHN", cap: 3, v1: 16, v2: 16 });
  assert.deepEqual(refDeCodigo("JHN.21"), { codigo: "JHN", cap: 21, v1: null, v2: null });
});

test("B1: un mensaje con rango absurdo no pasa la validación", () => {
  assert.equal(validar({ v: 1, de: "tablet", tipo: "pasaje", codigo: "PSA.119.1-10000000", sigla: "TLA", completo: false, parte: 0, t: 1 }), null);
});

test("B1: armarPasaje acota el bucle al capítulo real aunque el rango sea enorme", () => {
  const t0 = Date.now();
  const r = armarPasaje({ principal: { sigla: "TLA", cap: { 1: "a", 2: "b" } }, desde: 1, hasta: 1e9 });
  assert.ok(Date.now() - t0 < 200);
  assert.deepEqual(r.bloques.map(b => b.etiqueta), ["1", "2"]);
  assert.ok(r.sinTexto.length <= 176);
  // un versículo que no existe sigue avisando que falta
  assert.deepEqual(armarPasaje({ principal: { sigla: "TLA", cap: { 1: "a" } }, desde: 99, hasta: 99 }).sinTexto, [99]);
});

// ---------- Lector de la tablet (A8, A9, A10): con un document, un sessionStorage y un canal falsos ----------

const setTimeoutReal = globalThis.setTimeout;
globalThis.setTimeout = (...a) => { const t = setTimeoutReal(...a); t?.unref?.(); return t; }; // aviso() de ui.js usa temporizadores de verdad

const elementos = {};
globalThis.document = { querySelector: sel => (elementos[sel] ??= { innerHTML: "", textContent: "", hidden: false, isConnected: true }) };
const almacenamiento = new Map();
globalThis.sessionStorage = { getItem: k => almacenamiento.get(k) ?? null, setItem: (k, v) => almacenamiento.set(k, String(v)), removeItem: k => almacenamiento.delete(k) };

const L = await import("../src/lector.js");

const lectura = (codigo = "JHN.3.16", completo = false) => ({ ref: refDeCodigo(codigo), cita: { codigo, etiqueta: codigo }, completo, sigla: null, domingo: null });
const almacenFalso = { config: () => ({ pantalla: "UC-2345-6789" }), domingos: () => [] };
const LISTA = [{ sigla: "TLA", nombre: "TLA", orden: 1 }];
const bibliasFalsas = (versiones = async () => LISTA) => ({ versiones, principal: async () => "TLA", capitulo: async () => ({ 1: "a", 2: "b" }) });
const barra = () => elementos["#l-barra"].innerHTML;

// Deja el lector listo con un reloj y un canal falsos. `publicados` guarda lo enviado; `llega(m)` simula un mensaje de la pantalla.
async function prepararLector({ falla = null, biblias = bibliasFalsas() } = {}) {
  almacenamiento.clear();
  L.soltarPantalla();
  Object.assign(L.proy, { respuesta: null, codigo: null, completo: null, sigla: null, partes: 1, parte: 0 });
  const r = reloj(), publicados = [];
  let oyente = null;
  const canal = { publicar: async m => { if (falla) throw falla; publicados.push(m); }, escuchar: cb => { oyente = cb; return () => {}; } };
  L.iniciarLector({ almacen: almacenFalso, biblias, ahora: r.ahora, esperar: r.setTimeout, crearCanal: () => canal });
  L.conectarPantalla();
  await L.pintarLector(lectura());
  return { r, publicados, llega: m => oyente(m) };
}
const estadoDe = (codigo, extra = {}) => msgEstado({ codigo, partes: 1, parte: 0, sigla: "TLA", completo: false, ...extra }, 1);

test("A8: Enviando… (ámbar) hasta que la pantalla confirma; En pantalla (verde) solo tras su confirmación", async () => {
  const { publicados, llega } = await prepararLector();
  await L.proyectarActual();
  assert.equal(publicados[0].codigo, "JHN.3.16");
  assert.equal(L.estadoEnvio().tipo, "enviando");
  assert.match(barra(), /class="estado envio"><i><\/i>Enviando…/);
  llega(estadoDe("PSA.23")); // otro pasaje: no confirma
  assert.equal(L.estadoEnvio().tipo, "enviando");
  llega(estadoDe("JHN.3.16", { completo: true })); // el mismo código pero de otro envío (completo distinto): no confirma
  assert.equal(L.estadoEnvio().tipo, "enviando");
  llega(estadoDe("JHN.3.16"));
  assert.equal(L.estadoEnvio().tipo, "ok");
  assert.match(barra(), /class="estado "><i><\/i>En pantalla/);
  assert.match(barra(), /data-quitar-pantalla/);
});

test("A8: Sin respuesta (rojo) a los 5 s sin confirmación", async () => {
  const { r } = await prepararLector();
  await L.proyectarActual();
  await r.avanzar(4999);
  assert.equal(L.estadoEnvio().tipo, "enviando");
  await r.avanzar(2);
  await r.avanzar(300); // la barra se redibuja sola a los 5,2 s
  assert.equal(L.estadoEnvio().tipo, "sin");
  assert.equal(L.sinRespuesta(), true);
  assert.match(barra(), /class="estado mal"><i><\/i>Sin respuesta/);
  assert.match(barra(), /data-reintentar/);
});

test("A8: si publicar falla por red queda Sin respuesta y el aviso de sin conexión", async () => {
  const { publicados } = await prepararLector({ falla: errorCanal("red", "x") });
  await L.proyectarActual();
  assert.equal(publicados.length, 0);
  assert.equal(L.estadoEnvio().tipo, "sin");
  assert.match(barra(), /Sin respuesta/);
  assert.match(elementos["#aviso"].textContent, /Sin conexión/);
});

test("A8: si ntfy rechaza, el aviso trae el código", async () => {
  await prepararLector({ falla: errorCanal("rechazo", "ntfy 429", 429) });
  await L.proyectarActual();
  assert.equal(elementos["#aviso"].textContent, "El servicio de mensajes rechazó el envío (código 429)");
  assert.equal(L.estadoEnvio().tipo, "sin");
});

test("A8: errores de la pantalla se muestran en español", async () => {
  for (const [error, texto] of [["mostrar", "La pantalla no pudo mostrar el pasaje"], ["biblia", "La PC no tiene una Biblia cargada"]]) {
    const { llega } = await prepararLector();
    await L.proyectarActual();
    llega(estadoDe("JHN.3.16", { error }));
    assert.equal(L.estadoEnvio().texto, texto);
    assert.match(barra(), new RegExp(`class="estado mal"><i></i>${texto}`));
    assert.equal(elementos["#aviso"].textContent, texto);
    assert.match(barra(), /data-quitar-pantalla/, "se puede quitar aunque haya error");
  }
});

test("A8: la hora desajustada (error reloj, sin pasaje) solo cuenta si se está esperando respuesta", async () => {
  const { llega } = await prepararLector();
  llega(msgEstado({ error: "reloj" }, 1));
  assert.equal(L.proy.error, null, "sin envío en curso no se hace caso");
  await L.proyectarActual();
  llega(msgEstado({ error: "reloj" }, 2));
  assert.equal(L.estadoEnvio().texto, "La hora de la tablet y la de la PC no coinciden");
  assert.equal(elementos["#aviso"].textContent, "La hora de la tablet y la de la PC no coinciden");
});

test("A8: si faltan versículos en la PC lo dice, pero sigue En pantalla", async () => {
  const { llega } = await prepararLector();
  await L.proyectarActual();
  llega(estadoDe("JHN.3.16", { sinTexto: 2 }));
  assert.equal(L.estadoEnvio().tipo, "ok");
  assert.equal(elementos["#aviso"].textContent, "Faltan versículos en la Biblia de la PC");
  assert.match(barra(), /faltan versículos/);
});

test("A8: cambiar de parte vuelve a Enviando… hasta que la pantalla confirma la parte", async () => {
  const { publicados, llega } = await prepararLector();
  await L.proyectarActual();
  llega(msgEstado({ codigo: "JHN.3.16", partes: 3, parte: 0, sigla: "TLA", completo: false }, 1));
  await L.cambiarParte(1);
  assert.equal(publicados.at(-1).tipo, "parte");
  assert.equal(L.estadoEnvio().tipo, "enviando");
  llega(msgEstado({ codigo: "JHN.3.16", partes: 3, parte: 1, sigla: "TLA", completo: false }, 2));
  assert.equal(L.estadoEnvio().tipo, "ok");
  assert.equal(L.proy.parte, 1);
});

test("A9: la proyección se guarda en sessionStorage (sin texto bíblico) y se restaura al iniciar el lector", async () => {
  const { llega, r } = await prepararLector();
  await L.proyectarActual();
  llega(estadoDe("JHN.3.16"));
  const guardado = JSON.parse(almacenamiento.get("uc-proy"));
  assert.equal(guardado.activo, true);
  assert.equal(guardado.enviado, "JHN.3.16|TLA|false");
  assert.equal(guardado.codigo, "JHN.3.16");
  assert.equal(guardado.sigla, "TLA");
  assert.equal(guardado.partes, 1);
  assert.equal(guardado.parte, 0);
  assert.deepEqual(Object.keys(guardado).sort(), ["activo", "codigo", "completo", "enviado", "error", "pantalla", "parte", "partes", "sigla"]);
  // "recarga": se pierde la memoria del módulo pero queda sessionStorage
  const copia = almacenamiento.get("uc-proy");
  Object.assign(L.proy, { activo: false, enviado: null, codigo: null, confirmado: false, esperando: null, sigla: null });
  almacenamiento.set("uc-proy", copia);
  L.iniciarLector({ almacen: almacenFalso, biblias: bibliasFalsas(), ahora: r.ahora, esperar: r.setTimeout });
  assert.equal(L.proy.activo, true);
  assert.equal(L.proy.enviado, "JHN.3.16|TLA|false");
  assert.equal(L.proy.sigla, "TLA");
  // Tras recargar no se sabe qué muestra la PC: nunca "En pantalla" sin que la pantalla lo confirme (revisión de Codex)
  assert.deepEqual(L.estadoEnvio(), { tipo: "sin", texto: "Sin confirmar" });
  await L.pintarLector(lectura());
  assert.match(barra(), /data-quitar-pantalla/, "tras recargar sigue el botón Quitar");
  assert.match(barra(), /Sin confirmar/);
});

test("A9: lo restaurado sin confirmar vuelve a esperar respuesta; un dato dañado o de otra pantalla se ignora", async () => {
  const { r } = await prepararLector();
  const base = { activo: true, enviado: "JHN.3.16|TLA|false", codigo: "JHN.3.16", partes: 1, parte: 0, sigla: "TLA", completo: false, confirmado: false, pantalla: "UC-2345-6789" };
  const arranca = obj => {
    L.soltarPantalla();
    almacenamiento.set("uc-proy", typeof obj === "string" ? obj : JSON.stringify(obj));
    L.iniciarLector({ almacen: almacenFalso, biblias: bibliasFalsas(), ahora: r.ahora, esperar: r.setTimeout });
    return L.proy.activo;
  };
  assert.equal(arranca(base), true);
  assert.equal(L.estadoEnvio().texto, "Sin confirmar");
  assert.equal(arranca({ ...base, error: "biblia" }), true);
  assert.equal(L.estadoEnvio().tipo, "error", "el error que avisó la pantalla se conserva tras recargar");
  assert.equal(arranca({ ...base, pantalla: "UC-AAAA-BBBB" }), false);
  assert.equal(arranca({ ...base, codigo: "XXX.1" }), false);
  assert.equal(arranca({ ...base, parte: 3 }), false);
  assert.equal(arranca("{roto"), false);
});

test("A9: Quitar deja guardado que ya no se proyecta", async () => {
  const { publicados } = await prepararLector();
  await L.proyectarActual();
  await L.quitarDePantalla();
  assert.equal(publicados.at(-1).tipo, "espera");
  assert.equal(JSON.parse(almacenamiento.get("uc-proy")).activo, false);
});

test("A10: dos dibujos en desorden dejan el último (el viejo no pisa al nuevo)", async () => {
  const esperas = [], enviados = [];
  const biblias = bibliasFalsas(() => new Promise(res => esperas.push(res))); // cada dibujo queda esperando hasta que la prueba lo suelte
  almacenamiento.clear();
  L.soltarPantalla();
  L.iniciarLector({ almacen: almacenFalso, biblias, crearCanal: () => ({ publicar: async m => { enviados.push(m); }, escuchar: () => () => {} }) });
  L.conectarPantalla();
  const A = lectura("JHN.3.16"), B = lectura("PSA.23", true);
  const pa = L.pintarLector(A);
  const pb = L.pintarLector(B);
  await vaciar();
  assert.equal(esperas.length, 2);
  esperas[1](LISTA); // el nuevo termina primero
  await pb;
  assert.equal(L.lecturaMostrada().lectura, B);
  esperas[0](LISTA); // el viejo termina tarde
  await pa;
  assert.equal(L.lecturaMostrada().lectura, B, "el dibujo viejo no cambia lo mostrado");
  const listo = L.proyectarActual(); // también espera a que termine el último dibujo
  await vaciar();
  esperas.slice(2).forEach(res => res(LISTA));
  await listo;
  assert.equal(enviados.at(-1).codigo, "PSA.23", "se proyecta lo último que se ve");
});

// ---------- La pantalla avisa cuando queda en espera; la tablet pregunta qué hay al reconectar o recargar ----------

import { msgConsulta } from "../src/proyeccion/mensajes.js";

test("consulta: la tablet puede preguntar y la pantalla contestar 'en espera' (y no se confunde con un pasaje)", () => {
  assert.deepEqual(validar(msgConsulta(5)), { v: 1, de: "tablet", tipo: "consulta", t: 5 });
  assert.deepEqual(validar(msgEstado({ espera: true }, 7)), { v: 1, de: "pantalla", tipo: "estado", espera: true, t: 7 });
  assert.equal(validar({ v: 1, de: "pantalla", tipo: "estado", espera: true, codigo: "JHN.3.16", partes: 1, parte: 0, t: 1 }), null);
  assert.equal(validar({ v: 1, de: "pantalla", tipo: "estado", espera: "sí", t: 1 }), null);
  // Al arrancar, la pantalla no toma una consulta como "lo último": repite el pasaje de antes
  const ahora = 10_000_000;
  const ms = [msgPasaje({ codigo: "JHN.3.16", sigla: "TLA", completo: false }, ahora - 60_000), msgConsulta(ahora - 1000)];
  assert.equal(paraArrancar(ms, ahora)[0].tipo, "pasaje");
});

async function lectorConCanal() {
  almacenamiento.clear();
  L.soltarPantalla();
  const publicados = [];
  let oyente = null, reconectar = null;
  const canal = { publicar: async m => { publicados.push(m); }, escuchar: (cb, est, rec) => { oyente = cb; reconectar = rec; return () => {}; } };
  L.iniciarLector({ almacen: almacenFalso, biblias: bibliasFalsas(), crearCanal: () => canal });
  L.conectarPantalla();
  await L.pintarLector(lectura());
  return { publicados, llega: m => oyente(m), reconecta: () => reconectar?.() };
}

test("espera: si la pantalla se reinicia y queda en espera, la tablet deja de decir 'En pantalla'", async () => {
  const { llega } = await lectorConCanal();
  await L.proyectarActual();
  llega(msgEstado({ codigo: "JHN.3.16", partes: 1, parte: 0, sigla: "TLA", completo: false }, 1));
  assert.equal(L.estadoEnvio().tipo, "ok");
  llega(msgEstado({ espera: true }, 2));
  assert.equal(L.proy.activo, false);
  assert.doesNotMatch(barra(), /data-quitar-pantalla/);
  assert.match(barra(), /data-proyectar/);
});

test("espera: mientras la tablet espera la respuesta de un envío, un 'en espera' viejo no lo anula", async () => {
  const { llega } = await lectorConCanal();
  await L.proyectarActual();
  assert.equal(L.estadoEnvio().tipo, "enviando");
  llega(msgEstado({ espera: true }, 2)); // la pantalla avisó su arranque antes de procesar el envío
  assert.equal(L.proy.activo, true);
  llega(msgEstado({ codigo: "JHN.3.16", partes: 1, parte: 0, sigla: "TLA", completo: false }, 3));
  assert.equal(L.estadoEnvio().tipo, "ok");
});

test("consulta: tras recargar con algo proyectado y al reconectar, la tablet pregunta qué hay en pantalla", async () => {
  // Proyección guardada antes de "recargar"
  almacenamiento.clear();
  L.soltarPantalla();
  almacenamiento.set("uc-proy", JSON.stringify({ activo: true, enviado: "JHN.3.16|TLA|false", codigo: "JHN.3.16", partes: 1, parte: 0,
    sigla: "TLA", completo: false, error: null, pantalla: "UC-2345-6789" }));
  const publicados = [];
  let oyente = null, reconectar = null;
  const canal = { publicar: async m => { publicados.push(m); }, escuchar: (cb, est, rec) => { oyente = cb; reconectar = rec; return () => {}; } };
  L.iniciarLector({ almacen: almacenFalso, biblias: bibliasFalsas(), crearCanal: () => canal });
  L.conectarPantalla();
  assert.deepEqual(publicados.map(m => m.tipo), ["consulta"], "al arrancar pregunta");
  assert.equal(L.estadoEnvio().texto, "Sin confirmar");
  oyente(msgEstado({ codigo: "JHN.3.16", partes: 1, parte: 0, sigla: "TLA", completo: false }, 5));
  assert.equal(L.estadoEnvio().tipo, "ok", "la pantalla contestó: ahora sí 'En pantalla'");
  reconectar();
  assert.deepEqual(publicados.map(m => m.tipo), ["consulta", "consulta"], "al reconectar vuelve a preguntar");
  L.soltarPantalla();
  reconectar();
  assert.equal(publicados.length, 2, "sin nada proyectado no pregunta");
});
