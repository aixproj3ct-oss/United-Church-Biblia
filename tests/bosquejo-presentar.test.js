// Pruebas de la presentación del bosquejo (vista del pastor): canal falso que guarda lo publicado, reloj y temporizadores falsos.
// Al final, los dos ganchos que el lector (src/lector.js) le da a la presentación.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearPresentacion, htmlMini, htmlContenido, vistaPresentar, htmlReloj, textoEnvio } from "../src/bosquejo/presentar.js";
import { laminasDe } from "../src/bosquejo/modelo.js";
import { msgEstado } from "../src/proyeccion/mensajes.js";

const vaciar = () => new Promise(r => setImmediate(r));

// Un bosquejo con notas privadas reconocibles. Láminas: 0 título, 1 y 2 punto 1 (dos versículos), 3 punto 2, 4 punto 3 (sin versículos), 5 ¡Recuerda!.
const SECRETO = "NOTA-PRIVADA-NO-SALE";
const cita = (codigo, etiqueta) => ({ codigo, etiqueta });
const bosquejo = () => ({
  id: "b1", domingoId: "d1", fecha: "2026-10-25", titulo: "La gracia que salva", cita: cita("EPH.2.8-9", "Efesios 2:8-9"),
  intro: `Intro ${SECRETO}`,
  puntos: [
    { frase: "Es un regalo", versos: [cita("EPH.2.8", "Efesios 2:8"), cita("ROM.6.23", "Romanos 6:23")], explicacion: `Expl ${SECRETO}`, ilustracion: `Ilus ${SECRETO}` },
    { frase: "Nada nos separa", versos: [cita("ROM.8.38-39", "Romanos 8:38-39")], explicacion: "Pablo enumera", ilustracion: "" },
    { frase: "Dios cumple", versos: [], explicacion: "", ilustracion: "" },
  ],
  aplicacion: `Aplic ${SECRETO}`, recuerda: "Por gracia, no por obras", conclusion: `Concl ${SECRETO}`, actualizado: "",
});

