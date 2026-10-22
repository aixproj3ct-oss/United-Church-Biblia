// Búsqueda por texto en las Biblias cargadas ("como YouTube"): se escribe un pedazo del versículo
// y se encuentra la cita. Ignora acentos, mayúsculas y palabras pequeñas; entiende algunos sinónimos
// (Señor = Jehová = Dios) y premia las palabras que aparecen seguidas como en la frase.
const VACIAS = new Set("el la los las un una unos unas de del al a y o que en por para con se lo le les su sus es no me te nos mas muy".split(" "));
const SINONIMOS = { senor: "dios", jehova: "dios", cristo: "jesus", jesucristo: "jesus" };

export const normalizar = t => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9ñ ]+/g, " ").replace(/ñ/g, "n").replace(/\s+/g, " ").trim();

const CANONICAS = new Set(Object.values(SINONIMOS));

function raiz(w) {
  if (SINONIMOS[w]) return SINONIMOS[w];
  if (CANONICAS.has(w)) return w;
  for (const suf of ["es", "s"]) if (w.length > 4 && w.endsWith(suf)) return w.slice(0, -suf.length);
  return w;
}

export const fichas = t => normalizar(t).split(" ").filter(Boolean).map(raiz);

export const palabrasResaltar = consulta => normalizar(consulta).split(" ").filter(w => w && !VACIAS.has(w));

export function crearIndice(versiones) {
  const indice = [];
  for (const { sigla, libros } of versiones)
    for (const [libro, caps] of Object.entries(libros || {}))
      for (const [cap, vs] of Object.entries(caps || {}))
        for (const [v, texto] of Object.entries(vs || {}))
          if (texto) indice.push({ sigla, libro: +libro, cap: +cap, v: +v, texto, fichas: fichas(texto) });
  return indice;
}

export function buscar(indice, consulta, { sigla = null, max = 20 } = {}) {
  const q = fichas(consulta);
  if (!q.length) return [];
  const contenido = q.filter(w => !VACIAS.has(w));
  const qc = contenido.length ? contenido : q;
  const pares = q.slice(1).map((w, i) => q[i] + " " + w);
  const minimo = Math.ceil(0.6 * qc.length);
  const mejores = new Map();
  for (const e of indice) {
    if (sigla && e.sigla !== sigla) continue;
    const set = new Set(e.fichas);
    let hits = 0;
    for (const w of qc) if (set.has(w)) hits++;
    if (hits < minimo) continue;
    let seguidos = 0;
    if (pares.length) {
      const pe = new Set(e.fichas.slice(1).map((w, i) => e.fichas[i] + " " + w));
      for (const p of pares) if (pe.has(p)) seguidos++;
    }
    const puntaje = hits / qc.length + 0.8 * (pares.length ? seguidos / pares.length : 0) - 0.002 * e.fichas.length;
    const clave = `${e.libro}.${e.cap}.${e.v}`;
    const previo = mejores.get(clave);
    if (!previo || puntaje > previo.puntaje)
      mejores.set(clave, { sigla: e.sigla, libro: e.libro, cap: e.cap, v: e.v, texto: e.texto, puntaje });
  }
  return [...mejores.values()].sort((a, b) => b.puntaje - a.puntaje).slice(0, max);
}
