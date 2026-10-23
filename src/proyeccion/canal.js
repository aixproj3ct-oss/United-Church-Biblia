// Canal en tiempo real entre la tablet y la pantalla, por ntfy.sh (gratuito, con CORS y SSE).
// fetch, EventSource y el reloj se inyectan para probar sin red ni esperar.
import { leer } from "./mensajes.js";

const ESPERAS = [1000, 2000, 5000, 10000, 30000]; // espera creciente entre reconexiones (la última es el tope)

// Error de publicar: tipo "red" (no hubo conexión o no respondió a tiempo) o "rechazo" (ntfy contestó con un código de error).
export function errorCanal(tipo, mensaje, codigo) {
  const e = new Error(mensaje);
  e.tipo = tipo;
  if (codigo !== undefined) e.codigo = codigo;
  return e;
}

// Señal que se cancela sola pasado el plazo. Con reloj propio (pruebas) se usa AbortController.
function senalConLimite(ms, st, ct, propio) {
  if (!propio && globalThis.AbortSignal?.timeout) return { signal: AbortSignal.timeout(ms), fin() {} };
  const c = new AbortController();
  const id = st(() => c.abort(), ms);
  return { signal: c.signal, fin: () => ct(id) };
}

export function crearCanal(tema, { fetch: f, EventSource: ES, base = "https://ntfy.sh", setTimeout: stp, clearTimeout: ctp, ahora = () => Date.now(),
  plazo = 8000, esperas = ESPERAS, silencio = 90000, revision = 10000 } = {}) {
  const url = `${base}/${tema}`;
  const propio = !!(stp || ctp);
  const st = stp ?? ((...a) => globalThis.setTimeout(...a));
  const ct = ctp ?? (id => globalThis.clearTimeout(id));
  const pedir = (...a) => (f ?? globalThis.fetch)(...a);

  async function recientesConEstado(de) {
    const lim = senalConLimite(plazo, st, ct, propio);
    try {
      const r = await pedir(`${url}/json?poll=1&since=12h`, { signal: lim.signal });
      if (!r.ok) return { mensajes: [], ok: false };
      const ms = [];
      for (const linea of (await r.text()).split("\n")) {
        let d;
        try { d = JSON.parse(linea); } catch { continue; }
        const m = d?.event === "message" ? leer(d.message) : null;
        if (m && m.de === de) ms.push(m);
      }
      return { mensajes: ms.sort((x, y) => x.t - y.t), ok: true };
    } catch { return { mensajes: [], ok: false }; }
    finally { lim.fin(); }
  }

  return {
    async publicar(msg) {
      const lim = senalConLimite(plazo, st, ct, propio);
      let r;
      try { r = await pedir(url, { method: "POST", body: JSON.stringify(msg), signal: lim.signal }); }
      catch { throw errorCanal("red", "Sin red o ntfy no respondió"); }
      finally { lim.fin(); }
      if (!r.ok) throw errorCanal("rechazo", "ntfy " + r.status, r.status);
    },
    // alEstado(true/false): hay o no conexión. alReconectar(): se reabrió tras una caída (conviene pedir lo reciente otra vez).
    // Si EventSource se cierra solo (readyState 2) o pasan `silencio` ms sin señal de vida, se reabre con espera creciente.
    escuchar(alRecibir, alEstado = () => {}, alReconectar = () => {}) {
      let es = null, cerrado = false, intentos = 0, caida = false, vida = ahora(), reabrir = null, vigia = null;

      function abrir() {
        const mio = new (ES ?? globalThis.EventSource)(`${url}/sse`);
        es = mio; vida = ahora();
        const vigente = () => !cerrado && es === mio;
        mio.onopen = () => {
          if (!vigente()) return;
          vida = ahora(); intentos = 0; alEstado(true);
          if (caida) { caida = false; alReconectar(); }
        };
        mio.onerror = () => {
          if (!vigente()) return;
          alEstado(false); caida = true;
          if (mio.readyState === 2) reabrirConEspera(mio);
        };
        mio.addEventListener?.("keepalive", () => { if (vigente()) vida = ahora(); });
        mio.onmessage = ev => {
          if (!vigente()) return;
          vida = ahora(); // cualquier evento (mensaje, open, keepalive) es señal de vida
          let d;
          try { d = JSON.parse(ev.data); } catch { return; }
          if (d?.event !== "message") return;
          const m = leer(d.message);
          if (m) alRecibir(m);
        };
      }
      function reabrirConEspera(viejo) {
        viejo.close();
        const espera = esperas[Math.min(intentos, esperas.length - 1)];
        intentos++;
        ct(reabrir);
        reabrir = st(() => { reabrir = null; if (!cerrado) abrir(); }, espera);
      }
      function revisar() {
        if (cerrado) return;
        if (ahora() - vida > silencio) {
          alEstado(false); caida = true;
          ct(reabrir); reabrir = null;
          es?.close();
          abrir();
        }
        vigia = st(revisar, revision);
      }

      abrir();
      vigia = st(revisar, revision);
      return () => { cerrado = true; ct(reabrir); ct(vigia); es?.close(); };
    },
    // Mensajes válidos de un origen en las últimas 12 h, ordenados por t, y si se pudo pedir (ok:false = sin red o ntfy falló).
    recientesConEstado,
    // Igual, pero sin distinguir fallo de "no hay nada" (vacío si no hay red).
    async recientes(de) { return (await recientesConEstado(de)).mensajes; },
    async ultimo(de) { return (await this.recientes(de)).at(-1) ?? null; },
  };
}

// Pide lo reciente hasta lograrlo, esperando `espera` ms entre intentos (la PC puede arrancar antes que la red).
// alFallo(true/false) informa cada intento. Devuelve los mensajes, o null si `vigente()` dejó de ser verdad.
export async function recientesHastaLograr(canal, de, { espera = 10000, setTimeout: st = (...a) => globalThis.setTimeout(...a),
  alFallo = () => {}, vigente = () => true } = {}) {
  for (;;) {
    const { mensajes, ok } = await canal.recientesConEstado(de);
    if (!vigente()) return null;
    alFallo(!ok);
    if (ok) return mensajes;
    await new Promise(r => st(r, espera));
    if (!vigente()) return null;
  }
}
