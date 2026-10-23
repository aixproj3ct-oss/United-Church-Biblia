// Convierte una Biblia en XML (formato Zefania o formato "bible") a una estructura común.
// No usa DOMParser para correr igual en el navegador y en Node. El texto se queda en la tablet.
import { LIBROS } from "./libros.js";
export class ErrorBiblia extends Error {}
// El usuario canceló (sin sigla, o no quiso reemplazar): no es un fallo, pero se avisa con el mismo mensaje.
export class CargaCancelada extends ErrorBiblia { cancelada = true; }

const MIN_VERSOS_CON_TEXTO = 1000;
// Una Biblia en XML pesa unos 5-10 MB; más de esto casi seguro no es una Biblia.
export const MAX_BYTES = 40 * 1024 * 1024;
export function verificarTamano(bytes) {
  if (bytes > MAX_BYTES) {
    const mb = n => Math.round(n / 1048576);
    throw new ErrorBiblia(`Este archivo es demasiado grande (${mb(bytes)} MB; el máximo es ${mb(MAX_BYTES)} MB). ¿Seguro que es una Biblia en XML?`);
  }
}
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// Una entidad numérica fuera de rango (&#99999999;) o inválida deja el carácter de reemplazo en vez de fallar.
const caracter = n => {
  try { return n >= 1 && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�"; } catch { return "�"; }
};
const entidades = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === "#" ? caracter(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
const atributo = (attrs, nombre) => {
  const m = attrs.match(new RegExp(`\\b${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? entidades(m[1] ?? m[2]) : null;
};
// Las etiquetas de salto o bloque (<BR/>, <DIV>, <P>...) separan palabras; las de estilo se quitan sin dejar hueco.
const limpiar = s => entidades(String(s).replace(/<(NOTE|note)\b[\s\S]*?<\/\1>/g, "")
  .replace(/<\/?(?:br|div|p|li|tr|td|th|h[1-6])\b[^>]*>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const etiqueta = (t, nombre) => limpiar(t.match(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`))?.[1] ?? "");

export function decodificar(bytes) {
  verificarTamano(bytes.byteLength);
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); }
  catch { return new TextDecoder("windows-1252").decode(u8); }
}

function datosZefania(t, attrs) {
  const sigla = etiqueta(t, "identifier");
  return { sigla, nombre: atributo(attrs, "biblename") || etiqueta(t, "title") || sigla, derechos: etiqueta(t, "rights") };
}

function datosBible(attrs) {
  const tr = (atributo(attrs, "translation") ?? "").trim();
  const paren = tr.match(/\(([^)]*)\)\s*$/)?.[1]?.trim() ?? "";
  const sigla = tr.replace(/\s*\([^)]*\)\s*$/, "").replace(/^spanish\s+/i, "").trim();
  return { sigla, nombre: paren && !/^m[aá]s informaci/i.test(paren) ? paren : sigla, derechos: atributo(attrs, "status") ?? "" };
}

// Avisos (no errores) sobre una Biblia que se cargó pero viene incompleta o rara.
function advertencias(libros) {
  const av = [];
  const n = Object.keys(libros).length;
  if (n < 66) av.push(`Esta Biblia trae ${n} de 66 libros`);
  const raros = [];
  for (const [num, caps] of Object.entries(libros)) {
    const [, nombre, esperado] = LIBROS[num - 1];
    const numeros = Object.keys(caps).map(Number), mayor = Math.max(...numeros);
    if (mayor > esperado) raros.push(`${nombre} trae capítulos que no existen (hasta el ${mayor}; debería llegar al ${esperado})`);
    else if (numeros.length < esperado) raros.push(`${nombre} trae ${numeros.length} de ${esperado} capítulos`);
  }
  av.push(...raros.slice(0, 3));
  if (raros.length > 3) av.push(`y ${raros.length - 3} libros más con capítulos distintos a lo esperado`);
  return av;
}

