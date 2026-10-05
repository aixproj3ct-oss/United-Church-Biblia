// Datos del pastor guardados solo en la tablet (localStorage). Nada sale del dispositivo.
const CLAVE = "uc-biblia-v1";
const MAX_HISTORIAL = 30;

const vacio = () => ({ version: 1, domingos: [], favoritos: [], historial: [],
  config: { nombre: "pastor", letra: "grande", ultimoRespaldo: null, avisoYouVersion: false } });

const LETRAS = ["normal", "grande", "muy-grande"];
const sanearConfig = c => {
  const o = c && typeof c === "object" ? c : {};
  return {
    nombre: typeof o.nombre === "string" && o.nombre.trim() ? o.nombre : "pastor",
    letra: LETRAS.includes(o.letra) ? o.letra : "grande",
    ultimoRespaldo: typeof o.ultimoRespaldo === "string" ? o.ultimoRespaldo : null,
    avisoYouVersion: o.avisoYouVersion === true,
  };
};

const memoriaVolatil = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const almacenamientoPorDefecto = () => {
  try { return globalThis.localStorage ?? memoriaVolatil(); } catch { return memoriaVolatil(); }
};

const valido = e => e && e.version === 1 && Array.isArray(e.domingos) && Array.isArray(e.favoritos)
  && Array.isArray(e.historial) && e.config && typeof e.config === "object";

const validoCita = c => c && typeof c.codigo === "string" && typeof c.etiqueta === "string" && typeof c.url === "string" && c.url.startsWith("https://www.bible.com/bible/176/");
const validoDomingo = d => d && typeof d.id === "string" && typeof d.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) && typeof d.titulo === "string" && Array.isArray(d.citas) && d.citas.every(validoCita);
const validoFavorito = f => f && typeof f.id === "string" && typeof f.serie === "string" && validoCita(f.cita);
const validoHistorial = h => h && validoCita(h.cita) && typeof h.cuando === "string";

export function crearAlmacen(storage = almacenamientoPorDefecto(), reloj = () => new Date()) {
  let e, crudo = null;
  try { crudo = storage.getItem(CLAVE); } catch { /* sin acceso */ }
  try { e = JSON.parse(crudo); } catch { e = null; }
  if (!valido(e)) {
    // Si había algo guardado que no se pudo leer, se conserva una copia cruda antes de que cualquier guardado lo sobrescriba.
    if (crudo !== null && crudo !== undefined) {
      try { storage.setItem(`${CLAVE}-crudo-${reloj().getTime()}`, String(crudo)); } catch { /* sin espacio */ }
    }
    e = vacio();
  } else {
    e.domingos = (e.domingos || []).filter(validoDomingo);
    e.favoritos = (e.favoritos || []).filter(validoFavorito);
    e.historial = (e.historial || []).filter(validoHistorial);
    e.config = sanearConfig(e.config);
  }

  const guardar = () => {
    try { storage.setItem(CLAVE, JSON.stringify(e)); } catch { /* quota exceeded, continue in memory */ }
  };
  const nuevoId = () => reloj().getTime().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    domingos: () => [...e.domingos].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    guardarDomingo({ id, fecha, titulo, citas }) {
      const d = { id: id || nuevoId(), fecha, titulo: titulo || "", citas: citas || [] };
      const i = e.domingos.findIndex(x => x.id === d.id);
      if (i >= 0) e.domingos[i] = d; else e.domingos.push(d);
      guardar();
      return d.id;
    },
    borrarDomingo(id) { e.domingos = e.domingos.filter(d => d.id !== id); guardar(); },
    domingoActual(hoy) {
      const prox = e.domingos.filter(d => d.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      return prox || [...e.domingos].sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null;
    },
    favoritos: () => [...e.favoritos],
    series: () => [...new Set(e.favoritos.map(f => f.serie))].sort((a, b) => a.localeCompare(b, "es")),
    agregarFavorito(serie, cita) {
      if (!validoCita(cita) || !cita.codigo) return;
      serie = String(serie || "").trim() || "Favoritos";
      if (e.favoritos.some(f => f.serie === serie && f.cita.codigo === cita.codigo)) return;
      e.favoritos.push({ id: nuevoId(), serie, cita });
      guardar();
    },
    quitarFavorito(id) { e.favoritos = e.favoritos.filter(f => f.id !== id); guardar(); },
    historial: () => [...e.historial],
    registrarHistorial(cita) {
      if (!validoCita(cita)) return;
      e.historial = [{ cita, cuando: reloj().toISOString() }, ...e.historial.filter(h => h.cita.codigo !== cita.codigo)]
        .slice(0, MAX_HISTORIAL);
      guardar();
    },
    config: () => ({ ...e.config }),
    guardarConfig(parcial) { e.config = sanearConfig({ ...e.config, ...parcial }); guardar(); },
    exportar() {
      e.config.ultimoRespaldo = reloj().toISOString();
      guardar();
      return JSON.stringify({ ...e, exportado: e.config.ultimoRespaldo }, null, 1);
    },
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
      n.config = sanearConfig(n.config);
      e = n;
      guardar();
      return descartados;
    },
  };
}
