// Búsqueda por texto en las Biblias cargadas ("como YouTube"): se escribe un pedazo del versículo
// y se encuentra la cita. Ignora acentos, mayúsculas y palabras pequeñas; entiende algunos sinónimos
// (Señor = Jehová = Dios) y premia las palabras que aparecen seguidas como en la frase.
import { LIBROS } from "./libros.js";

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

// Índice invertido: cada ficha apunta a la lista (ordenada) de entradas que la contienen. Así buscar solo
// toca las entradas que comparten fichas con la consulta, en vez de recorrer las ~62 000. Las entradas no
// guardan su arreglo de fichas (menos memoria): las pocas candidatas se vuelven a fichar al comprobar pares.
const INVERTIDOS = new WeakMap();   // índice (arreglo de entradas) → Map ficha → Int32Array de posiciones

const nuevoConstructor = () => {
  const indice = [], post = new Map();
  return {
    agregarLibro(sigla, libro, caps) {
      for (const [cap, vs] of Object.entries(caps || {}))
        for (const [v, texto] of Object.entries(vs || {})) {
          if (!texto) continue;
          const f = fichas(texto), id = indice.length;
          indice.push({ sigla, libro: +libro, cap: +cap, v: +v, texto, n: f.length });
          for (const w of f) {
            const a = post.get(w);
            if (!a) post.set(w, [id]); else if (a[a.length - 1] !== id) a.push(id);
          }
        }
    },
    terminar() {
      for (const [w, a] of post) post.set(w, Int32Array.from(a));
      INVERTIDOS.set(indice, post);
      return indice;
    },
    // Lo mismo, pero repartido en tandas para no dejar la pantalla quieta al final.
    async terminarCediendo(ceder) {
      const claves = [...post.keys()];
      for (let i = 0; i < claves.length; i += 4000) {
        for (const w of claves.slice(i, i + 4000)) post.set(w, Int32Array.from(post.get(w)));
        await ceder();
      }
      INVERTIDOS.set(indice, post);
      return indice;
    },
  };
};

// Para un arreglo de entradas armado a mano (sin pasar por crearIndice).
function invertir(indice) {
  const post = new Map();
  indice.forEach((e, id) => {
    for (const w of new Set(e.fichas ?? fichas(e.texto))) { const a = post.get(w); if (a) a.push(id); else post.set(w, [id]); }
  });
  for (const [w, a] of post) post.set(w, Int32Array.from(a));
  INVERTIDOS.set(indice, post);
  return post;
}

export function crearIndice(versiones) {
  const c = nuevoConstructor();
  for (const { sigla, libros } of versiones)
    for (const [libro, caps] of Object.entries(libros || {})) c.agregarLibro(sigla, libro, caps);
  return c.terminar();
}

export const cederTurno = () => new Promise(r => setTimeout(r));

// Igual que crearIndice, pero cede el turno al navegador cada `cadaLibros` libros para no congelar la pantalla.
export async function crearIndiceAsync(versiones, { cadaLibros = 1, ceder = cederTurno } = {}) {
  const c = nuevoConstructor();
  let n = 0;
  for (const { sigla, libros } of versiones)
    for (const [libro, caps] of Object.entries(libros || {})) {
      c.agregarLibro(sigla, libro, caps);
      if (++n % cadaLibros === 0) await ceder();
    }
  return c.terminarCediendo(ceder);
}

// Arma el índice leyendo las Biblias guardadas (`biblias` = crearBiblias()), libro por libro y cediendo el turno.
export async function armarIndiceDesde(biblias, { cadaLibros = 1, ceder = cederTurno } = {}) {
  const c = nuevoConstructor();
  let n = 0;
  for (const m of await biblias.versiones())
    for (const [i, [codigo, , capitulos]] of LIBROS.entries()) {
      const caps = {};
      for (let k = 1; k <= capitulos; k++) { const cap = await biblias.capitulo(m.sigla, codigo, k); if (cap) caps[k] = cap; }
      c.agregarLibro(m.sigla, i + 1, caps);
      if (++n % cadaLibros === 0) await ceder();
    }
  return c.terminarCediendo(ceder);
}

export function buscar(indice, consulta, { sigla = null, max = 20 } = {}) {
  const q = fichas(consulta);
  if (!q.length) return [];
  const contenido = q.filter(w => !VACIAS.has(w));
  const qc = contenido.length ? contenido : q;
  const pares = q.slice(1).map((w, i) => q[i] + " " + w);
  const minimo = Math.ceil(0.6 * qc.length);
  const post = INVERTIDOS.get(indice) ?? invertir(indice);
  // Cuántas fichas de la consulta tiene cada entrada (una palabra repetida en la consulta cuenta cada vez).
  const cuentas = new Int32Array(indice.length), tocadas = [];
  for (const w of qc) {
    const a = post.get(w);
    if (a) for (let i = 0; i < a.length; i++) if (cuentas[a[i]]++ === 0) tocadas.push(a[i]);
  }
  const candidatas = Int32Array.from(tocadas.filter(id => cuentas[id] >= minimo)).sort();   // en el orden del índice
  const mejores = new Map();
  for (const id of candidatas) {
    const e = indice[id];
    if (sigla && e.sigla !== sigla) continue;
    const f = pares.length || e.n === undefined ? (e.fichas ?? fichas(e.texto)) : null;
    let seguidos = 0;
    if (pares.length) {
      const pe = new Set(f.slice(1).map((w, i) => f[i] + " " + w));
      for (const p of pares) if (pe.has(p)) seguidos++;
    }
    const puntaje = cuentas[id] / qc.length + 0.8 * (pares.length ? seguidos / pares.length : 0) - 0.002 * (e.n ?? f.length);
    const clave = `${e.libro}.${e.cap}.${e.v}`;
    const previo = mejores.get(clave);
    if (!previo || puntaje > previo.puntaje)
      mejores.set(clave, { sigla: e.sigla, libro: e.libro, cap: e.cap, v: e.v, texto: e.texto, puntaje });
  }
  return [...mejores.values()].sort((a, b) => b.puntaje - a.puntaje).slice(0, max);
}
