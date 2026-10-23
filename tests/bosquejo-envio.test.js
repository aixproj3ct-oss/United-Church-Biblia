import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDe, cifrar, descifrar, temaTelefono } from "../src/bosquejo/cifrado.js";
import { trozos, leerEnvio, enviarBosquejo, crearReceptor } from "../src/bosquejo/envio.js";
import { sanearBosquejo } from "../src/bosquejo/modelo.js";
import { crearCanal, errorCanal } from "../src/proyeccion/canal.js";
import { temaDe } from "../src/proyeccion/mensajes.js";

const COD = "UC-ABCD-2345", OTRO = "UC-ABCD-2346";

// Un bosquejo válido; `largo` llena las notas hasta tener varios KB.
function ejemplo(largo = 0) {
  const nota = n => ("Texto de nota con ñ y tildes áéí. ".repeat(200)).slice(0, n);
  return sanearBosquejo({ id: "b1", fecha: "2026-10-25", titulo: "Salvos por gracia",
    cita: { codigo: "EPH.2.8", etiqueta: "Efesios 2:8" },
    intro: nota(largo), aplicacion: nota(largo), conclusion: nota(largo), recuerda: "La gracia basta",
    puntos: [{ frase: "Es un regalo", versos: [{ codigo: "EPH.2.8", etiqueta: "Efesios 2:8" }], explicacion: nota(largo), ilustracion: nota(largo) }] });
}

// Canal falso: anota el orden de las llamadas y deja simular lo que llega por la suscripción.
function canalFalso({ alPublicar, falla } = {}) {
  const publicados = [], orden = [], oyentes = [];
  return { publicados, orden, oyentes,
    async publicar(m) {
      orden.push("publicar");
      if (falla) throw falla;
      publicados.push(m);
      alPublicar?.(m, oyentes);
    },
    escuchar(fn) { orden.push("escuchar"); oyentes.push(fn); return () => orden.push("cerrar"); } };
}
// Reloj que registra los plazos pedidos y los cumple enseguida.
const relojRapido = () => {
  const plazos = [];
  return { plazos, setTimeout: (fn, ms) => { plazos.push(ms); return globalThis.setTimeout(fn, 0); }, clearTimeout: id => globalThis.clearTimeout(id) };
};

test("temaTelefono sale de un hash: no revela el código, es estable y distinto por código", async () => {
  const tema = await temaTelefono(COD);
  assert.match(tema, /^uc-bosq-[0-9a-f]{16}$/);
  assert.ok(!tema.includes("abcd2345") && !tema.includes("abcd") && !tema.includes("2345"));
  assert.equal(await temaTelefono("uc abcd 2345"), tema);
  assert.notEqual(await temaTelefono(OTRO), tema);
  assert.notEqual(tema, temaDe(COD));
  await assert.rejects(temaTelefono("hola"), /Código no válido/);
});

test("claveDe rechaza un código que no es válido", async () => {
  await assert.rejects(claveDe("hola"), /Código no válido/);
});

test("cifrar y descifrar con el mismo código devuelve el mismo bosquejo", async () => {
  const b = ejemplo();
  const clave = await claveDe(COD);
  const texto = await cifrar(clave, b);
  assert.equal(typeof texto, "string");
  assert.ok(!texto.includes("Salvos"));
  assert.deepEqual(await descifrar(await claveDe("uc abcd 2345"), texto), b);
});

test("descifrar con otro código devuelve null (y con texto dañado, sin lanzar)", async () => {
  const texto = await cifrar(await claveDe(COD), ejemplo());
  const otra = await claveDe(OTRO);
  assert.equal(await descifrar(otra, texto), null);
  assert.equal(await descifrar(await claveDe(COD), texto.slice(0, 40)), null);
  assert.equal(await descifrar(await claveDe(COD), "no es base64 !!"), null);
  assert.equal(await descifrar(await claveDe(COD), ""), null);
});

test("trozos parte el texto en pedazos de hasta max", () => {
  assert.deepEqual(trozos("abcdefg", 3), ["abc", "def", "g"]);
  assert.deepEqual(trozos("abc", 3), ["abc"]);
  assert.equal(trozos("x".repeat(7000)).length, 3);
});

