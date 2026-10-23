// Envío del bosquejo del teléfono a la tablet por ntfy: el bosquejo se cifra, se parte en trozos y se junta al otro lado.
// Cada mensaje de ntfy admite 4096 bytes; con 3000 caracteres de base64 (ASCII) más el armazón queda muy por debajo.
import { errorCanal } from "../proyeccion/canal.js";
import { cifrar, descifrar } from "./cifrado.js";
import { sanearBosquejo } from "./modelo.js";

const MAX_TROZO = 3000, MAX_TROZOS = 100, MAX_ENVIO = 40, MAX_PENDIENTES = 20;
const idValido = id => typeof id === "string" && id.length >= 1 && id.length <= MAX_ENVIO;

export function trozos(texto, max = MAX_TROZO) {
  const r = [];
  for (let i = 0; i < texto.length; i += max) r.push(texto.slice(i, i + max));
  return r.length ? r : [""];
}

// Valida el mensaje del teléfono ({tipo:"bosquejo"}) o la confirmación de la tablet ({tipo:"recibido"}). null si algo está mal.
export function validarEnvio(m) {
  if (!m || typeof m !== "object" || m.v !== 1 || !Number.isFinite(m.t) || !idValido(m.envio)) return null;
  if (m.de === "tablet" && m.tipo === "recibido") return { v: 1, de: "tablet", tipo: "recibido", envio: m.envio, t: m.t };
  if (m.de === "telefono" && m.tipo === "bosquejo") {
    const { n, total, datos } = m;
    if (!Number.isInteger(total) || total < 1 || total > MAX_TROZOS) return null;
    if (!Number.isInteger(n) || n < 0 || n >= total || typeof datos !== "string") return null;
    return { v: 1, de: "telefono", tipo: "bosquejo", envio: m.envio, n, total, datos, t: m.t };
  }
  return null;
}

export function leerEnvio(texto) {
  try { return validarEnvio(JSON.parse(texto)); } catch { return null; }
}

const idAlAzar = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join("");

// Cifra el bosquejo, lo publica en trozos y espera la confirmación de la tablet hasta `esperarConfirmacion` ms.
// Se suscribe antes de publicar para no perder una confirmación rápida. Devuelve "confirmado" o "pendiente".
// Lanza un errorCanal si no pudo publicar (los errores del canal pasan tal cual; cualquier otro se vuelve de tipo "red").
export async function enviarBosquejo(canal, clave, b, { esperarConfirmacion = 8000, setTimeout: st = (...a) => globalThis.setTimeout(...a),
  clearTimeout: ct = id => globalThis.clearTimeout(id), ahora = () => Date.now() } = {}) {
  const envio = idAlAzar();
  let confirmar;
  const confirmada = new Promise(res => { confirmar = res; });
  const cerrar = canal.escuchar(m => {
    if (m.de === "tablet" && m.tipo === "recibido" && m.envio === envio) confirmar("confirmado"); // lo que publica el teléfono se ignora
  });
  let plazo = null;
  try {
    const partes = trozos(await cifrar(clave, b));
    for (let n = 0; n < partes.length; n++) {
      try { await canal.publicar({ v: 1, de: "telefono", tipo: "bosquejo", envio, n, total: partes.length, datos: partes[n], t: ahora() }); }
      catch (e) { throw e?.tipo ? e : errorCanal("red", "Sin red o ntfy no respondió"); }
    }
    const vencido = new Promise(res => { plazo = st(() => res("pendiente"), esperarConfirmacion); });
    return await Promise.race([confirmada, vencido]);
  } finally {
    if (plazo !== null) ct(plazo);
    cerrar();
  }
}

// Junta los trozos de cada envío (en cualquier orden, sin contar repetidos). Con todos, descifra, sanea y llama a
// alBosquejo(b, envio) una sola vez. Lo cifrado con otro código o dañado se ignora sin error.
// recibir devuelve una promesa que termina cuando alBosquejo terminó; si alBosquejo falla, esa promesa falla y el envío
// puede reprocesarse cuando sus trozos lleguen otra vez.
export function crearReceptor(clave, alBosquejo) {
  const pendientes = new Map(); // envio -> { total, partes: Map(n -> datos) }
  const hechos = new Set();
  return {
    async recibir(msg) {
      if (!msg || msg.de !== "telefono" || msg.tipo !== "bosquejo" || hechos.has(msg.envio)) return;
      let e = pendientes.get(msg.envio);
      if (!e) {
        if (pendientes.size >= MAX_PENDIENTES) pendientes.delete(pendientes.keys().next().value); // se descarta el más viejo
        e = { total: msg.total, partes: new Map() };
        pendientes.set(msg.envio, e);
      }
      if (msg.total !== e.total || msg.n >= e.total || e.partes.has(msg.n)) return;
      e.partes.set(msg.n, msg.datos);
      if (e.partes.size < e.total) return;
      pendientes.delete(msg.envio);
      hechos.add(msg.envio);
      const b = sanearBosquejo(await descifrar(clave, Array.from({ length: e.total }, (_, i) => e.partes.get(i)).join("")));
      if (!b) return;
      // Si alBosquejo falla (p. ej. la tablet no pudo guardar), el envío no queda como hecho: al volver a llegar se procesa de nuevo.
      try { await alBosquejo(b, msg.envio); } catch (err) { hechos.delete(msg.envio); throw err; }
    },
  };
}
