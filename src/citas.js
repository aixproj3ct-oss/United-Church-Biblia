// Lector de citas bíblicas en español: convierte lo que escribe el pastor ("jn 3 16", "1 co 13 del 4 al 6")
// en una referencia validada y en el enlace de YouVersion/bible.com en TLA (versión 176).
// Nunca abre un pasaje distinto del que muestra en `etiqueta`: ante cualquier duda devuelve un error.
import { LIBROS } from "./libros.js";

export const VERSION_TLA = 176;
let rangoEnUrl = true; // Task 7: false si YouVersion no acepta "JHN.3.16-18" en el enlace
export function setRangoEnUrl(v) { rangoEnUrl = v; }
export function getRangoEnUrl() { return rangoEnUrl; }
const VERSICULO_MAX = 176;      // el versículo más largo de la Biblia (Salmo 119:176)

const LISTA = LIBROS.map(([codigo, nombre, capitulos, alias]) => ({ codigo, nombre, capitulos, alias }));
const ALIAS = new Map();
for (const l of LISTA) for (const a of l.alias) ALIAS.set(a, l);

const ORD_PALABRA = /^(primera|primero|primer|segunda|segundo|tercera|tercero|1ra|1ro|1er|1a|2da|2do|2a|3ra|3ro|3er|3a|iii|ii|i)\s+(?:de\s+)?(?=[a-z])/;
const ORD_DIGITO = /^([123])\s*(?:de\s+)?(?=[a-z])/;
const ORD_VALOR = { primera: 1, primero: 1, primer: 1, "1ra": 1, "1ro": 1, "1er": 1, "1a": 1, i: 1,
  segunda: 2, segundo: 2, "2da": 2, "2do": 2, "2a": 2, ii: 2, tercera: 3, tercero: 3, "3ra": 3, "3ro": 3, "3er": 3, "3a": 3, iii: 3 };

export function normalizar(t) {
  let s = String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[º°ª]/g, "").replace(/\.º/g, "");
  s = s.replace(/\b(cap|capitulo|capítulo)\b/g, "").replace(/\s+/g, " ").trim();
  return s;
}

const clave = l => normalizar(l.nombre).replace(/ /g, "");
const sinNumero = l => clave(l).replace(/^[123]/, "");

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

function sugerir(k) {
  const puntajes = LISTA.map(l => ({ l, d: Math.min(...[...l.alias, clave(l), sinNumero(l)].map(a => distancia(k, a))) }));
  return puntajes.filter(p => p.d <= 2).sort((a, b) => a.d - b.d).slice(0, 3).map(p => p.l.nombre);
}

const error = (msg, sugerencias = [], numeros = "") => ({ ok: false, error: msg, sugerencias, numeros });

function buscarLibro(num, letras) {
  const k = (num ? String(num) : "") + letras.replace(/ /g, "");
  if (ALIAS.has(k)) return { libro: ALIAS.get(k) };
  const cand = LISTA.filter(l => k.length >= 2 && (clave(l).startsWith(k) || (!num && sinNumero(l).startsWith(k))));
  if (cand.length === 1) return { libro: cand[0] };
  if (cand.length > 1) return { ambiguos: cand.map(l => l.nombre) };
  return { sugerencias: sugerir(k) };
}

function leerNumeros(txt) {
  const t = txt.replace(/[–—]/g, "-")
    .replace(/(\d)v(\d)/g, "$1 $2")
    .replace(/\b(versiculos?|vers|vv|v|capitulo|cap)\b/g, " ")
    .replace(/\bdel\b/g, " ")
    .replace(/\b(al|a|hasta)\b/g, " - ")
    .replace(/[:.,;]/g, " ")
    .replace(/-/g, " - ");
  const tok = t.split(" ").filter(Boolean);
  if (!tok.every(x => x === "-" || /^\d+$/.test(x))) return null;
  const n = tok.map(x => (x === "-" ? "-" : Number(x)));
  const f = n.map(x => (x === "-" ? "-" : "n")).join(" ");
  if (f === "n") return { cap: n[0], v1: null, v2: null };
  if (f === "n n") return { cap: n[0], v1: n[1], v2: null };
  if (f === "n n - n") return { cap: n[0], v1: n[1], v2: n[3] };
  if (f === "n - n") return { cap: null, v1: n[0], v2: n[2] };
  return null;
}

