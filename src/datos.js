// Datos del pastor guardados solo en la tablet (localStorage). Nada sale del dispositivo.
import { normalizarCodigo } from "./proyeccion/mensajes.js";
const CLAVE = "uc-biblia-v1";
const MAX_HISTORIAL = 30;

const vacio = () => ({ version: 1, domingos: [], favoritos: [], historial: [],
  config: { letra: "grande", ultimoRespaldo: null, tema: "claro", pantalla: null, orientacion: "horizontal", pastor: "" } });

export const LETRAS = ["normal", "grande", "muy-grande"];
const TEMAS = ["claro", "oscuro"];
export const ORIENTACIONES = ["horizontal", "vertical"];
export const sanearConfig = c => {
  const o = c && typeof c === "object" ? c : {};
  return {
    letra: LETRAS.includes(o.letra) ? o.letra : "grande",
    ultimoRespaldo: typeof o.ultimoRespaldo === "string" ? o.ultimoRespaldo : null,
    tema: TEMAS.includes(o.tema) ? o.tema : "claro",
    pantalla: normalizarCodigo(o.pantalla),
    orientacion: ORIENTACIONES.includes(o.orientacion) ? o.orientacion : "horizontal",
    // Cómo saludar al pastor ("Buenos días, <esto>"), tal como lo escribe; texto corto, sin saltos de línea.
    pastor: typeof o.pastor === "string" ? o.pastor.replace(/\s+/g, " ").trim().slice(0, 40) : "",
  };
};

const memoriaVolatil = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
const almacenamientoPorDefecto = () => {
  try { return globalThis.localStorage ?? memoriaVolatil(); } catch { return memoriaVolatil(); }
};

const valido = e => e && e.version === 1 && Array.isArray(e.domingos) && Array.isArray(e.favoritos)
  && Array.isArray(e.historial) && e.config && typeof e.config === "object";

// Fecha AAAA-MM-DD que existe de verdad (no 2026-13-45 ni 2026-02-30).
const fechaReal = f => {
  if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const [a, m, d] = f.split("-").map(Number);
  const dias = [31, a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return a >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= dias[m - 1];
};

// Las citas guardadas antes del lector propio traen además `url` (bible.com); se aceptan y se ignora.
const validoCita = c => c && typeof c.codigo === "string" && /^[0-9A-Z]{3}\.\d+/.test(c.codigo) && typeof c.etiqueta === "string";
const validoDomingo = d => d && typeof d.id === "string" && fechaReal(d.fecha) && typeof d.titulo === "string" && Array.isArray(d.citas) && d.citas.every(validoCita);
const validoFavorito = f => f && typeof f.id === "string" && typeof f.serie === "string" && validoCita(f.cita);
const validoHistorial = h => h && validoCita(h.cita) && typeof h.cuando === "string";

// Copias de seguridad automáticas: solo se conservan las más recientes de cada tipo.
const PREF_ANTES = `${CLAVE}-antes-import-`, PREF_CRUDO = `${CLAVE}-crudo-`;
const MAX_COPIAS = 2;
const clavesDe = s => {
  const r = [];
  try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (typeof k === "string") r.push(k); } } catch { /* sin listado */ }
  return r;
};
const comparar = (a, b) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0);
export function podarCopias(storage, prefijo, conservar = MAX_COPIAS) {
  try {
    const ks = clavesDe(storage).filter(k => k.startsWith(prefijo))
      .sort((a, b) => comparar(a.slice(prefijo.length), b.slice(prefijo.length)));
    const sobran = ks.slice(0, Math.max(0, ks.length - conservar));
    for (const k of sobran) storage.removeItem(k);
    return sobran.length;
  } catch { return 0; }
}
// Guarda una copia; si no cabe, borra las más viejas y reintenta una vez. Devuelve si quedó guardada.
function escribirCopia(storage, prefijo, sufijo, valor) {
  let ok = false;
  try { storage.setItem(prefijo + sufijo, valor); ok = true; }
  catch {
    podarCopias(storage, prefijo, 1);
    try { storage.setItem(prefijo + sufijo, valor); ok = true; } catch { /* sin espacio */ }
  }
  podarCopias(storage, prefijo);
  return ok;
}