test("leerEnvio valida el mensaje del teléfono y la confirmación de la tablet", () => {
  const ok = { v: 1, de: "telefono", tipo: "bosquejo", envio: "e1", n: 0, total: 2, datos: "AAAA", t: 5 };
  assert.deepEqual(leerEnvio(JSON.stringify(ok)), ok);
  const rec = { v: 1, de: "tablet", tipo: "recibido", envio: "e1", t: 6 };
  assert.deepEqual(leerEnvio(JSON.stringify(rec)), rec);
  const malos = [{ n: 2 }, { n: -1 }, { n: 1.5 }, { total: 0, n: 0 }, { total: 101 }, { datos: 5 }, { datos: undefined }, { envio: "" },
    { envio: "x".repeat(41) }, { envio: 7 }, { v: 2 }, { t: "5" }, { de: "pantalla" }, { tipo: "otro" }];
  for (const m of malos) assert.equal(leerEnvio(JSON.stringify({ ...ok, ...m })), null, JSON.stringify(m));
  assert.equal(leerEnvio(JSON.stringify({ ...rec, envio: "" })), null);
  assert.equal(leerEnvio(JSON.stringify({ ...rec, de: "telefono" })), null);
  assert.equal(leerEnvio("{roto"), null);
  assert.equal(leerEnvio("null"), null);
});

test("un bosquejo de 10 KB se parte en trozos de ≤3000 y el receptor lo junta entero", async () => {
  const b = ejemplo(4000);
  const clave = await claveDe(COD);
  const canal = canalFalso();
  await enviarBosquejo(canal, clave, b, { ...relojRapido(), esperarConfirmacion: 1 });
  const ms = canal.publicados;
  assert.ok(ms.length > 1);
  assert.ok(ms.every(m => m.datos.length <= 3000));
  assert.deepEqual(ms.map(m => m.n), ms.map((_, i) => i));
  assert.ok(ms.every(m => m.total === ms.length && m.envio === ms[0].envio && m.de === "telefono" && m.tipo === "bosquejo" && m.v === 1));
  const llegados = [];
  const rx = crearReceptor(clave, (x, envio) => llegados.push([x, envio]));
  for (const m of ms) await rx.recibir(leerEnvio(JSON.stringify(m)));
  assert.equal(llegados.length, 1);
  assert.deepEqual(llegados[0], [b, ms[0].envio]);
});

test("cada mensaje publicado cabe en los 4096 bytes de ntfy", async () => {
  const canal = canalFalso();
  await enviarBosquejo(canal, await claveDe(COD), ejemplo(4000), { ...relojRapido(), esperarConfirmacion: 1 });
  const llenos = canal.publicados.filter(m => m.datos.length === 3000);
  assert.ok(llenos.length >= 1);
  for (const m of canal.publicados) assert.ok(JSON.stringify(m).length < 4096 && Buffer.byteLength(JSON.stringify(m)) < 4096);
});

test("trozos desordenados o repetidos se juntan una sola vez", async () => {
  const b = ejemplo(4000);
  const clave = await claveDe(COD);
  const canal = canalFalso();
  await enviarBosquejo(canal, clave, b, { ...relojRapido(), esperarConfirmacion: 1 });
  const ms = canal.publicados;
  const llegados = [];
  const rx = crearReceptor(clave, (x, envio) => llegados.push([x, envio]));
  for (const m of [...ms].reverse()) { await rx.recibir(m); await rx.recibir(m); }
  for (const m of ms) await rx.recibir(m); // un envío ya completo no vuelve a entregarse
  assert.equal(llegados.length, 1);
  assert.deepEqual(llegados[0][0], b);
});

test("si alBosquejo falla, el mismo envío se procesa de nuevo cuando sus trozos vuelven a llegar", async () => {
  const b = ejemplo(4000);
  const clave = await claveDe(COD);
  const canal = canalFalso();
  await enviarBosquejo(canal, clave, b, { ...relojRapido(), esperarConfirmacion: 1 });
  let llamadas = 0;
  const llegados = [];
  const rx = crearReceptor(clave, x => { if (++llamadas === 1) throw new Error("no se pudo guardar"); llegados.push(x); });
  const ms = canal.publicados;
  for (const m of ms.slice(0, -1)) await rx.recibir(m);
  await assert.rejects(rx.recibir(ms.at(-1)), /no se pudo guardar/);
  for (const m of ms) await rx.recibir(m);
  assert.equal(llamadas, 2);
  assert.deepEqual(llegados, [b]);
  for (const m of ms) await rx.recibir(m); // ya entregado: no se repite
  assert.equal(llamadas, 2);
});

