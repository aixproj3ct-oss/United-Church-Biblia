// Datos del pastor guardados solo en la tablet (localStorage). Nada sale del dispositivo.
const CLAVE = "uc-biblia-v1";
const MAX_HISTORIAL = 30;

const vacio = () => ({ version: 1, domingos: [], favoritos: [], historial: [],
  config: { nombre: "pastor", letra: "grande", ultimoRespaldo: null } });

const valido = e => e && e.version === 1 && Array.isArray(e.domingos) && Array.isArray(e.favoritos)
  && Array.isArray(e.historial) && e.config && typeof e.config === "object";

export function crearAlmacen(storage = globalThis.localStorage, reloj = () => new Date()) {
  let e;
  try { e = JSON.parse(storage.getItem(CLAVE)); } catch { e = null; }
  if (!valido(e)) e = vacio();
  const guardar = () => storage.setItem(CLAVE, JSON.stringify(e));
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
      serie = String(serie || "").trim() || "Favoritos";
      if (e.favoritos.some(f => f.serie === serie && f.cita.codigo === cita.codigo)) return;
      e.favoritos.push({ id: nuevoId(), serie, cita });
      guardar();
    },
    quitarFavorito(id) { e.favoritos = e.favoritos.filter(f => f.id !== id); guardar(); },
    historial: () => [...e.historial],
    registrarHistorial(cita) {
      e.historial = [{ cita, cuando: reloj().toISOString() }, ...e.historial.filter(h => h.cita.codigo !== cita.codigo)]
        .slice(0, MAX_HISTORIAL);
      guardar();
    },
    config: () => ({ ...e.config }),
    guardarConfig(parcial) { e.config = { ...e.config, ...parcial }; guardar(); },
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
      e = n;
      guardar();
    },
  };
}
