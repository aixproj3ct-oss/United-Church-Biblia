// Presentación del bosquejo desde la tablet: qué lámina está en la pantalla de la iglesia, cómo avanzar y retroceder,
// y la vista del pastor (lámina chica, notas privadas, índice y estado). Sin DOM: la app lo conecta con los botones.
// Por el canal solo sale publicoDe(b) (títulos, frases y referencias); las notas privadas se quedan en la tablet.
import { msgLamina, msgEspera, msgConsulta } from "../proyeccion/mensajes.js";
import { refDeCodigo, etiquetaRef } from "../pasaje.js";
import { htmlTitulo, htmlRecuerda, htmlPunto } from "../proyeccion/lamina-bosquejo.js";
import { laminasDe, publicoDe, notasDe } from "./modelo.js";
import { esc } from "../ui.js";

const ESPERA_MS = 5000;   // sin respuesta de la PC después de esto, se dice "Sin respuesta"
const REDIBUJO_MS = 5200; // un poco después, la vista se vuelve a dibujar sola para mostrarlo
const CLAVE_PRES = "uc-pres"; // sessionStorage: dónde iba la presentación (solo id, lámina, versión y hora de inicio; nunca notas)
const ERRORES = {
  mostrar: "La pantalla no pudo mostrar la lámina",
  reloj: "La hora de la tablet y la de la PC no coinciden",
  biblia: "La PC no tiene una Biblia cargada",
};

