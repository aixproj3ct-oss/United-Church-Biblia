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
export const msgEstado = ({ codigo, partes, parte }, t = Date.now()) => ({ v: 1, de: "pantalla", tipo: "estado", codigo, partes, parte, t });

const entero = n => Number.isInteger(n) && n >= 0 && n < 500;
const siglaValida = s => typeof s === "string" && /^[^<>]{1,20}$/.test(s);

export function validar(m) {
  if (!m || typeof m !== "object" || m.v !== 1 || !Number.isFinite(m.t)) return null;
  const { t } = m;
  if (m.de === "tablet") {
    if (m.tipo === "espera") return { v: 1, de: "tablet", tipo: "espera", t };
    if (m.tipo === "parte" && entero(m.parte)) return { v: 1, de: "tablet", tipo: "parte", parte: m.parte, t };
    if (m.tipo === "pasaje" && refDeCodigo(m.codigo) && siglaValida(m.sigla) && typeof m.completo === "boolean" && entero(m.parte))
      return { v: 1, de: "tablet", tipo: "pasaje", codigo: m.codigo, sigla: m.sigla, completo: m.completo, parte: m.parte, t };
  }
  if (m.de === "pantalla" && m.tipo === "estado" && refDeCodigo(m.codigo) && Number.isInteger(m.partes) && m.partes >= 1 && m.partes < 500
    && entero(m.parte) && m.parte < m.partes)
    return { v: 1, de: "pantalla", tipo: "estado", codigo: m.codigo, partes: m.partes, parte: m.parte, t };
  return null;
}

export function leer(texto) {
  try { return validar(JSON.parse(texto)); } catch { return null; }
}

// Acepta un mensaje solo si es más nuevo que el último aceptado del mismo origen (evita retrocesos al reconectar)
// y no viene más de 60 s del futuro (un reloj adelantado congelaría la pantalla hasta que la hora lo alcanzara).
export function crearOrden(ahora = () => Date.now()) {
  const ultimo = {};
  return m => {
    if (m.t > ahora() + 60000) return false;
    if (!(m.t > (ultimo[m.de] ?? -Infinity))) return false;
    ultimo[m.de] = m.t;
    return true;
  };
}
