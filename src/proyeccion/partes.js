// Reparte un pasaje en láminas de proyección: busca el tamaño de letra más grande con el que cabe entero;
// si ni al más chico cabe, lo divide por versículos y, si un versículo solo no cabe, por oraciones.
import { etiquetaRef } from "../pasaje.js";

export const TAMANOS = [64, 58, 52, 48];

export const oraciones = texto =>
  (String(texto).match(/[^.!?;:]+[.!?;:]+[»”’")]*|[^.!?;:]+$/g) || []).map(s => s.trim()).filter(Boolean);

function trocear(b, cabe, tam) {
  const trozos = [];
  let actual = null;
  for (const o of oraciones(b.texto)) {
    const prueba = actual ? { ...actual, texto: actual.texto + " " + o } : { ...b, texto: o, ...(trozos.length ? { cont: true } : {}) };
    if (!actual || cabe([prueba], tam)) { actual = prueba; continue; }
    trozos.push(actual);
    actual = { ...b, texto: o, cont: true };
  }
  if (actual) trozos.push(actual);
  return trozos;
}

export function repartir(bloques, cabe, tamanos = TAMANOS) {
  if (!bloques.length) return { tam: tamanos[0], partes: [[]] };
  for (const tam of tamanos) if (cabe(bloques, tam)) return { tam, partes: [bloques] };
  const tam = tamanos.at(-1);
  const piezas = bloques.flatMap(b => (cabe([b], tam) ? [b] : trocear(b, cabe, tam)));
  const partes = [];
  let parte = [];
  for (const p of piezas) {
    if (parte.length && !cabe([...parte, p], tam)) { partes.push(parte); parte = []; }
    parte.push(p);
  }
  partes.push(parte);
  return { tam, partes };
}

export function refDeParte(ref, parte) {
  if (!parte.length) return etiquetaRef(ref);
  const desde = Math.min(...parte.map(b => b.desde)), hasta = Math.max(...parte.map(b => b.hasta));
  return etiquetaRef({ ...ref, v1: desde, v2: hasta !== desde ? hasta : null });
}