// canal: el de la pantalla (o una función que lo da, porque conectar otra pantalla cambia de canal).
// alCambiar(): algo cambió y la vista debe redibujarse. alFallar(e): no se pudo publicar (para avisar el motivo).
export function crearPresentacion({ canal, ahora = () => Date.now(), esperar = (f, ms) => setTimeout(f, ms), alCambiar = () => {}, alFallar = () => {}, alEsperar = () => {},
  sesion = (() => { try { return globalThis.sessionStorage ?? null; } catch { return null; } })() }) {
  const elCanal = () => (typeof canal === "function" ? canal() : canal);
  // b: el bosquejo completo (con notas); pub: lo que viaja; lams: sus láminas. Todo null cuando no hay presentación.
  let b = null, pub = null, lams = [], sigla = "", inicio = 0;
  let i = 0, parte = 0, partes = 1;          // dónde está el pastor y cuántas partes dijo la PC que tiene esta lámina
  let esperando = null, confirmado = false, fallo = false, error = null, sinTexto = 0;
  let envioNo = 0, ultimaT = 0, enEspera = false, quitando = false;

  // La PC descarta lo que no sea más nuevo que lo último: la hora de cada envío sube siempre, aunque el reloj no se mueva.
  const hora = () => (ultimaT = Math.max(ahora(), ultimaT + 1));
  const aviso = () => { try { alCambiar(); } catch { /* la vista ya no existe */ } };

  // Dónde iba la presentación, para retomarla tras recargar la tablet o proyectar un pasaje en medio. Sin sessionStorage no se recuerda.
  const recordar = () => { try { sesion?.setItem(CLAVE_PRES, JSON.stringify({ bosquejoId: b.id, i, sigla, inicio })); } catch { /* sin sessionStorage */ } };
  const olvidar = () => { try { sesion?.removeItem(CLAVE_PRES); } catch { /* sin sessionStorage */ } };
  const recordado = id => {
    try {
      const d = JSON.parse(sesion?.getItem(CLAVE_PRES) ?? "null");
      return d && d.bosquejoId === id && Number.isInteger(d.i) && d.i >= 0 && d.i < lams.length && typeof d.sigla === "string" && d.sigla && Number.isFinite(d.inicio) ? d : null;
    } catch { return null; }
  };

  // Publica lo que dice (i, parte, sigla). El estado pasa a "enviando" al instante; si falla queda "sin" con el motivo.
  async function publicarLamina() {
    const mio = ++envioNo;
    // El estado se actualiza antes de esperar al canal: dos toques seguidos no se pisan.
    esperando = ahora(); confirmado = false; fallo = false; error = null; sinTexto = 0; enEspera = false;
    recordar();
    aviso();
    try { await elCanal().publicar(msgLamina({ bosquejo: pub, i, sigla, parte }, hora())); }
    catch (e) {
      if (mio === envioNo) { fallo = true; aviso(); }
      try { alFallar(e); } catch { /* sin aviso */ }
      return false;
    }
    esperar(aviso, REDIBUJO_MS); // a los 5,2 s, si la PC no contestó, la vista dice "Sin respuesta"
    return true;
  }

  const pres = {
    activa: () => b !== null,
    bosquejo: () => b,
    sigla: () => sigla,
    lamina: () => lams[i] ?? null,

    // Lámina 0 en pantalla, o la que se recordó si es el mismo bosquejo (con su versión y su hora de inicio).
    // `b` es el bosquejo completo; solo publicoDe(b) sale de la tablet.
    empezar(bosq, siglaInicial) {
      b = bosq; pub = publicoDe(bosq); lams = laminasDe(bosq); sigla = siglaInicial;
      const antes = recordado(bosq.id);
      i = antes ? antes.i : 0; parte = 0; partes = 1; inicio = antes ? antes.inicio : ahora();
      if (antes) sigla = antes.sigla;
      return publicarLamina();
    },

    // Primero las partes de la lámina actual (las que informó la PC), después la lámina siguiente. En la última no hace nada.
    async siguiente() {
      if (!b) return false;
      if (pres.estado().envio === "enviando") return false; // aún no se sabe cuántas partes tiene esta lámina: no se salta ninguna
      if (partes > parte + 1) parte++;
      else if (i < lams.length - 1) { i++; parte = 0; partes = 1; }
      else return false;
      return publicarLamina();
    },
    async anterior() {
      if (!b) return false;
      if (parte > 0) parte--;
      else if (i > 0) { i--; parte = 0; partes = 1; }
      else return false;
      return publicarLamina();
    },
    async irA(n) {
      if (!b || !Number.isInteger(n) || n < 0 || n >= lams.length) return false;
      i = n; parte = 0; partes = 1;
      return publicarLamina();
    },
    // Otra versión de la Biblia: la misma lámina, otra vez desde la parte 0.
    async cambiarVersion(nueva) {
      if (!b) return false;
      sigla = nueva; parte = 0; partes = 1;
      return publicarLamina();
    },
    // Vuelve a mandar lo que se ve en la tablet (después de "Sin respuesta").
    async reintentar() { return b ? publicarLamina() : false; },

    // Deja la pantalla de la iglesia en espera y termina la presentación. Si no se pudo publicar, sigue y lanza el error.
    async quitar() {
      if (!b) return;
      const c = elCanal();
      quitando = true; // la respuesta "espera" de la PC a este Quitar no es una sorpresa
      try { if (c) await c.publicar(msgEspera(hora())); } // sin pantalla conectada no hay nada que dejar en espera
      finally { quitando = false; }
      pres.soltar();
      olvidar(); // Quitar termina el sermón: la próxima vez empieza en el título
    },
    // Termina la presentación sin publicar nada (la pantalla ya pasó a otra cosa, p. ej. a un pasaje).
    soltar() { b = pub = null; lams = []; esperando = null; confirmado = false; fallo = false; error = null; envioNo++; aviso(); },

    // Pregunta a la PC qué muestra (al volver a la vista); su respuesta llega por recibirEstado.
    async consultar() { if (!b) return; try { await elCanal()?.publicar(msgConsulta(hora())); } catch { /* sin red: el estado ya lo dirá */ } },

    // Lo que contesta la PC. Devuelve true si la presentación se hizo cargo del mensaje. Solo cuenta si es de esta lámina y de la parte que se pidió (o un error de esta lámina).
    recibirEstado(m) {
      if (b && m?.de === "pantalla" && m.tipo === "estado" && m.espera === true) { // la PC quedó en espera por su cuenta (Esc o reinicio)
        if (esperando !== null || quitando) return true; // responde a un envío nuestro o a Quitar: no es sorpresa
        enEspera = true; confirmado = false;
        try { alEsperar(); } catch { /* sin aviso */ }
        aviso(); return true;
      }
      // Error sin lámina (la hora de la PC y la de la tablet no coinciden): solo importa si se espera respuesta a un envío.
      if (b && m?.de === "pantalla" && m.tipo === "estado" && m.codigo === undefined && m.bosquejo === undefined && m.error && esperando !== null) {
        error = m.error; esperando = null; confirmado = true; sinTexto = 0;
        aviso(); return true;
      }
      if (!b || !m || m.de !== "pantalla" || m.tipo !== "estado" || m.bosquejo !== pub.id || m.lamina !== i) return false;
      if (m.error) { error = m.error; esperando = null; confirmado = true; sinTexto = m.sinTexto ?? 0; return aviso(); }
      if (m.parte !== parte) {
        // Con un envío pendiente, otra parte es una respuesta vieja. Sin envío pendiente, la PC cambió de parte por su cuenta (← →): se sigue a la PC.
        if (esperando !== null || !Number.isInteger(m.parte) || !Number.isInteger(m.partes) || m.parte < 0 || m.parte >= m.partes) return;
        parte = m.parte;
      }
      partes = m.partes; esperando = null; confirmado = true; error = null; enEspera = false; sinTexto = m.sinTexto ?? 0;
      aviso();
    },

    // enviando: hasta que la PC confirma; ok: confirmó; sin: pasaron 5 s sin respuesta o no se pudo publicar; error: la PC no pudo mostrarla.
    estado() {
      const tarde = esperando !== null && ahora() - esperando > ESPERA_MS;
      const envio = error ? "error" : enEspera || fallo || tarde || (!confirmado && esperando === null) ? "sin" : esperando !== null ? "enviando" : "ok";
      return { lamina: lams[i] ?? null, i, parte, partes, envio, error, espera: enEspera, sinTexto, total: lams.length,
        minutos: b ? Math.max(0, Math.floor((ahora() - inicio) / 60000)) : 0 };
    },

    // Título, un botón por punto y ¡Recuerda!. `i` es la primera lámina de cada uno; `actual` incluye todas las de ese punto.
    indice() {
      const grupos = new Map(), clave = l => (l.tipo === "punto" ? `p${l.p}` : l.tipo);
      lams.forEach((l, n) => { if (!grupos.has(clave(l))) grupos.set(clave(l), { eti: l.tipo === "titulo" ? "Título" : l.tipo === "recuerda" ? "¡Recuerda!" : String(l.p + 1), i: n }); });
      const hoy = lams[i] ? clave(lams[i]) : null;
      return [...grupos].map(([k, g]) => ({ ...g, ya: k !== hoy && g.i < i, actual: k === hoy }));
    },
    // Lo que va a pasar al tocar Siguiente: otra parte del mismo versículo, la lámina siguiente o nada.
    sigue() {
      if (!b) return null;
      if (partes > parte + 1) return { tipo: "parte", i, parte: parte + 1, partes };
      return i < lams.length - 1 ? { tipo: "lamina", i: i + 1, lamina: lams[i + 1] } : null;
    },
    notas: () => (b ? notasDe(b, lams[i]) : { titulo: "", partes: [] }),
    publico: () => pub,
  };
  return pres;
}