export function crearAlmacen(storage = almacenamientoPorDefecto(), reloj = () => new Date()) {
  let e, crudo = null, descartados = 0, ilegible = false, copiaCarga = false;
  try { crudo = storage.getItem(CLAVE); } catch { /* sin acceso */ }
  try { e = JSON.parse(crudo); } catch { e = null; }
  if (!valido(e)) {
    // Si había algo guardado que no se pudo leer, se conserva una copia cruda antes de que cualquier guardado lo sobrescriba.
    if (crudo !== null && crudo !== undefined) {
      ilegible = true;
      copiaCarga = escribirCopia(storage, PREF_CRUDO, String(reloj().getTime()), String(crudo));
    }
    e = vacio();
  } else {
    const antes = e.domingos.length + e.favoritos.length + e.historial.length;
    e.domingos = e.domingos.filter(validoDomingo);
    e.favoritos = e.favoritos.filter(validoFavorito);
    e.historial = e.historial.filter(validoHistorial);
    e.config = sanearConfig(e.config);
    descartados = antes - (e.domingos.length + e.favoritos.length + e.historial.length);
    // Lo dañado se aparta: queda una copia cruda del estado completo antes de que un guardado lo sobrescriba.
    if (descartados) copiaCarga = escribirCopia(storage, PREF_CRUDO, String(reloj().getTime()), String(crudo));
  }
  podarCopias(storage, PREF_CRUDO); podarCopias(storage, PREF_ANTES);

  // Resultado del último guardado en la tablet: true si quedó escrito, false si no hubo espacio u otro fallo.
  let ultimoOk = true;
  const guardar = () => {
    try { storage.setItem(CLAVE, JSON.stringify(e)); ultimoOk = true; }
    catch { ultimoOk = false; /* sin espacio: los datos siguen en memoria mientras la app esté abierta */ }
    return ultimoOk;
  };
  const nuevoId = () => reloj().getTime().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    // Lo que pasó al cargar: elementos dañados apartados, si el estado entero era ilegible y si quedó copia cruda.
    infoCarga: () => ({ descartados, ilegible, copia: copiaCarga }),
    descartados: () => descartados,
    // true si el último guardado quedó escrito en la tablet.
    persistido: () => ultimoOk,
    domingos: () => [...e.domingos].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    // Devuelve el id, o null si el domingo no es válido (no se guarda). Para saber si quedó escrito: persistido().
    guardarDomingo({ id, fecha, titulo, citas }) {
      const d = { id: id || nuevoId(), fecha, titulo: titulo ?? "", citas: citas || [] };
      if (!validoDomingo(d)) return null;
      const i = e.domingos.findIndex(x => x.id === d.id);
      if (i >= 0) e.domingos[i] = d; else e.domingos.push(d);
      guardar();
      return d.id;
    },
    borrarDomingo(id) { e.domingos = e.domingos.filter(d => d.id !== id); return guardar(); },
    domingoActual(hoy) {
      const prox = e.domingos.filter(d => d.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      return prox || [...e.domingos].sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null;
    },
    favoritos: () => [...e.favoritos],
    series: () => [...new Set(e.favoritos.map(f => f.serie))].sort((a, b) => a.localeCompare(b, "es")),
    // Los modificadores devuelven true si el cambio quedó guardado en la tablet y false si no.
    agregarFavorito(serie, cita) {
      if (!validoCita(cita) || !cita.codigo) return false;
      serie = String(serie || "").trim() || "Favoritos";
      if (e.favoritos.some(f => f.serie === serie && f.cita.codigo === cita.codigo)) return true;
      e.favoritos.push({ id: nuevoId(), serie, cita });
      return guardar();
    },
    quitarFavorito(id) { e.favoritos = e.favoritos.filter(f => f.id !== id); return guardar(); },
    historial: () => [...e.historial],
    registrarHistorial(cita) {
      if (!validoCita(cita)) return false;
      e.historial = [{ cita, cuando: reloj().toISOString() }, ...e.historial.filter(h => h.cita.codigo !== cita.codigo)]
        .slice(0, MAX_HISTORIAL);
      return guardar();
    },
    config: () => ({ ...e.config }),
    guardarConfig(parcial) { e.config = sanearConfig({ ...e.config, ...parcial }); return guardar(); },
    // La copia se arma sin marcar la fecha: se marca con marcarRespaldo() solo cuando compartir o descargar terminó.
    // No lleva el código de la pantalla: cada tablet conserva el suyo.
    exportar() {
      const { pantalla, ...config } = e.config;
      return JSON.stringify({ ...e, config, exportado: reloj().toISOString() }, null, 1);
    },
    marcarRespaldo() { e.config.ultimoRespaldo = reloj().toISOString(); return guardar(); },
    importar(texto) {
      let n;
      try { n = JSON.parse(texto); } catch { throw new Error("Archivo no válido"); }
      if (!valido(n)) throw new Error("Archivo no válido");
      delete n.exportado;
      const antes = n.domingos.length + n.favoritos.length + n.historial.length;
      n.domingos = n.domingos.filter(validoDomingo);
      n.favoritos = n.favoritos.filter(validoFavorito);
      n.historial = n.historial.filter(validoHistorial);
      const descartados = antes - (n.domingos.length + n.favoritos.length + n.historial.length);
      n.historial = n.historial.slice(0, MAX_HISTORIAL);
      // El código de pantalla que traiga el archivo se ignora: la tablet conserva el suyo.
      n.config = { ...sanearConfig(n.config), pantalla: e.config.pantalla };
      // Antes de reemplazar, se guarda una copia de lo actual por si la copia importada era vieja.
      escribirCopia(storage, PREF_ANTES, reloj().toISOString(), JSON.stringify(e));
      e = n;
      guardar();
      return descartados;
    },
  };
}
