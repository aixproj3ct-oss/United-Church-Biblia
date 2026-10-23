// Modelo del bosquejo del sermón: puro, sin pantalla ni almacenamiento.
// Aquí se sanea lo que escribe el pastor, se arman las láminas y se separa lo que viaja a la PC de las notas privadas.
import { validoCita } from "../citas.js";
import { fechaReal } from "../fechas.js";

export const MAX_PUNTOS = 6;
export const MAX_VERSOS = 6;
// Largo máximo de cada texto.
export const MAX = { titulo: 120, frase: 160, recuerda: 200, nota: 4000 };

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const texto = (t, max) => (typeof t === "string" ? t.trim().slice(0, max) : "");

// Una cita {codigo, etiqueta}: null si no hay, undefined si está mal formada. La etiqueta viene de parseCita y no se recalcula.
const citaDe = c => (c === null || c === undefined ? null : validoCita(c) ? { codigo: c.codigo, etiqueta: c.etiqueta } : undefined);

// Devuelve el bosquejo recortado y limpio, o null si no es válido (sin id, fecha que no existe, título vacío,
// 0 o más de 6 puntos, un punto sin frase, o una cita mal formada). El título y la frase de cada punto son obligatorios
// porque la pantalla de la iglesia no acepta láminas sin ellos.
export function sanearBosquejo(b) {
  if (!b || typeof b !== "object") return null;
  if (typeof b.id !== "string" || !b.id.trim() || !fechaReal(b.fecha)) return null;
  if (!Array.isArray(b.puntos) || b.puntos.length < 1 || b.puntos.length > MAX_PUNTOS) return null;
  const titulo = texto(b.titulo, MAX.titulo);
  if (!titulo) return null;
  const cita = citaDe(b.cita);
  if (cita === undefined) return null;
  const puntos = [];
  for (const p of b.puntos) {
    if (!p || typeof p !== "object") return null;
    const lista = Array.isArray(p.versos) ? p.versos : [];
    const versos = lista.slice(0, MAX_VERSOS).map(citaDe);
    if (versos.some(x => !x)) return null;
    const frase = texto(p.frase, MAX.frase);
    if (!frase) return null;
    puntos.push({ frase, versos,
      explicacion: texto(p.explicacion, MAX.nota), ilustracion: texto(p.ilustracion, MAX.nota) });
  }
  return {
    id: b.id.trim(), domingoId: typeof b.domingoId === "string" && b.domingoId ? b.domingoId : null, fecha: b.fecha,
    titulo, cita, intro: texto(b.intro, MAX.nota), puntos,
    aplicacion: texto(b.aplicacion, MAX.nota), recuerda: texto(b.recuerda, MAX.recuerda),
    conclusion: texto(b.conclusion, MAX.nota), actualizado: typeof b.actualizado === "string" ? b.actualizado : "",
  };
}

// Las láminas en orden: título; cada punto (una por versículo, nunca más de uno por lámina); y ¡Recuerda! si hay frase.
export function laminasDe(b) {
  const l = [{ tipo: "titulo" }];
  b.puntos.forEach((p, i) => {
    if (!p.versos.length) l.push({ tipo: "punto", p: i, v: null });
    else p.versos.forEach((_, v) => l.push({ tipo: "punto", p: i, v }));
  });
  if (b.recuerda) l.push({ tipo: "recuerda" });
  return l;
}

// Lo único que viaja a la PC: títulos, frases y referencias. Ninguna nota privada ni texto bíblico.
export const publicoDe = b => ({
  id: b.id, fecha: b.fecha, titulo: b.titulo, cita: b.cita ? b.cita.codigo : null,
  puntos: b.puntos.map(p => ({ frase: p.frase, versos: p.versos.map(v => v.codigo) })), recuerda: b.recuerda,
});

// La cita principal (si hay) y luego los versículos de los puntos, en orden y sin repetir el mismo código.
export function citasDe(b) {
  const vistos = new Set(), r = [];
  for (const c of [b.cita, ...b.puntos.flatMap(p => p.versos)]) {
    if (c && !vistos.has(c.codigo)) { vistos.add(c.codigo); r.push({ codigo: c.codigo, etiqueta: c.etiqueta }); }
  }
  return r;
}

// "2026-10-25" -> "Octubre 25, 2026" (la vista lo pone en mayúsculas con CSS).
export function fechaLamina(f) {
  if (!fechaReal(f)) return "";
  const [a, m, d] = f.split("-").map(Number);
  return `${MESES[m - 1]} ${d}, ${a}`;
}

// Notas privadas de la lámina para la vista del pastor. Texto tal cual: escapar es cosa de la vista. Se omiten las vacías.
export function notasDe(b, lamina) {
  const parte = (eti, t) => (t ? [{ eti, texto: t }] : []);
  if (lamina?.tipo === "titulo") return { titulo: "Introducción", partes: parte("Introducción", b.intro) };
  if (lamina?.tipo === "recuerda") {
    return { titulo: "¡Recuerda!", partes: [...parte("Aplicación", b.aplicacion), ...parte("Conclusión / llamado", b.conclusion)] };
  }
  const p = lamina?.tipo === "punto" ? b.puntos[lamina.p] : null;
  if (!p) return { titulo: "", partes: [] };
  return { titulo: `Punto ${lamina.p + 1}`, partes: [...parte("Explicación", p.explicacion), ...parte("Ilustración", p.ilustracion)] };
}

// El domingo del plan al que corresponde el bosquejo. Se usa el de `domingoId` solo si sigue con la misma fecha;
// si no, el más reciente (el último guardado) de la fecha del bosquejo. `conflicto`: ese domingo ya tiene citas distintas.
export function domingoParaBosquejo(domingos, b) {
  const porId = b.domingoId ? domingos.find(d => d.id === b.domingoId) : null;
  const domingo = porId && porId.fecha === b.fecha ? porId : domingos.filter(d => d.fecha === b.fecha).at(-1) ?? null;
  if (!domingo) return { domingo: null, conflicto: false };
  const mias = citasDe(b).map(c => c.codigo), suyas = domingo.citas.map(c => c.codigo);
  const conflicto = suyas.length > 0 && (suyas.length !== mias.length || suyas.some((c, i) => c !== mias[i]));
  return { domingo, conflicto };
}