// ---------- La vista del pastor (texto HTML; la app lo pone en la página) ----------

const ic = id => `<svg class="ico"><use href="#i-${id}"/></svg>`;

// Texto de la lámina chica de la tablet: las mismas piezas que dibuja la pantalla, pero un versículo se muestra solo con su referencia.
export function htmlMini(publico, lam) {
  let html;
  if (lam.tipo === "titulo") html = htmlTitulo(publico);
  else if (lam.tipo === "recuerda") html = htmlRecuerda(publico);
  else if (lam.v === null) html = htmlPunto(publico, lam.p);
  else {
    const r = refDeCodigo(publico.puntos[lam.p].versos[lam.v]);
    html = htmlPunto(publico, lam.p, { ref: r ? etiquetaRef(r) : "" });
  }
  return `<div class="mini-lam"><div class="mini-caja">${html}</div></div>`;
}

// El motivo en español de lo que dice el estado de envío.
export function textoEnvio(est) {
  if (est.envio === "error") return ERRORES[est.error] ?? ERRORES.mostrar;
  if (est.espera) return "La pantalla de la iglesia quedó en espera";
  if (est.envio === "sin") return "Sin respuesta";
  if (est.envio === "enviando") return "Enviando…";
  return est.sinTexto ? "En pantalla · falta el versículo" : "En pantalla";
}

// "11:42 · predicando hace 18 min" en dos líneas.
export const htmlReloj = (hora, minutos) =>
  `<b>${esc(hora)}</b><br>${minutos < 1 ? "recién empezó" : `predicando hace ${minutos} min`}`;

const nVersos = n => (n === 1 ? "1 versículo" : `${n} versículos`);

function htmlSigue(pres) {
  const s = pres.sigue(), pub = pres.publico();
  if (!s) return `<div class="p-sigue"><p class="p-sigue-t"><b>Sigue</b><br>Es la última lámina</p></div>`;
  if (s.tipo === "parte") return `<div class="p-sigue"><p class="p-sigue-t"><b>Sigue</b><br>El resto del versículo (${s.parte + 1} de ${s.partes})</p></div>`;
  const l = s.lamina;
  const que = l.tipo === "titulo" ? "Título del sermón"
    : l.tipo === "recuerda" ? `¡Recuerda!: ${esc(pub.recuerda)}`
    : `Punto ${l.p + 1}: ${esc(pub.puntos[l.p].frase)}${l.v === null || pub.puntos[l.p].versos.length === 1 ? "" : `<br>${l.v === 0 ? `(${nVersos(pub.puntos[l.p].versos.length)})` : `(versículo ${l.v + 1} de ${pub.puntos[l.p].versos.length})`}`}`;
  return `<div class="p-sigue">${htmlMini(pub, l)}<p class="p-sigue-t"><b>Sigue</b><br>${que}</p></div>`;
}