// Reloj falso: avanzar(ms) dispara los temporizadores que vencen y deja correr las promesas.
function reloj() {
  let t = 1_000_000, n = 0;
  const pend = new Map();
  return {
    ahora: () => t,
    esperar: (f, ms) => { const id = ++n; pend.set(id, { f, en: t + ms }); return id; },
    pendientes: () => pend.size,
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

function preparar({ falla = null } = {}) {
  const r = reloj(), publicados = [], cambios = [], fallos = [];
  const canal = { publicar: async m => { if (falla?.activo) throw falla.error; publicados.push(m); } };
  const pres = crearPresentacion({ canal, ahora: r.ahora, esperar: r.esperar, alCambiar: () => cambios.push(1), alFallar: e => fallos.push(e) });
  // Lo que contesta la PC cuando muestra una lámina.
  const pantalla = (lamina, partes = 1, parte = 0, extra = {}) =>
    pres.recibirEstado(msgEstado({ bosquejo: "b1", lamina, partes, parte, sigla: "RVR1960", ...extra }, r.ahora()));
  return { r, pres, publicados, cambios, fallos, pantalla };
}
const ultima = p => p.publicados.at(-1);

test("empezar publica la lámina 0 con la parte pública", async () => {
  const { pres, publicados } = preparar();
  assert.equal(await pres.empezar(bosquejo(), "RVR1960"), true);
  assert.equal(publicados.length, 1);
  const m = publicados[0];
  assert.equal(m.tipo, "lamina");
  assert.equal(m.i, 0);
  assert.equal(m.parte, 0);
  assert.equal(m.sigla, "RVR1960");
  assert.equal(m.bosquejo.id, "b1");
  assert.equal(m.bosquejo.titulo, "La gracia que salva");
  assert.deepEqual(m.bosquejo.puntos[0].versos, ["EPH.2.8", "ROM.6.23"]);
  assert.equal(pres.activa(), true);
});

test("lo que se publica nunca lleva notas privadas ni texto bíblico", async () => {
  const { pres, publicados, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  pantalla(0);
  await pres.siguiente(); await pres.irA(5); await pres.cambiarVersion("TLA"); await pres.quitar();
  assert.ok(publicados.length >= 4);
  for (const m of publicados) {
    const json = JSON.stringify(m);
    assert.ok(!json.includes(SECRETO), "sin notas privadas");
    assert.ok(!json.includes("Pablo enumera"), "sin explicaciones");
    assert.ok(!/intro|explicacion|ilustracion|aplicacion|conclusion/.test(json), "sin esos campos");
  }
});

test("siguiente recorre las 2 partes de un versículo largo y luego pasa a la lámina siguiente", async () => {
  const { pres, publicados, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  pantalla(0);
  await pres.siguiente();
  assert.deepEqual([ultima({ publicados }).i, ultima({ publicados }).parte], [1, 0]);
  pantalla(1, 2, 0); // la PC dice que esta lámina tiene 2 partes
  await pres.siguiente();
  assert.deepEqual([ultima({ publicados }).i, ultima({ publicados }).parte], [1, 1], "primero la parte 2 del mismo versículo");
  assert.equal(ultima({ publicados }).tipo, "lamina");
  assert.deepEqual([pres.estado().i, pres.estado().parte, pres.estado().partes], [1, 1, 2]);
  pantalla(1, 2, 1);
  await pres.siguiente();
  assert.deepEqual([ultima({ publicados }).i, ultima({ publicados }).parte], [2, 0], "después, la lámina siguiente en su parte 0");
  assert.equal(pres.estado().partes, 1, "hasta que la PC diga cuántas partes tiene, cuenta 1");
});

test("anterior recorre las partes hacia atrás y luego la lámina anterior (en su parte 0)", async () => {
  const { pres, publicados, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.irA(1); pantalla(1, 2, 0);
  await pres.siguiente(); pantalla(1, 2, 1);
  await pres.anterior();
  assert.deepEqual([ultima({ publicados }).i, ultima({ publicados }).parte], [1, 0]);
  await pres.anterior();
  assert.deepEqual([ultima({ publicados }).i, ultima({ publicados }).parte], [0, 0]);
});

test("anterior en la lámina 0 no hace nada", async () => {
  const { pres, publicados } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  assert.equal(await pres.anterior(), false);
  assert.equal(publicados.length, 1);
  assert.equal(pres.estado().i, 0);
});

test("siguiente en la última lámina no hace nada", async () => {
  const { pres, publicados } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.irA(5);
  const antes = publicados.length;
  assert.equal(await pres.siguiente(), false);
  assert.equal(publicados.length, antes);
  assert.equal(pres.estado().i, 5);
});

test("irA(3) publica la lámina 3 parte 0", async () => {
  const { pres, publicados } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.irA(3);
  assert.deepEqual([ultima({ publicados }).tipo, ultima({ publicados }).i, ultima({ publicados }).parte], ["lamina", 3, 0]);
  assert.equal(pres.estado().i, 3);
  assert.equal(pres.estado().lamina.tipo, "punto");
});

test("irA con un índice que no existe no hace nada", async () => {
  const { pres, publicados } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  for (const malo of [-1, 6, 99, 1.5, NaN, "2"]) assert.equal(await pres.irA(malo), false, String(malo));
  assert.equal(publicados.length, 1);
});

test("envío: enviando hasta que la PC confirma la lámina actual; ok después", async () => {
  const { pres, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  assert.equal(pres.estado().envio, "enviando");
  pantalla(3); // otra lámina: no confirma
  assert.equal(pres.estado().envio, "enviando");
  pantalla(0);
  assert.equal(pres.estado().envio, "ok");
  await pres.siguiente(); // lámina nueva: otra vez a la espera de su confirmación
  assert.equal(pres.estado().envio, "enviando");
  pantalla(1, 2, 0);
  assert.equal(pres.estado().envio, "ok");
  assert.equal(pres.estado().partes, 2);
});

test("sin estado de la PC en 5 s queda 'sin'", async () => {
  const { r, pres, cambios } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await r.avanzar(4999);
  assert.equal(pres.estado().envio, "enviando");
  const antes = cambios.length;
  await r.avanzar(300); // a los 5,2 s la vista se vuelve a dibujar sola
  assert.equal(pres.estado().envio, "sin");
  assert.ok(cambios.length > antes, "avisa a la vista para que se redibuje");
});

test("un estado de otro bosquejo, de otra lámina o de otra parte se ignora", async () => {
  const { r, pres } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  pres.recibirEstado(msgEstado({ bosquejo: "otro", lamina: 0, partes: 1, parte: 0 }, r.ahora()));
  assert.equal(pres.estado().envio, "enviando");
  pres.recibirEstado(msgEstado({ bosquejo: "b1", lamina: 2, partes: 1, parte: 0 }, r.ahora()));
  assert.equal(pres.estado().envio, "enviando");
  pres.recibirEstado(msgEstado({ bosquejo: "b1", lamina: 0, partes: 2, parte: 1 }, r.ahora()));
  assert.equal(pres.estado().envio, "enviando", "otra parte: aún no es la que se pidió");
  pres.recibirEstado(msgEstado({ codigo: "JHN.3.16", partes: 1, parte: 0 }, r.ahora())); // un pasaje
  pres.recibirEstado({ de: "tablet", tipo: "lamina" });
  pres.recibirEstado(null);
  assert.equal(pres.estado().envio, "enviando");
  assert.equal(pres.estado().partes, 1);
});

test("un error de la PC en esta lámina se muestra como error", async () => {
  const { pres, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  pantalla(0, 1, 0, { error: "mostrar" });
  assert.equal(pres.estado().envio, "error");
  assert.equal(pres.estado().error, "mostrar");
  assert.equal(textoEnvio(pres.estado()), "La pantalla no pudo mostrar la lámina");
  await pres.irA(1);
  assert.equal(pres.estado().envio, "enviando", "otra lámina, otro envío: el error anterior ya no cuenta");
});

test("un error de la PC con otra parte pedida igual se avisa (la PC no pudo dibujar la lámina)", async () => {
  const { pres, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.irA(1); pantalla(1, 2, 0);
  await pres.siguiente();
  pantalla(1, 1, 0, { error: "mostrar" });
  assert.equal(pres.estado().envio, "error");
});

test("minutos cuenta desde empezar", async () => {
  const { r, pres } = preparar();
  assert.equal(pres.estado().minutos, 0, "sin empezar");
  await pres.empezar(bosquejo(), "RVR1960");
  assert.equal(pres.estado().minutos, 0);
  await r.avanzar(59_999);
  assert.equal(pres.estado().minutos, 0);
  await r.avanzar(1);
  assert.equal(pres.estado().minutos, 1);
  await r.avanzar(17 * 60_000);
  assert.equal(pres.estado().minutos, 18);
});

test("quitar publica espera y suelta la presentación", async () => {
  const { pres, publicados } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.quitar();
  assert.equal(ultima({ publicados }).tipo, "espera");
  assert.equal(pres.activa(), false);
  const n = publicados.length;
  assert.equal(await pres.siguiente(), false, "ya no hace nada");
  assert.equal(publicados.length, n);
});

test("si quitar no se pudo publicar, la presentación sigue y el error sale", async () => {
  const falla = { activo: false, error: { tipo: "red" } };
  const { pres } = preparar({ falla });
  await pres.empezar(bosquejo(), "RVR1960");
  falla.activo = true;
  await assert.rejects(pres.quitar(), e => e.tipo === "red");
  assert.equal(pres.activa(), true);
});

test("soltar deja la presentación sin publicar nada (la pantalla pasa a otra cosa)", async () => {
  const { pres, publicados } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  pres.soltar();
  assert.equal(pres.activa(), false);
  assert.equal(publicados.length, 1);
});

test("si publicar falla queda 'sin', avisa el error y reintentar vuelve a mandar la lámina", async () => {
  const falla = { activo: false, error: { tipo: "red" } };
  const { pres, publicados, fallos } = preparar({ falla });
  await pres.empezar(bosquejo(), "RVR1960");
  falla.activo = true;
  assert.equal(await pres.siguiente(), false);
  assert.equal(fallos.length, 1);
  assert.equal(fallos[0].tipo, "red");
  assert.equal(pres.estado().i, 1, "la tablet queda donde el pastor quiso estar");
  assert.equal(pres.estado().envio, "sin");
  falla.activo = false;
  assert.equal(await pres.reintentar(), true);
  assert.deepEqual([ultima({ publicados }).i, ultima({ publicados }).parte], [1, 0]);
  assert.equal(pres.estado().envio, "enviando");
});

test("un fallo viejo no marca 'sin' si ya se envió algo más nuevo", async () => {
  const lentos = [];
  const r = reloj();
  const canal = { publicar: m => new Promise((res, rej) => lentos.push({ m, res, rej })) };
  const pres = crearPresentacion({ canal, ahora: r.ahora, esperar: r.esperar });
  const e = pres.empezar(bosquejo(), "RVR1960");
  lentos[0].res(); await e;
  const a = pres.siguiente(), b = pres.siguiente();
  lentos[1].rej({ tipo: "red" }); lentos[2].res();
  await a; await b;
  assert.equal(pres.estado().i, 2);
  assert.notEqual(pres.estado().envio, "sin");
});

test("cambiarVersion vuelve a publicar la lámina actual en la parte 0 con la versión nueva", async () => {
  const { pres, publicados, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.irA(1); pantalla(1, 2, 0);
  await pres.siguiente(); pantalla(1, 2, 1);
  await pres.cambiarVersion("TLA");
  assert.deepEqual([ultima({ publicados }).i, ultima({ publicados }).parte, ultima({ publicados }).sigla], [1, 0, "TLA"]);
  assert.equal(pres.sigla(), "TLA");
  assert.equal(pres.estado().parte, 0);
  assert.equal(pres.estado().envio, "enviando");
});

test("las horas de los mensajes siempre crecen (la PC descarta lo que no es más nuevo)", async () => {
  const { pres, publicados } = preparar(); // el reloj falso no avanza entre envíos
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.siguiente(); await pres.siguiente(); await pres.anterior();
  const ts = publicados.map(m => m.t);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.equal(new Set(ts).size, ts.length);
});

test("cada envío agenda un redibujo a los 5,2 s para que 'sin respuesta' aparezca solo", async () => {
  const { r, pres } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  assert.equal(r.pendientes(), 1);
  await r.avanzar(5200);
  assert.equal(r.pendientes(), 0);
});

test("indice: Título, un número por punto y ¡Recuerda!, con lo que ya pasó y lo actual", async () => {
  const { pres } = preparar();
  assert.deepEqual(pres.indice(), [], "sin empezar");
  await pres.empezar(bosquejo(), "RVR1960");
  assert.deepEqual(pres.indice(), [
    { eti: "Título", i: 0, ya: false, actual: true },
    { eti: "1", i: 1, ya: false, actual: false },
    { eti: "2", i: 3, ya: false, actual: false },
    { eti: "3", i: 4, ya: false, actual: false },
    { eti: "¡Recuerda!", i: 5, ya: false, actual: false },
  ]);
  await pres.irA(2); // segunda lámina del punto 1: el punto 1 sigue siendo el actual
  assert.deepEqual(pres.indice().map(x => [x.eti, x.ya, x.actual]), [
    ["Título", true, false], ["1", false, true], ["2", false, false], ["3", false, false], ["¡Recuerda!", false, false]]);
  await pres.irA(4);
  assert.deepEqual(pres.indice().map(x => [x.eti, x.ya, x.actual]), [
    ["Título", true, false], ["1", true, false], ["2", true, false], ["3", false, true], ["¡Recuerda!", false, false]]);
});

test("un bosquejo sin ¡Recuerda! no tiene esa entrada en el índice", async () => {
  const { pres } = preparar();
  await pres.empezar({ ...bosquejo(), recuerda: "" }, "RVR1960");
  assert.deepEqual(pres.indice().map(x => x.eti), ["Título", "1", "2", "3"]);
});

test("sigue dice qué viene: otra parte del versículo, la lámina siguiente o nada", async () => {
  const { pres, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  assert.equal(pres.sigue().tipo, "lamina");
  assert.equal(pres.sigue().i, 1);
  await pres.irA(1); pantalla(1, 2, 0);
  assert.equal(pres.sigue().tipo, "parte");
  await pres.irA(5);
  assert.equal(pres.sigue(), null);
});

test("notas devuelve las de la lámina actual, tal cual las escribió el pastor", async () => {
  const { pres } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  assert.equal(pres.notas().titulo, "Introducción");
  await pres.irA(1);
  assert.equal(pres.notas().titulo, "Punto 1");
  assert.deepEqual(pres.notas().partes.map(p => p.eti), ["Explicación", "Ilustración"]);
});

// ---------- La vista ----------

test("htmlMini de un versículo muestra el encabezado y la referencia, sin texto bíblico", () => {
  const b = bosquejo(), pub = { id: b.id, fecha: b.fecha, titulo: b.titulo, cita: "EPH.2.8-9", recuerda: b.recuerda,
    puntos: b.puntos.map(p => ({ frase: p.frase, versos: p.versos.map(v => v.codigo) })) };
  const html = htmlMini(pub, laminasDe(b)[1]);
  assert.match(html, /class="mini-lam"/);
  assert.match(html, /Punto 1 de 3/);
  assert.match(html, /Es un regalo/);
  assert.match(html, /Efesios 2:8/);
  assert.ok(!html.includes('class="texto'), "sin cuerpo del versículo");
  assert.match(htmlMini(pub, laminasDe(b)[0]), /Octubre 25, 2026/);
  assert.match(htmlMini(pub, laminasDe(b)[5]), /Por gracia, no por obras/);
});

test("lo que escribió el pastor se escapa en la vista (título, frase, notas, nombre de la versión)", async () => {
  const { pres, pantalla } = preparar();
  const b = bosquejo();
  b.titulo = '<img src=x onerror="alert(1)"> & Cía';
  b.puntos[0].frase = "<script>alert(2)</script>";
  b.puntos[0].explicacion = "<b>negrita</b> \"comillas\"";
  await pres.empezar(b, '<i>RVR</i>');
  pantalla(0);
  await pres.irA(1);
  const html = vistaPresentar(pres, { hora: "11:42" }) + htmlContenido(pres);
  assert.ok(!/<img|<script|<b>negrita|<i>RVR/.test(html), html);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; Cía/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;negrita&lt;\/b&gt; &quot;comillas&quot;/);
});

test("htmlContenido trae En pantalla ahora, Sigue, las notas y los botones", async () => {
  const { pres, pantalla } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  await pres.irA(3); pantalla(3);
  const html = htmlContenido(pres);
  assert.match(html, /En pantalla ahora/);
  assert.match(html, /Sigue/);
  assert.match(html, /Pablo enumera/);
  assert.match(html, /data-p-ant/);
  assert.match(html, /data-p-sig/);
  assert.match(html, /data-p-quitar/);
  assert.match(html, /data-p-ir="0"/);
  assert.match(html, /data-p-ir="5"/);
  assert.match(html, /class="estado "><i><\/i>En pantalla/);
  assert.ok(!html.includes(SECRETO) || html.includes("Pablo"), "solo las notas de esta lámina");
});

test("htmlContenido deshabilita Anterior al inicio y Siguiente al final, y ofrece Reintentar si no hay respuesta", async () => {
  const { r, pres } = preparar();
  await pres.empezar(bosquejo(), "RVR1960");
  assert.match(htmlContenido(pres), /data-p-ant disabled/);
  await r.avanzar(6000);
  assert.match(htmlContenido(pres), /class="estado mal"><i><\/i>Sin respuesta/);
  assert.match(htmlContenido(pres), /data-p-reintentar/);
  await pres.irA(5);
  assert.match(htmlContenido(pres), /data-p-sig disabled/);
});

test("htmlReloj dice la hora y cuánto lleva predicando", () => {
  assert.match(htmlReloj("11:42", 18), /11:42/);
  assert.match(htmlReloj("11:42", 18), /predicando hace 18 min/);
  assert.match(htmlReloj("11:42", 0), /recién empezó/);
});

// ---------- Ganchos del lector ----------

const setTimeoutReal = globalThis.setTimeout;
globalThis.setTimeout = (...a) => { const t = setTimeoutReal(...a); t?.unref?.(); return t; }; // aviso() usa temporizadores de verdad
const elementos = {};
globalThis.document = { querySelector: sel => (elementos[sel] ??= { innerHTML: "", textContent: "", hidden: false, isConnected: true }) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const L = await import("../src/lector.js");
const { refDeCodigo } = await import("../src/pasaje.js");

const almacenFalso = { config: () => ({ pantalla: "UC-2345-6789" }), domingos: () => [] };
const bibliasFalsas = { versiones: async () => [{ sigla: "TLA" }], principal: async () => "TLA", capitulo: async () => ({ 1: "a" }) };
function lectorConCanal({ pantalla = "UC-2345-6789", falla = null } = {}) {
  L.soltarPantalla();
  const publicados = [];
  let oyente = null;
  const canal = { publicar: async m => { if (falla) throw falla; publicados.push(m); }, escuchar: cb => { oyente = cb; return () => {}; } };
  L.iniciarLector({ almacen: { ...almacenFalso, config: () => ({ pantalla }) }, biblias: bibliasFalsas, crearCanal: () => canal });
  L.conectarPantalla();
  return { canal, publicados, llega: m => oyente(m) };
}
const lectura = () => ({ ref: refDeCodigo("JHN.3.16"), cita: { codigo: "JHN.3.16", etiqueta: "Juan 3:16" }, completo: false, sigla: "TLA", domingo: null });

test("lector: canalPantalla devuelve el mismo canal de la pantalla conectada, o null sin pantalla", () => {
  const { canal } = lectorConCanal();
  assert.equal(L.canalPantalla(), canal);
  lectorConCanal({ pantalla: null });
  assert.equal(L.canalPantalla(), null);
  assert.equal(L.hayPantalla(), false);
});

test("lector: alEstadoBosquejo recibe todo estado con bosquejo y los pasajes no se tocan", () => {
  const { llega } = lectorConCanal();
  const recibidos = [];
  L.alEstadoBosquejo(m => recibidos.push(m));
  Object.assign(L.proy, { respuesta: null, codigo: null });
  const estadoB = msgEstado({ bosquejo: "b1", lamina: 2, partes: 2, parte: 1, sigla: "TLA" }, 5);
  llega(estadoB);
  assert.deepEqual(recibidos, [estadoB]);
  assert.notEqual(L.proy.respuesta, null, "la pantalla respondió: Configuración dice Responde");
  assert.equal(L.proy.activo, false);
  assert.equal(L.proy.codigo, null, "la lógica del pasaje ni se entera");
  llega(msgEstado({ codigo: "JHN.3.16", partes: 1, parte: 0, sigla: "TLA", completo: false }, 6));
  llega(msgEstado({ espera: true }, 7));
  assert.equal(recibidos.length, 1, "los estados de pasaje y de espera no van a la presentación");
  L.alEstadoBosquejo(null);
  llega(estadoB); // sin oyente: no pasa nada
  assert.equal(recibidos.length, 1);
});

test("lector: un estado con bosquejo no cambia el estado del pasaje que se esté proyectando", async () => {
  const { llega } = lectorConCanal();
  L.alEstadoBosquejo(() => {});
  await L.pintarLector(lectura());
  await L.proyectarActual();
  assert.equal(L.estadoEnvio().tipo, "enviando");
  llega(msgEstado({ bosquejo: "b1", lamina: 0, partes: 1, parte: 0 }, 5));
  assert.equal(L.estadoEnvio().tipo, "enviando", "no confirma el pasaje");
  L.alEstadoBosquejo(null);
});

test("lector: al proyectar un pasaje se llama alProyectarPasaje, y solo si se pudo publicar", async () => {
  const { publicados } = lectorConCanal();
  let sueltas = 0;
  L.alProyectarPasaje(() => { sueltas++; });
  await L.pintarLector(lectura());
  await L.proyectarActual();
  assert.equal(publicados.at(-1).tipo, "pasaje");
  assert.equal(sueltas, 1);
  lectorConCanal({ falla: { tipo: "red" } });
  L.alProyectarPasaje(() => { sueltas++; });
  await L.pintarLector(lectura());
  await L.proyectarActual();
  assert.equal(sueltas, 1, "si no se pudo publicar, la presentación sigue en pantalla");
  L.alProyectarPasaje(null);
});
