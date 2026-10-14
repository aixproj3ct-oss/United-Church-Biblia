// Arma lo que muestra el lector: une los versículos agrupados (en la TLA, un versículo vacío
// pertenece al anterior: "1-3") y rellena con otra versión lo que falta en la que se está leyendo.
import { LIBROS } from "./libros.js";

const CODIGOS = LIBROS.map(l => l[0]);
export const numeroLibro = codigo => CODIGOS.indexOf(codigo) + 1;
export const codigoLibro = n => CODIGOS[n - 1] ?? null;

export function refDeCodigo(codigo) {
  const m = String(codigo ?? "").match(/^([0-9A-Z]{3})\.(\d+)(?:\.(\d+)(?:-(\d+))?)?$/);
  if (!m || !numeroLibro(m[1])) return null;
  return { codigo: m[1], cap: +m[2], v1: m[3] ? +m[3] : null, v2: m[4] ? +m[4] : null };
}

export function etiquetaRef({ codigo, cap, v1, v2 }) {
  const nombre = codigo === "PSA" ? "Salmo" : LIBROS[numeroLibro(codigo) - 1][1];
  return `${nombre} ${cap}` + (v1 ? `:${v1}` + (v2 ? `-${v2}` : "") : "");
}

export const codigoRef = ({ codigo, cap, v1, v2 }) => `${codigo}.${cap}` + (v1 ? `.${v1}` + (v2 ? `-${v2}` : "") : "");

export function capituloVecino(codigo, cap, paso) {
  let i = numeroLibro(codigo) - 1, c = cap + paso;
  if (i < 0) return null;
  if (c < 1) { if (i === 0) return null; i--; c = LIBROS[i][2]; }
  else if (c > LIBROS[i][2]) { if (i === LIBROS.length - 1) return null; i++; c = 1; }
  return { codigo: LIBROS[i][0], cap: c };
}

const numeros = cap => Object.keys(cap || {}).map(Number).filter(n => n >= 1).sort((a, b) => a - b);
const tieneTexto = (cap, n) => typeof cap?.[n] === "string" && cap[n] !== "";

function bloquesDe(cap) {
  const bloques = [];
  for (const n of numeros(cap)) {
    if (tieneTexto(cap, n)) bloques.push({ desde: n, hasta: n, texto: cap[n] });
    else if (bloques.length && bloques.at(-1).hasta === n - 1) bloques.at(-1).hasta = n;
  }
  return bloques;
}

export function armarPasaje({ principal, alternativas = [], desde = null, hasta = null }) {
  const todos = [principal, ...alternativas];
  const maximo = Math.max(0, ...todos.flatMap(v => numeros(v.cap)));
  const ini = desde ?? 1, fin = desde === null ? maximo : (hasta ?? desde);
  const cubiertos = new Set();
  const bloques = [];
  for (const b of bloquesDe(principal.cap)) {
    if (b.desde > fin || b.hasta < ini) continue;
    bloques.push({ ...b, sigla: null });
    for (let n = b.desde; n <= b.hasta; n++) cubiertos.add(n);
  }
  const rellenoDe = new Set(), sinTexto = [];
  for (let n = ini; n <= fin; n++) {
    if (cubiertos.has(n)) continue;
    const alt = alternativas.find(a => tieneTexto(a.cap, n));
    if (alt) { bloques.push({ desde: n, hasta: n, texto: alt.cap[n], sigla: alt.sigla }); rellenoDe.add(alt.sigla); }
    else sinTexto.push(n);
  }
  bloques.sort((a, b) => a.desde - b.desde);
  return {
    bloques: bloques.map(b => ({ desde: b.desde, hasta: b.hasta, etiqueta: b.desde === b.hasta ? `${b.desde}` : `${b.desde}-${b.hasta}`, texto: b.texto, sigla: b.sigla })),
    rellenoDe: [...rellenoDe],
    sinTexto,
    vacio: desde === null && maximo === 0,
  };
}