function htmlNotas(pres) {
  const n = pres.notas();
  const cuerpo = n.partes.length ? n.partes.map(p => `<h4>${esc(p.eti)}</h4><p>${esc(p.texto)}</p>`).join("") : `<p class="vacio">No escribiste notas para esta lámina.</p>`;
  return `${n.titulo ? `<h3>${esc(n.titulo)}</h3>` : ""}${cuerpo}`;
}

// Lo que cambia con cada paso: la lámina en pantalla y la que sigue, las notas, y la barra de abajo.
export function htmlContenido(pres) {
  const est = pres.estado(), pub = pres.publico();
  if (!pub || !est.lamina) return "";
  const mal = est.envio === "sin" || est.envio === "error";
  const ultima = est.i >= est.total - 1 && est.parte >= est.partes - 1;
  const idx = pres.indice().map(x =>
    `<button type="button" class="p-ir ${x.actual ? "on" : x.ya ? "ya" : ""}" data-p-ir="${x.i}"${x.actual ? ' aria-current="step"' : ""}>${esc(x.eti)}</button>`).join("");
  const partes = est.partes > 1 ? `<span class="cnt">${est.parte + 1} de ${est.partes}</span>` : "";
  return `<div class="p-cuerpo"><div class="p-izq">
      <div class="p-eti ${est.envio === "ok" ? "ok" : ""}">● ${est.envio === "ok" ? "En pantalla ahora" : "Lámina elegida"}</div>
      ${htmlMini(pub, est.lamina)}${partes ? `<p class="p-partes">Parte ${est.parte + 1} de ${est.partes} del versículo</p>` : ""}
      ${htmlSigue(pres)}</div>
    <div class="p-notas" data-lam="${est.i}" tabindex="0" aria-label="Tus notas de esta lámina">${htmlNotas(pres)}</div></div>
    <footer class="barra p-barra">
      <button type="button" class="btn p-grande" data-p-ant ${est.i === 0 && est.parte === 0 ? "disabled" : ""}>${ic("izq")}Anterior</button>
      <nav class="p-indice" aria-label="Láminas">${idx}</nav>
      <button type="button" class="btn p-grande p-sig" data-p-sig ${ultima || est.envio === "enviando" ? "disabled" : ""}>Siguiente${ic("der")}</button>
      <div class="zona der"><span class="estado ${mal ? "mal" : est.envio === "enviando" ? "envio" : ""}"><i></i>${esc(textoEnvio(est))}</span>
        ${mal ? `<button type="button" class="btn" data-p-reintentar>Reintentar</button>` : ""}
        <button type="button" class="btn peli quitar" data-p-quitar>Quitar</button></div></footer>`;
}

// La vista completa: encabezado (Volver, Inicio, título, letra, versiones, reloj) y el contenido. `versiones` = siglas.
export function vistaPresentar(pres, { hora = "", versiones = [] } = {}) {
  const pub = pres.publico(), est = pres.estado();
  const vers = versiones.map(s => `<button type="button" class="${s === pres.sigla() ? "on" : ""}" aria-pressed="${s === pres.sigla()}" data-p-version="${esc(s)}">${esc(s)}</button>`).join("");
  return `<section class="lector presentar"><header class="l-cab"><button class="ib" data-volver aria-label="Volver">${ic("izq")}</button>
    <button class="btn-ini" data-inicio>${ic("casa")}Inicio</button>
    <h1 class="l-ref">${esc(pub?.titulo ?? "")}</h1>
    <div class="l-herr"><span class="letra-g" role="group" aria-label="Tamaño de letra"><button data-letra-paso="-1" aria-label="Letra más chica">A−</button><button data-letra-paso="1" aria-label="Letra más grande">A+</button></span>
      <span class="versiones" id="p-versiones" role="group" aria-label="Versión">${vers}</span>
      <div class="reloj" id="p-reloj">${htmlReloj(hora, est.minutos)}</div></div></header>
    <div class="p-cont" id="p-cont">${htmlContenido(pres)}</div></section>`;
}
