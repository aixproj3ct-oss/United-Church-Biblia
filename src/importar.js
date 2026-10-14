// Convierte una Biblia en XML (formato Zefania o formato "bible") a una estructura común.
// No usa DOMParser para correr igual en el navegador y en Node. El texto se queda en la tablet.
export class ErrorBiblia extends Error {}

const MIN_VERSOS_CON_TEXTO = 1000;
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const entidades = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
const atributo = (attrs, nombre) => {
  const m = attrs.match(new RegExp(`\\b${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? entidades(m[1] ?? m[2]) : null;
};
const limpiar = s => entidades(String(s).replace(/<(NOTE|note)\b[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const etiqueta = (t, nombre) => limpiar(t.match(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`))?.[1] ?? "");

export function decodificar(bytes) {
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

export function importarBiblia(xml) {
  const t = String(xml ?? "").replace(/^﻿/, "");
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
  return { sigla: datos.sigla.slice(0, 20), nombre: datos.nombre, derechos: datos.derechos, libros,
    resumen: { libros: Object.keys(libros).length, versiculos, agrupados } };
}
