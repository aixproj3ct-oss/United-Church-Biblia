// Arma lo que muestra el lector: une los versículos agrupados (en la TLA, un versículo vacío
// pertenece al anterior: "1-3") y rellena con otra versión lo que falta en la que se está leyendo.
import { LIBROS } from "./libros.js";

const CODIGOS = LIBROS.map(l => l[0]);
export const numeroLibro = codigo => CODIGOS.indexOf(codigo) + 1;

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

// Versículo siguiente (paso 1) o anterior (-1) del pasaje, saltando los vacíos de un grupo y cruzando de capítulo.
// `leer(codigo, cap)` devuelve el capítulo de la versión que se lee. Sin vecino devuelve null.
export async function versiculoVecino({ codigo, cap, v1, v2 }, paso, leer) {
  const conTexto = c => numeros(c).filter(n => tieneTexto(c, n));
  const aqui = conTexto(await leer(codigo, cap));
  const n = paso > 0 ? aqui.find(x => x > (v2 ?? v1)) : aqui.filter(x => x < v1).pop();
  if (n) return { codigo, cap, v1: n, v2: null };
  const vecino = capituloVecino(codigo, cap, paso);
  if (!vecino) return null;
  const alla = conTexto(await leer(vecino.codigo, vecino.cap));
  const m = paso > 0 ? alla[0] : alla.at(-1);
  return m ? { ...vecino, v1: m, v2: null } : null;
}

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

// Orden de relleno: primero la RV 1960 si está cargada, luego las demás en orden de carga.
export const ordenAlternativas = (ms, actual) => ms.filter(m => m.sigla !== actual)
  .sort((a, b) => (/1960/.test(b.sigla) ? 1 : 0) - (/1960/.test(a.sigla) ? 1 : 0) || a.orden - b.orden);

// Abreviatura corta para fichas: "1 Co", "Sal", "Jn".
export function abreviatura(codigo) {
  const a = LIBROS[numeroLibro(codigo) - 1]?.[3]?.[0] ?? codigo.toLowerCase();
  const m = a.match(/^([1-3]?)(.*)$/);
  return (m[1] ? m[1] + " " : "") + m[2].charAt(0).toUpperCase() + m[2].slice(1);
}

// Carga lo que muestra un pasaje (lector o pantalla): la versión pedida si está cargada (si no, la principal)
// y las demás como relleno. Sin versiones devuelve actual:null.
export async function cargarPasaje(biblias, ref, siglaPedida, completo) {
  const versiones = await biblias.versiones();
  if (!versiones.length) return { actual: null, versiones: [], pasaje: null };
  const actual = versiones.some(v => v.sigla === siglaPedida) ? siglaPedida : await biblias.principal();
  const alts = ordenAlternativas(versiones, actual);
  const caps = await Promise.all([actual, ...alts.map(a => a.sigla)].map(s => biblias.capitulo(s, ref.codigo, ref.cap)));
  const pasaje = armarPasaje({ principal: { sigla: actual, cap: caps[0] }, alternativas: alts.map((a, i) => ({ sigla: a.sigla, cap: caps[i + 1] })),
    desde: completo ? null : ref.v1, hasta: completo ? null : (ref.v2 ?? ref.v1) });
  return { actual, versiones, pasaje };
}