test("el receptor ignora, sin error, lo cifrado con otro código y lo que no es del teléfono", async () => {
  const canal = canalFalso();
  await enviarBosquejo(canal, await claveDe(OTRO), ejemplo(), { ...relojRapido(), esperarConfirmacion: 1 });
  const llegados = [];
  const rx = crearReceptor(await claveDe(COD), x => llegados.push(x));
  for (const m of canal.publicados) await rx.recibir(m);
  await rx.recibir({ v: 1, de: "tablet", tipo: "recibido", envio: "e", t: 1 });
  await rx.recibir(null);
  assert.deepEqual(llegados, []);
});

test("enviarBosquejo suscribe antes de publicar y devuelve 'confirmado' si llega recibido con su envio", async () => {
  const clave = await claveDe(COD);
  const reloj = relojRapido();
  const canal = canalFalso({ alPublicar: (m, oyentes) => {
    // una tablet rápida y una confirmación de otro envío, durante el envío
    for (const o of oyentes) { o({ v: 1, de: "tablet", tipo: "recibido", envio: "otro", t: 1 }); o({ v: 1, de: "tablet", tipo: "recibido", envio: m.envio, t: 2 }); }
  } });
  assert.equal(await enviarBosquejo(canal, clave, ejemplo(), reloj), "confirmado");
  assert.equal(canal.orden[0], "escuchar");
  assert.equal(canal.orden.at(-1), "cerrar");
});

test("enviarBosquejo devuelve 'pendiente' si pasa el plazo, ignora sus propios mensajes y cierra la suscripción", async () => {
  const clave = await claveDe(COD);
  const reloj = relojRapido();
  const canal = canalFalso({ alPublicar: (m, oyentes) => { for (const o of oyentes) o(m); } }); // el eco de sí mismo
  assert.equal(await enviarBosquejo(canal, clave, ejemplo(), reloj), "pendiente");
  assert.deepEqual(reloj.plazos, [8000]);
  assert.equal(canal.orden.at(-1), "cerrar");
  assert.equal(canal.orden.filter(x => x === "cerrar").length, 1);
});

test("enviarBosquejo lanza error de red si no pudo publicar, y cierra la suscripción", async () => {
  const canal = canalFalso({ falla: errorCanal("red", "Sin red") });
  await assert.rejects(enviarBosquejo(canal, await claveDe(COD), ejemplo(), relojRapido()), e => e.tipo === "red");
  assert.equal(canal.orden.at(-1), "cerrar");
});

// --- Canal: la opción `leer` ---
class ESFalso {
  static ultimo = null;
  constructor(url) { this.url = url; ESFalso.ultimo = this; }
  close() {}
}
const sobre = msg => ({ data: JSON.stringify({ event: "message", message: JSON.stringify(msg) }) });
const msgTel = { v: 1, de: "telefono", tipo: "bosquejo", envio: "e1", n: 0, total: 1, datos: "AAAA", t: 5 };

test("el canal de la pantalla sigue ignorando mensajes del teléfono", () => {
  const recibidos = [];
  const cerrar = crearCanal("uc-proy-abc", { EventSource: ESFalso }).escuchar(m => recibidos.push(m));
  ESFalso.ultimo.onmessage(sobre(msgTel));
  assert.deepEqual(recibidos, []);
  cerrar();
});

test("el canal con leer propio entrega los mensajes del teléfono, en escuchar y en recientes", async () => {
  const recibidos = [];
  const cerrar = crearCanal("uc-bosq-x", { EventSource: ESFalso, leer: leerEnvio }).escuchar(m => recibidos.push(m));
  ESFalso.ultimo.onmessage(sobre(msgTel));
  ESFalso.ultimo.onmessage(sobre({ v: 1, de: "pantalla", tipo: "estado", codigo: "JHN.3.16", partes: 1, parte: 0, t: 6 }));
  assert.deepEqual(recibidos, [msgTel]);
  cerrar();
  const texto = JSON.stringify({ event: "message", message: JSON.stringify(msgTel) }) + "\n";
  const f = async () => ({ ok: true, status: 200, text: async () => texto });
  assert.deepEqual((await crearCanal("t", { fetch: f, leer: leerEnvio }).recientes("telefono")).map(m => m.envio), ["e1"]);
  assert.deepEqual(await crearCanal("t", { fetch: f }).recientes("telefono"), []);
});
