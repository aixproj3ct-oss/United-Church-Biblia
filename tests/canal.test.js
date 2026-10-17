import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCanal } from "../src/proyeccion/canal.js";
import { msgPasaje, msgEspera, msgEstado } from "../src/proyeccion/mensajes.js";

const fetchFalso = (respuesta = { ok: true, status: 200, text: "" }) => {
  const llamadas = [];
  const f = async (url, opc = {}) => {
    llamadas.push({ url, method: opc.method || "GET", body: opc.body });
    if (respuesta instanceof Error) throw respuesta;
    return { ok: respuesta.ok, status: respuesta.status, text: async () => respuesta.text };
  };
  return { f, llamadas };
};

class ESFalso {
  static ultimo = null;
  constructor(url) { this.url = url; this.cerrado = false; ESFalso.ultimo = this; }
  close() { this.cerrado = true; }
}

test("publicar hace POST al tema", async () => {
  const { f, llamadas } = fetchFalso();
  const m = msgEspera(3);
  await crearCanal("uc-proy-abc", { fetch: f }).publicar(m);
  assert.equal(llamadas[0].url, "https://ntfy.sh/uc-proy-abc");
  assert.equal(llamadas[0].method, "POST");
  assert.deepEqual(JSON.parse(llamadas[0].body), m);
});

test("publicar lanza si ntfy responde error", async () => {
  const { f } = fetchFalso({ ok: false, status: 429, text: "" });
  await assert.rejects(crearCanal("t", { fetch: f }).publicar(msgEspera(1)), /ntfy 429/);
});

test("escuchar entrega solo mensajes válidos (Review Focus 3)", () => {
  const recibidos = [], estados = [];
  const cerrar = crearCanal("uc-proy-abc", { EventSource: ESFalso }).escuchar(m => recibidos.push(m), c => estados.push(c));
  const es = ESFalso.ultimo;
  assert.equal(es.url, "https://ntfy.sh/uc-proy-abc/sse");
  es.onopen();
  for (const d of [{ event: "open" }, { event: "message", message: JSON.stringify(msgEspera(1)) }, { event: "message", message: "{roto" }, { event: "keepalive" }])
    es.onmessage({ data: JSON.stringify(d) });
  es.onmessage({ data: "no es json" });
  assert.deepEqual(recibidos, [msgEspera(1)]);
  assert.deepEqual(estados, [true]);
  cerrar();
  assert.equal(es.cerrado, true);
});

test("ultimo devuelve el último de la tablet aunque haya uno de pantalla después (Review Focus 1)", async () => {
  const lineas = [msgPasaje({ codigo: "JHN.3.16", sigla: "TLA", completo: false }, 10), msgPasaje({ codigo: "PSA.23", sigla: "TLA", completo: true }, 20),
    msgEstado({ codigo: "PSA.23", partes: 1, parte: 0 }, 30)].map(m => JSON.stringify({ event: "message", message: JSON.stringify(m) }));
  const { f, llamadas } = fetchFalso({ ok: true, status: 200, text: lineas.join("\n") + "\n" });
  const canal = crearCanal("uc-proy-abc", { fetch: f });
  assert.equal((await canal.ultimo("tablet")).t, 20);
  assert.equal((await canal.ultimo("pantalla")).t, 30);
  assert.equal(llamadas[0].url, "https://ntfy.sh/uc-proy-abc/json?poll=1&since=12h");
});

test("ultimo da null sin red", async () => {
  const { f } = fetchFalso(new Error("sin red"));
  assert.equal(await crearCanal("t", { fetch: f }).ultimo("tablet"), null);
});
