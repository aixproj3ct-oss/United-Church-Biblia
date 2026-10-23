// Mensajes entre la tablet y la pantalla de proyección. Solo llevan referencias, nunca texto bíblico.
import { refDeCodigo } from "../pasaje.js";

export const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generarCodigo(azar = n => crypto.getRandomValues(new Uint32Array(n))) {
  const r = azar(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[r[i] % ALFABETO.length];
  return `UC-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizarCodigo(txt) {
  let s = String(txt ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length === 10 && s.startsWith("UC")) s = s.slice(2);
  if (s.length !== 8 || [...s].some(c => !ALFABETO.includes(c))) return null;
  return `UC-${s.slice(0, 4)}-${s.slice(4)}`;
}

export const temaDe = codigo => "uc-proy-" + codigo.replace(/^UC-/, "").replace(/-/g, "").toLowerCase();

export const msgPasaje = ({ codigo, sigla, completo, parte = 0 }, t = Date.now()) => ({ v: 1, de: "tablet", tipo: "pasaje", codigo, sigla, completo, parte, t });
export const msgParte = (parte, t = Date.now()) => ({ v: 1, de: "tablet", tipo: "parte", parte, t });
export const msgEspera = (t = Date.now()) => ({ v: 1, de: "tablet", tipo: "espera", t });
// La tablet pregunta qué hay en pantalla (tras reconectar o recargar); la pantalla contesta con su estado.
export const msgConsulta = (t = Date.now()) => ({ v: 1, de: "tablet", tipo: "consulta", t });
// Errores que la pantalla le cuenta a la tablet: no pudo mostrar el pasaje, la hora no coincide, no hay Biblia cargada.
export const ERRORES = ["mostrar", "reloj", "biblia"];
const sinVacios = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// Estado de la pantalla. sigla/completo/sinTexto (cuántos versículos faltan)/error son opcionales; con error "reloj" no hay pasaje.
// espera:true (sin pasaje) = la pantalla quedó en espera por su cuenta (arrancó sin pasaje reciente o el operador pulsó Esc).
export const msgEstado = ({ codigo, partes, parte, sigla, completo, sinTexto, error, espera }, t = Date.now()) =>
  sinVacios({ v: 1, de: "pantalla", tipo: "estado", codigo, partes, parte, sigla, completo, sinTexto, error, espera: espera ? true : undefined, t });

const entero = n => Number.isInteger(n) && n >= 0 && n < 500;
const siglaValida = s => typeof s === "string" && /^[^<>]{1,20}$/.test(s);

export function validar(m) {
  if (!m || typeof m !== "object" || m.v !== 1 || !Number.isFinite(m.t)) return null;
  const { t } = m;
  if (m.de === "tablet") {
    if (m.tipo === "espera") return { v: 1, de: "tablet", tipo: "espera", t };
    if (m.tipo === "consulta") return { v: 1, de: "tablet", tipo: "consulta", t };
    if (m.tipo === "parte" && entero(m.parte)) return { v: 1, de: "tablet", tipo: "parte", parte: m.parte, t };
    if (m.tipo === "pasaje" && refDeCodigo(m.codigo) && siglaValida(m.sigla) && typeof m.completo === "boolean" && entero(m.parte))
      return { v: 1, de: "tablet", tipo: "pasaje", codigo: m.codigo, sigla: m.sigla, completo: m.completo, parte: m.parte, t };
  }
  if (m.de === "pantalla" && m.tipo === "estado") return validarEstado(m, t);
  return null;
}

// Un estado viejo (solo codigo/partes/parte) sigue siendo válido; los campos nuevos, si vienen, deben ser correctos.
function validarEstado(m, t) {
  const extra = {};
  if (m.sigla !== undefined) { if (!siglaValida(m.sigla)) return null; extra.sigla = m.sigla; }
  if (m.completo !== undefined) { if (typeof m.completo !== "boolean") return null; extra.completo = m.completo; }
  if (m.sinTexto !== undefined) { if (!entero(m.sinTexto)) return null; extra.sinTexto = m.sinTexto; }
  if (m.error !== undefined) { if (!ERRORES.includes(m.error)) return null; extra.error = m.error; }
  const base = { v: 1, de: "pantalla", tipo: "estado" };
  if (m.espera !== undefined) { if (m.espera !== true || m.codigo !== undefined) return null; return { ...base, espera: true, t }; }
  if (m.codigo === undefined) return extra.error ? { ...base, ...extra, t } : null; // sin pasaje, solo un error (p. ej. "reloj")
  if (!refDeCodigo(m.codigo) || !Number.isInteger(m.partes) || m.partes < 1 || m.partes >= 500 || !entero(m.parte) || m.parte >= m.partes) return null;
  return { ...base, codigo: m.codigo, partes: m.partes, parte: m.parte, ...extra, t };
}

export function leer(texto) {
  try { return validar(JSON.parse(texto)); } catch { return null; }
}

// Acepta un mensaje solo si es más nuevo que el último aceptado del mismo origen (evita retrocesos al reconectar)
// y no viene a más de `tolerancia` ms del futuro (un reloj adelantado congelaría la pantalla hasta que la hora lo alcanzara).
// Lo que se guarda como "último" nunca pasa de la hora local, así un mensaje adelantado no bloquea a los siguientes.
// acepta.desfases cuenta los rechazos por reloj y acepta.ultimoRechazo dice el motivo del último ("reloj", "viejo" o null).
export function crearOrden(ahora = () => Date.now(), tolerancia = 5000) {
  const ultimo = {}, exacto = {};
  const acepta = m => {
    const ya = ahora();
    acepta.ultimoRechazo = null;
    if (m.t > ya + tolerancia) { acepta.desfases++; acepta.ultimoRechazo = "reloj"; return false; }
    if (!(m.t > (ultimo[m.de] ?? -Infinity)) || m.t === exacto[m.de]) { acepta.ultimoRechazo = "viejo"; return false; }
    // Se guarda la hora del mensaje (no la local): si no, uno anterior que llegue después (del historial) podría
    // reemplazar al nuevo. Un mensaje forjado del futuro bloquea como mucho `tolerancia` ms.
    ultimo[m.de] = m.t;
    exacto[m.de] = m.t;
    return true;
  };
  acepta.desfases = 0;
  acepta.ultimoRechazo = null;
  return acepta;
}

// Lo que la pantalla debe repetir al arrancar o reconectar: el último pasaje (o espera) de la tablet y los cambios de parte
// posteriores. Si ese pasaje tiene más de `maxEdad` ms (el domingo no debe salir el del sábado), no se repite nada.
// Los mensajes con hora del futuro (más de 5 s) no cuentan: uno forjado no debe tapar al último verdadero.
export function paraArrancar(ms, ahora, maxEdad = 6 * 3600 * 1000) {
  ms = ms.filter(m => m.t <= ahora + 5000 && m.tipo !== "consulta"); // una consulta no cambia lo que se muestra
  const i = ms.findLastIndex(m => m.tipo !== "parte");
  if (i < 0) return [];
  if (ms[i].tipo === "pasaje" && ahora - ms[i].t > maxEdad) return [];
  return ms.slice(i);
}

// Recarga por versión nueva sin interrumpir: si hay un pasaje en pantalla se espera a que pase a la lámina de espera.
export function crearRecargaDiferida(recargar) {
  let pendiente = false;
  return {
    nuevaVersion(hayPasaje) { if (hayPasaje) pendiente = true; else recargar(); },
    alEspera() { if (pendiente) { pendiente = false; recargar(); } },
  };
}