export function urlTLA({ codigo, cap, v1, v2 }) {
  let r = `${codigo}.${cap}`;
  if (v1) r += `.${v1}` + (v2 && getRangoEnUrl() ? `-${v2}` : "");
  return `https://www.bible.com/bible/${VERSION_TLA}/${r}.TLA`;
}

export function parseCita(texto) {
  let t = normalizar(texto).replace(/([a-z])\./g, "$1 ").replace(/\s+/g, " ").trim();
  if (!t) return error("Escribe una cita, por ejemplo: jn 3 16");
  let num = null;
  let m = t.match(ORD_PALABRA);
  if (m) { num = ORD_VALOR[m[1]]; t = t.slice(m[0].length); }
  else if ((m = t.match(ORD_DIGITO))) { num = Number(m[1]); t = t.slice(m[0].length); }
  t = t.replace(/^(san|santo)\s+/, "");
  const p = t.match(/^([a-z ]+?)\s*(\d[\s\S]*)?$/);
  if (!p) return error("No entendí la cita. Ejemplo: jn 3 16");
  const numeros = (p[2] || "").trim();
  const b = buscarLibro(num, p[1].trim());
  if (b.ambiguos) return error(`¿Cuál? ${b.ambiguos.join(" o ")}`, b.ambiguos, numeros);
  if (!b.libro) return error(`No reconocí "${(num ? num + " " : "") + p[1].trim()}"`, b.sugerencias, numeros);
  const libro = b.libro;
  if (!numeros) return error(`Falta el capítulo: ${libro.nombre} tiene ${libro.capitulos} capítulo${libro.capitulos > 1 ? "s" : ""}`, [], "");
  let n = leerNumeros(numeros);
  if (!n) return error("No entendí los números. Ejemplos: jn 3 16 · 1 co 13 del 4 al 7", [], numeros);
  if (libro.capitulos === 1 && n.v1 === null && n.cap !== null && n.cap > 1) n = { cap: 1, v1: n.cap, v2: null };
  if (n.cap === null) { if (libro.capitulos !== 1) return error("Falta el capítulo antes de los versículos", [], numeros); n.cap = 1; }
  if (n.cap < 1 || n.cap > libro.capitulos)
    return error(`${libro.nombre} tiene ${libro.capitulos} capítulo${libro.capitulos > 1 ? "s" : ""}`, [], numeros);
  let corregido = false;
  if (n.v1 !== null) {
    if (n.v1 < 1 || n.v1 > VERSICULO_MAX || (n.v2 !== null && (n.v2 < 1 || n.v2 > VERSICULO_MAX)))
      return error("Ese versículo no existe", [], numeros);
    if (n.v2 !== null && n.v2 < n.v1) { [n.v1, n.v2] = [n.v2, n.v1]; corregido = true; }
    if (n.v2 === n.v1) n.v2 = null;
  }
  const ref = { codigo: libro.codigo, nombre: libro.nombre, cap: n.cap, v1: n.v1, v2: n.v2 };
  const nombreVisible = libro.codigo === "PSA" ? "Salmo" : libro.nombre;
  const rangoRecortado = n.v2 !== null && !getRangoEnUrl();
  const etiqueta = `${nombreVisible} ${n.cap}` + (n.v1 ? `:${n.v1}` + (!rangoRecortado && n.v2 ? `-${n.v2}` : "") : "");
  const codigoRef = `${libro.codigo}.${n.cap}` + (n.v1 ? `.${n.v1}` + (!rangoRecortado && n.v2 ? `-${n.v2}` : "") : "");
  return { ok: true, ref, etiqueta, codigoRef, url: urlTLA(ref), corregido, ...(rangoRecortado && { rangoRecortado }) };
}