export function importarBiblia(xml) {
  if (typeof xml === "string") verificarTamano(xml.length);
  const t =String(xml ?? "").replace(/^﻿/, "");
  const zefania = /<XMLBIBLE\b/.test(t);
  const raiz = t.match(zefania ? /<XMLBIBLE\b([^>]*)>/ : /<bible\b([^>]*)>/);
  if (!raiz) throw new ErrorBiblia("Este archivo no parece una Biblia en XML (Zefania o formato «bible»).");
  const datos = zefania ? datosZefania(t, raiz[1]) : datosBible(raiz[1]);
  const re = zefania
    ? /<BIBLEBOOK\b([^>]*)>|<CHAPTER\b([^>]*)>|<VERS\b([^>]*?)(?:\/>|>([\s\S]*?)<\/VERS>)/g
    : /<book\b([^>]*)>|<chapter\b([^>]*)>|<verse\b([^>]*?)(?:\/>|>([\s\S]*?)<\/verse>)/g;
  const [nB, nC, nV] = zefania ? ["bnumber", "cnumber", "vnumber"] : ["number", "number", "number"];
  const libros = {};
  let libro = null, cap = null, versiculos = 0, agrupados = 0;
  for (const m of t.matchAll(re)) {
    if (m[1] !== undefined) {
      const n = parseInt(atributo(m[1], nB), 10);
      libro = n >= 1 && n <= 66 ? (libros[n] ??= {}) : null;
      cap = null;
    } else if (m[2] !== undefined) {
      const n = parseInt(atributo(m[2], nC), 10);
      cap = libro && n >= 1 ? (libro[n] ??= {}) : null;
    } else if (cap) {
      const n = parseInt(atributo(m[3], nV), 10);
      if (!(n >= 1)) continue;
      const texto = limpiar(m[4] ?? "");
      cap[n] = texto;
      versiculos++;
      if (!texto) agrupados++;
    }
  }
  if (versiculos - agrupados < MIN_VERSOS_CON_TEXTO) throw new ErrorBiblia("Este archivo no parece una Biblia completa.");
  // Se descartan libros y capítulos que quedaron vacíos para que el resumen cuente solo lo que hay.
  for (const [n, caps] of Object.entries(libros)) {
    for (const [c, vs] of Object.entries(caps)) if (!Object.keys(vs).length) delete caps[c];
    if (!Object.keys(caps).length) delete libros[n];
  }
  return { sigla: datos.sigla.slice(0, 20), nombre: datos.nombre, derechos: datos.derechos, libros,
    resumen: { libros: Object.keys(libros).length, versiculos, agrupados }, advertencias: advertencias(libros) };
}

// Carga una Biblia desde un archivo elegido: lee, decodifica, importa, pide la sigla si falta, confirma si ya
// existe y guarda. Devuelve { sigla, resumen, advertencias, mensaje } (y avisa ese mensaje al terminar) o lanza
// ErrorBiblia con un mensaje en español listo para mostrar (CargaCancelada si el usuario canceló).
//   pedirSigla(): texto (o null) | confirmar(sigla): true/false | avisar(texto, ms) | invalidar(): tras intentar guardar
//   dispositivo: cómo se llama el equipo en los mensajes ("la tablet", "esta PC").
export async function cargarBiblia(archivo, biblias, { pedirSigla, confirmar, avisar, invalidar, dispositivo = "la tablet" } = {}) {
  verificarTamano(archivo.size);
  avisar?.("Leyendo la Biblia…", 60000);
  let b;
  try { b = importarBiblia(decodificar(await archivo.arrayBuffer())); }
  catch (e) { throw e instanceof ErrorBiblia ? e : new ErrorBiblia("No se pudo leer el archivo. Vuelve a elegirlo.", { cause: e }); }
  if (!b.sigla) b.sigla = String((await pedirSigla?.()) ?? "").trim().slice(0, 20);
  if (!b.sigla) throw new CargaCancelada("Carga cancelada: falta la sigla");
  const { sigla } = b;
  try {
    const ya = (await biblias.versiones()).some(m => m.sigla === sigla);
    if (ya && !(await confirmar?.(sigla))) throw new CargaCancelada("Carga cancelada");
    avisar?.(`Guardando en ${dispositivo}…`, 60000);
    try { await biblias.guardar(b); } finally { invalidar?.(); }
  } catch (e) {
    if (e instanceof CargaCancelada) throw e;
    throw e?.guardada
      ? Object.assign(new ErrorBiblia(`${sigla} se guardó, pero no se pudo borrar la versión anterior: sigue ocupando espacio en ${dispositivo}.`, { cause: e }), { guardada: true })
      : new ErrorBiblia(`No se pudo guardar la Biblia (¿falta espacio en ${dispositivo}?). La versión anterior sigue igual.`, { cause: e });
  }
  const r = b.resumen, av = b.advertencias ?? [];
  const resumen = `${sigla}: ${r.libros} libros, ${r.versiculos.toLocaleString("es")} versículos${r.agrupados ? ` (${r.agrupados.toLocaleString("es")} agrupados)` : ""}`;
  const mensaje = av.length ? `${resumen}. Atención: ${av.join(". ")}` : resumen;
  avisar?.(mensaje, av.length ? 15000 : 8000);
  return { sigla, resumen, advertencias: av, mensaje };
}
