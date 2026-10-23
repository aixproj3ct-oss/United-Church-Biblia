// Interfaz de United Church. El texto bíblico lo muestra el lector propio desde las Biblias cargadas en esta tablet.
import { parseCita, ordenBiblico } from "./src/citas.js";
import { crearAlmacen } from "./src/datos.js";
import { crearBiblias } from "./src/biblias.js";
import { cargarBiblia, ErrorBiblia } from "./src/importar.js";
import { refDeCodigo, etiquetaRef, codigoRef, abreviatura } from "./src/pasaje.js";
import { LIBROS } from "./src/libros.js";
import { nuevaLectura, seguirProyeccion } from "./src/lectura.js";
import { normalizarCodigo } from "./src/proyeccion/mensajes.js";
import { armarIndiceDesde, buscar, fichas, palabrasResaltar } from "./src/busqueda.js";
import { proximoDomingo, fechaLarga, fechaCorta } from "./src/fechas.js";
import { esc, aviso } from "./src/ui.js";
import { citasDe, domingoParaBosquejo, MAX_PUNTOS } from "./src/bosquejo/modelo.js";
import { vistaListaBosquejos, vistaFormBosquejo, revisarCrudo } from "./src/bosquejo/vistas.js";
import { LETRAS } from "./src/datos.js";
import { proy, iniciarLector, conectarPantalla, hayPantalla, sinRespuesta, soltarPantalla, vistaLector, pintarLector,
  sincronizarProyeccion, proyectarActual, reintentar, cambiarParte, quitarDePantalla, alVolver,
  luzDelLector, luzAlVolver, pintarHerramientas } from "./src/lector.js";

// Si algo falla sin que nadie lo atrape, el pastor ve un aviso corto (sin detalles) y el detalle queda en la consola.
let ultimoFallo = 0;
function falloGeneral(detalle) {
  console.error("Error no controlado:", detalle);
  if (Date.now() - ultimoFallo < 4000) return;
  ultimoFallo = Date.now();
  aviso("Algo falló; intenta de nuevo");
}
window.addEventListener("error", ev => { if (!String(ev.message).startsWith("ResizeObserver")) falloGeneral(ev.error ?? ev.message); });
window.addEventListener("unhandledrejection", ev => falloGeneral(ev.reason));

const almacen = crearAlmacen();
const biblias = crearBiblias();
iniciarLector({ almacen, biblias });
const $ = (s, r = document) => r.querySelector(s);
const enc = o => encodeURIComponent(JSON.stringify(o));
const dec = s => JSON.parse(decodeURIComponent(s));
const ic = (id, extra = "") => `<svg class="ico" ${extra}><use href="#i-${id}"/></svg>`;
const hoyISO = () => new Date().toLocaleDateString("en-CA");
const citaDe = r => ({ codigo: r.codigoRef, etiqueta: r.etiqueta });
const VISTAS = ["domingo", "biblia", "bosquejo", "guardados", "config", "lector"];
const vistaInicial = () => almacen.domingoActual(hoyISO()) ? "domingo" : "biblia";
const vistaDeHash = () => { const h = location.hash.slice(1); return VISTAS.includes(h) && h !== "lector" ? h : vistaInicial(); };
let vista = vistaDeHash(), favPendiente = null;
// Domingo: el plan vigente o la lista con el editor (editando: true; domingoSel: el que se edita, null = nuevo).
// verDomingo: un domingo anterior abierto solo para consultar (null = el vigente).
let editando = false, domingoSel = null, verDomingo = null;
// Lo que muestra el lector: la cita, si se ve el capítulo completo y qué versión (null = la principal).
let lectura = null, libroSel = null, testamento = "at", pestana = "historial";
// Búsqueda por texto: el índice se arma una vez (al primer uso) y se descarta si cambian las versiones.
let indice = null, busqueda = null;
// Bosquejo: la lista, o el formulario (editandoB: true; bosquejoSel: el que se edita, null = nuevo).
let editandoB = false, bosquejoSel = null;

const SIN_ESPACIO = "No se pudo guardar en la tablet: falta espacio";
// Muestra msg solo si lo último quedó escrito en la tablet; si no, avisa que falta espacio (nunca dice "guardado").
function avisoGuardado(msg, ms) {
  if (almacen.persistido()) { if (msg) aviso(msg, ms); return true; }
  aviso(SIN_ESPACIO, 7000);
  return false;
}

// Confirmación con el diálogo propio (no el confirm() del navegador). Devuelve true si elige "si".
function confirmar(texto, si, no) {
  return new Promise(res => {
    const dlg = $("#dlg-confirmar");
    if (dlg.open) return res(false);
    $("#conf-texto").textContent = texto; $("#conf-si").textContent = si; $("#conf-no").textContent = no;
    dlg.returnValue = "no";
    const fin = () => { dlg.removeEventListener("close", fin); res(dlg.returnValue === "si"); };
    dlg.addEventListener("close", fin);
    dlg.showModal();
  });
}

// Pide la sigla de una Biblia con el diálogo propio (no el prompt() del navegador). Devuelve "" si se cancela.
function pedirSigla() {
  return new Promise(res => {
    const dlg = $("#dlg-sigla"), campo = $("#sigla-campo");
    if (dlg.open) return res("");
    campo.value = ""; dlg.returnValue = "cancelar";
    const fin = () => { dlg.removeEventListener("close", fin); res(dlg.returnValue === "ok" ? campo.value.trim().slice(0, 20) : ""); };
    dlg.addEventListener("close", fin);
    dlg.showModal();
  });
}

// Borrador del editor de domingos: vive en sessionStorage mientras la pestaña siga abierta.
const CLAVE_BORRADOR = "uc-borrador-domingo";
let baseEd = null;   // lo que mostraba el editor al abrirlo (para saber si hay cambios sin guardar)
const leerBorrador = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR)); } catch { return null; } };
const borrarBorrador = () => { try { sessionStorage.removeItem(CLAVE_BORRADOR); } catch { /* sin sessionStorage */ } };
const valoresEditor = () => $("#d-fecha") ? { fecha: $("#d-fecha").value, titulo: $("#d-titulo").value, citas: $("#d-citas").value } : null;
function hayCambiosEditor() {
  const v = valoresEditor();
  return !!(v && baseEd && (v.fecha !== baseEd.fecha || v.titulo !== baseEd.titulo || v.citas !== baseEd.citas));
}
function guardarBorradorEditor() {
  if (!hayCambiosEditor()) return borrarBorrador();
  try { sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ sel: domingoSel, ...valoresEditor() })); } catch { /* sin sessionStorage */ }
}
// Antes de salir del editor (otra sección, "Volver al plan", otro domingo): si hay cambios, pide confirmar.
async function puedeSalirEditor() {
  if (vista !== "domingo" || !editando || !hayCambiosEditor()) return true;
  if (!await confirmar("Tienes cambios sin guardar. ¿Salir sin guardar?", "Salir sin guardar", "Seguir editando")) return false;
  borrarBorrador();
  return true;
}
// Al abrir el editor: si quedó un borrador de este mismo domingo, ofrece recuperarlo.
async function ofrecerBorrador() {
  const b = leerBorrador(), v = valoresEditor();
  if (!b || !v || b.sel !== domingoSel) return;
  if (b.fecha === v.fecha && b.titulo === v.titulo && b.citas === v.citas) return borrarBorrador();
  if (await confirmar("Tienes un borrador sin guardar de este domingo. ¿Quieres recuperarlo?", "Recuperar", "Descartar")) {
    if (!$("#d-fecha")) return;
    $("#d-fecha").value = b.fecha; $("#d-titulo").value = b.titulo; $("#d-citas").value = b.citas;
    previstaDomingo(); aviso("Borrador recuperado");
  } else borrarBorrador();
}

function hace(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "ahora"; if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? "ayer" : `hace ${d} días`;
}

function abrir(cita, { completo = false, navegando = false, domingo = null, sigla = null } = {}) {
  const ref = refDeCodigo(cita.codigo);
  if (!ref) return aviso("No pude abrir esa cita");
  proy.seguir = seguirProyeccion(proy, { navegando, domingo });
  almacen.registrarHistorial({ codigo: cita.codigo, etiqueta: cita.etiqueta });
  if (domingo) marcarSermon(domingo);
  const r = nuevaLectura(lectura, { codigo: cita.codigo, etiqueta: cita.etiqueta }, ref, { completo, navegando, domingo });
  lectura = r.lectura;
  if (sigla) lectura.sigla = sigla;
  if (!r.reemplazar) return ir("lector", true);
  history.replaceState({ vista: "lector", lectura }, "", "#lector");
  pintar();
}

function abrirCapitulo(codigo, cap) {
  const ref = { codigo, cap, v1: null, v2: null };
  abrir({ codigo: codigoRef(ref), etiqueta: etiquetaRef(ref) }, { completo: true, navegando: vista === "lector" });
}

// "Buenos días, pastor Juan" según la hora de la tablet. El nombre va tal como se escribió en Configuración
// (con "pastor", "hermano" o lo que sea); sin nombre, solo el saludo.
function saludo() {
  const h = new Date().getHours(), s = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const n = almacen.config().pastor;
  return `<p class="saludo">${s}${n ? `, <b>${esc(n)}</b>` : ""}</p>`;
}

// ---------- Domingo ----------
// Por dónde va el sermón: la cita que se lee ahora y las ya abiertas (solo referencias, en esta tablet).
const CLAVE_SERMON = "uc-sermon";
function leerSermon() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SERMON));
    return s && typeof s.id === "string" && Number.isInteger(s.i) && Array.isArray(s.vistas) ? s : null;
  } catch { return null; }
}
function marcarSermon({ id, i }) {
  const s = leerSermon(), antes = s?.id === id ? s.vistas.filter(Number.isInteger) : [];
  try { localStorage.setItem(CLAVE_SERMON, JSON.stringify({ id, i, vistas: [...new Set([...antes, i])] })); } catch { /* sin espacio: solo se pierde la marca */ }
}

function vistaDomingo() {
  if (editando) return vistaEditor();
  const vigente = almacen.domingoActual(hoyISO());
  const consulta = verDomingo ? almacen.domingos().find(x => x.id === verDomingo && x.id !== vigente?.id) ?? null : null;
  const d = consulta ?? vigente;
  if (!d) return `${saludo()}<h1>Domingo</h1><div class="card form"><h2>Aún no hay un domingo preparado</h2>
    <p class="meta">Anota las citas del sermón y aquí aparecerán como botones, listas para proyectar.</p>
    <div><button class="btn pri" data-editar="">${ic("edit")}Preparar el domingo</button></div></div>`;
  const etiqueta = consulta ? "DOMINGO ANTERIOR" : d.fecha === hoyISO() ? "HOY" : d.fecha > hoyISO() ? "PRÓXIMO DOMINGO" : "ÚLTIMO DOMINGO";
  const s = leerSermon(), prog = !consulta && s?.id === d.id && d.citas[s.i] ? s : null;
  const boton = consulta || !d.citas.length ? ""
    : prog ? `<button class="btn ambar" data-empezar="${esc(d.id)}" data-desde="${prog.i}">${ic("play")}Seguir sermón · cita ${prog.i + 1}</button>`
    : `<button class="btn ambar" data-empezar="${esc(d.id)}" data-desde="0">${ic("play")}Empezar sermón</button>`;
  // Un domingo anterior es solo para consultar: sus citas se abren sueltas, sin el plan en la barra.
  const citas = d.citas.map((c, i) => {
    const estado = prog?.i === i ? "actual" : prog?.vistas.includes(i) ? "leida" : "";
    const enPantalla = proy.activo && proy.codigo === c.codigo;
    const marca = estado === "actual" ? `<span class="marca-c"><i></i>Leyendo ahora${enPantalla ? " · en pantalla" : ""}</span>`
      : estado === "leida" ? `<span class="marca-c leida">leída</span>` : ic("der");
    return `<li><button class="cita ${estado}" data-cita="${enc(c)}" ${consulta ? "" : `data-domingo-i="${enc({ id: d.id, i })}"`} ${estado === "actual" ? 'aria-current="step"' : ""}>
      <span class="num-c">${estado === "leida" ? ic("ok") : i + 1}</span><span><b>${esc(c.etiqueta)}</b>${c.titulo ? `<small>${esc(c.titulo)}</small>` : ""}</span>${marca}</button></li>`;
  }).join("");
  const anteriores = almacen.domingos().filter(x => x.id !== vigente?.id && x.fecha < (vigente?.fecha ?? hoyISO())).slice(0, 8);
  return `${saludo()}<div class="dom-grid"><section class="dom-plan">
      <div class="cab-dom"><div><div class="eti oro">${etiqueta} · ${esc(fechaLarga(d.fecha).toUpperCase())}</div>
        <span class="ref">${esc(d.titulo || "Sin título")}</span></div>${boton}</div>
      <ol class="citas">${citas}</ol>
      <div class="acciones">${consulta ? `<button class="enlace" data-ver-domingo="">‹ Volver al domingo actual</button>` : ""}
        <button class="enlace" data-editar="${esc(d.id)}">${ic("edit")}Editar este domingo</button></div></section>
    <aside class="card dom-ant" aria-label="Domingos anteriores"><h2>Domingos anteriores</h2>
      <p class="meta">Solo para consultar. Tocar uno abre sus citas; para cambiarlo, «Editar».</p>
      ${anteriores.length ? anteriores.map(x => `<div class="ant ${x.id === consulta?.id ? "sel" : ""}"><span><b>${esc(fechaCorta(x.fecha))}</b>
        <small>${esc(x.titulo || "Sin título")} · ${x.citas.length} ${x.citas.length === 1 ? "cita" : "citas"}</small></span>
        <button class="btn peq" data-ver-domingo="${esc(x.id)}">Ver</button></div>`).join("") : `<p class="vacio">Todavía no hay domingos anteriores.</p>`}
      <button class="btn marino" data-editar="">＋ Preparar otro domingo</button></aside></div>`;
}

function lineasDomingo(txt) {
  return txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [c, ...t] = l.split("/");
    return { linea: l, r: parseCita(c), titulo: t.join("/").trim() };
  });
}

function vistaEditor() {
  const ds = [...almacen.domingos()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const d = ds.find(x => x.id === domingoSel) || null;
  const texto = d ? d.citas.map(c => c.etiqueta + (c.titulo ? ` / ${c.titulo}` : "")).join("\n") : "";
  return `<button class="enlace" data-plan>‹ Volver al plan</button><h1>Domingos</h1>
    <div class="domingos-lista"><button class="btn ${d ? "" : "pri"}" data-domingo="">＋ Nuevo domingo</button>
      ${ds.map(x => `<button class="domingo-mini ${x.id === domingoSel ? "sel" : ""}" data-domingo="${esc(x.id)}"><b>${esc(x.titulo || "Sin título")}</b><br><small>${esc(fechaLarga(x.fecha))} · ${x.citas.length} citas</small></button>`).join("")}</div>
    <form id="f-domingo" class="card form">
      <label for="d-fecha">Fecha<input type="date" id="d-fecha" required value="${esc(d?.fecha || proximoDomingo(new Date()))}"></label>
      <label for="d-titulo">Título del sermón (opcional)<input id="d-titulo" maxlength="80" value="${esc(d?.titulo || "")}"></label>
      <label for="d-citas">Una cita por línea. Ejemplo: ef 2 8-9 / La salvación por gracia
        <textarea id="d-citas" spellcheck="false" autocorrect="off" autocapitalize="off" aria-describedby="d-prevista">${esc(texto)}</textarea></label>
      <ul id="d-prevista" class="prevista"></ul>
      <div class="acciones">${d ? `<button type="button" class="btn peli" id="d-borrar">Borrar</button>` : ""}<button type="submit" class="btn pri" id="d-guardar" aria-describedby="d-ayuda">Guardar domingo</button></div>
      <p id="d-ayuda" class="meta" hidden></p>
    </form>`;
}

function previstaDomingo() {
  const ls = lineasDomingo($("#d-citas").value);
  $("#d-prevista").innerHTML = ls.map(l => l.r.ok
    ? `<li class="ok">✓ ${esc(l.r.etiqueta)}${l.titulo ? ` · ${esc(l.titulo)}` : ""}</li>`
    : `<li class="mal">✗ “${esc(l.linea)}”: ${esc(l.r.error)}</li>`).join("");
  const hayMal = ls.some(l => !l.r.ok);
  $("#d-guardar").disabled = !ls.length || hayMal;
  const ay = $("#d-ayuda");
  ay.textContent = hayMal ? "Corrige las líneas marcadas con ✗" : "Escribe al menos una cita";
  ay.hidden = ls.length > 0 && !hayMal;
}

// ---------- Bosquejo ----------
// Borrador del formulario del bosquejo: mismo patrón que el del domingo (sessionStorage mientras la pestaña siga abierta).
const CLAVE_BORRADOR_BQ = "uc-borrador-bosquejo";
let baseBq = null;   // lo que mostraba el formulario al abrirlo (para saber si hay cambios sin guardar)
let guardandoBq = false;
const leerBorradorBq = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR_BQ)); } catch { return null; } };
const borrarBorradorBq = () => { try { sessionStorage.removeItem(CLAVE_BORRADOR_BQ); } catch { /* sin sessionStorage */ } };
const bosquejoActual = () => (bosquejoSel ? almacen.bosquejos().find(x => x.id === bosquejoSel) ?? null : null);

// Lo escrito en el formulario, todo como texto (la cita y los versículos todavía sin leer).
function crudoDeForm(form = $("#f-bosquejo")) {
  if (!form) return null;
  const v = sel => form.querySelector(sel)?.value ?? "";
  return { fecha: v("#b-fecha"), titulo: v("#b-titulo"), cita: v("#b-cita"), intro: v("#b-intro"),
    puntos: [...form.querySelectorAll("[data-punto]")].map(p => ({ frase: p.querySelector(".p-frase").value, versos: p.querySelector(".p-versos").value,
      explicacion: p.querySelector(".p-expl").value, ilustracion: p.querySelector(".p-ilus").value })),
    aplicacion: v("#b-aplicacion"), recuerda: v("#b-recuerda"), conclusion: v("#b-conclusion") };
}
// El bosquejo que dice el formulario, sin sanear (el almacén lo sanea al guardar). Las líneas con ✗ no entran.
function leerFormBosquejo(form) {
  const { b } = revisarCrudo(crudoDeForm(form));
  return { ...b, id: bosquejoSel ?? "", domingoId: bosquejoActual()?.domingoId ?? null };
}
// Pone al día los ✓/✗ de la cita y de los versículos; con algún ✗ no se puede guardar.
function revisarFormBq() {
  const form = $("#f-bosquejo");
  if (!form) return null;
  const r = revisarCrudo(crudoDeForm(form));
  const poner = (ul, html) => { if (ul && ul.innerHTML !== html) ul.innerHTML = html; };
  poner($("#b-cita-prevista"), r.cita.html);
  r.puntos.forEach((p, i) => poner($(`#p${i}-prevista`), p.html));
  $("#b-guardar").disabled = r.malo; $("#b-ayuda").hidden = !r.malo;
  return r;
}
// Vuelve a dibujar el formulario con lo escrito (al agregar o quitar un punto, o al recuperar un borrador), sin tocar la base de cambios.
function repintarFormBq(crudo) {
  const y = $("#vista").scrollTop;
  $("#vista").innerHTML = vistaFormBosquejo(bosquejoActual(), { maxPuntos: MAX_PUNTOS, crudo });
  $("#vista").scrollTop = y; revisarFormBq();
}
const mismoCrudo = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function hayCambiosBq() {
  const v = crudoDeForm();
  return !!(v && baseBq && !mismoCrudo(v, baseBq));
}
function guardarBorradorBq() {
  if (!hayCambiosBq()) return borrarBorradorBq();
  try { sessionStorage.setItem(CLAVE_BORRADOR_BQ, JSON.stringify({ sel: bosquejoSel, crudo: crudoDeForm() })); } catch { /* sin sessionStorage */ }
}
// Antes de salir del formulario (otra sección, "Volver"): si hay cambios, pide confirmar.
async function puedeSalirBosquejo() {
  if (vista !== "bosquejo" || !editandoB || !hayCambiosBq()) return true;
  if (!await confirmar("Tienes cambios sin guardar. ¿Salir sin guardar?", "Salir sin guardar", "Seguir editando")) return false;
  borrarBorradorBq();
  return true;
}
// Al abrir el formulario: si quedó un borrador de este mismo bosquejo, ofrece recuperarlo.
async function ofrecerBorradorBq() {
  const b = leerBorradorBq(), v = crudoDeForm();
  if (!b || !v || !b.crudo || b.sel !== bosquejoSel) return;
  if (mismoCrudo(b.crudo, v)) return borrarBorradorBq();
  if (await confirmar("Tienes un borrador sin guardar de este bosquejo. ¿Quieres recuperarlo?", "Recuperar", "Descartar")) {
    if (!$("#f-bosquejo")) return;
    repintarFormBq(b.crudo); aviso("Borrador recuperado");
  } else borrarBorradorBq();
}

function vistaBosquejo() {
  if (!editandoB) return `${saludo()}${vistaListaBosquejos(almacen.bosquejos())}`;
  const b = bosquejoActual();
  if (!b) bosquejoSel = null; // el bosquejo ya no existe (p. ej. se restauró una copia): se trata como uno nuevo
  return vistaFormBosquejo(b, { maxPuntos: MAX_PUNTOS });
}

// Guarda el bosquejo y deja el domingo de esa fecha con su título y sus citas (si ya tenía otras, antes pregunta).
async function guardarBosquejoForm(form) {
  if (guardandoBq) return;
  const r = revisarFormBq();
  if (!r || r.malo) return;
  guardandoBq = true;
  try {
    const id = almacen.guardarBosquejo(leerFormBosquejo(form));
    if (!id) return aviso("Ese bosquejo no se puede guardar: revisa la fecha y los puntos.", 6000);
    bosquejoSel = id;
    // Sin espacio: el formulario queda abierto con lo escrito (y el borrador) para reintentar; no se dice "guardado".
    if (!almacen.persistido()) return aviso(`${SIN_ESPACIO}. Lo que escribiste sigue aquí.`, 8000);
    const b = bosquejoActual();
    const { domingo, conflicto } = domingoParaBosquejo(almacen.domingos(), b);
    let citas = citasDe(b);
    if (conflicto && !await confirmar("Las citas de ese domingo son distintas a las del bosquejo. ¿Reemplazarlas?", "Sí, reemplazar", "Dejar las del domingo")) citas = domingo.citas;
    const domingoId = almacen.guardarDomingo({ id: domingo?.id, fecha: b.fecha, titulo: b.titulo || domingo?.titulo || "", citas });
    if (!domingoId) aviso("El bosquejo se guardó, pero no se pudo actualizar el domingo.", 7000);
    else almacen.guardarBosquejo({ ...b, domingoId });
    if (!almacen.persistido()) return aviso(`${SIN_ESPACIO}. Lo que escribiste sigue aquí.`, 8000);
    borrarBorradorBq(); editandoB = false; pintar(); $("#vista").scrollTop = 0;
    if (domingoId) avisoGuardado("Bosquejo guardado");
  } finally { guardandoBq = false; }
}

// ---------- Biblia y búsqueda ----------
function vistaBiblia() {
  const h = almacen.historial()[0];
  const ultimo = h && refDeCodigo(h.cita.codigo);
  const libro = libroSel && LIBROS.find(l => l[0] === libroSel);
  const libros = testamento === "at" ? LIBROS.slice(0, 39) : LIBROS.slice(39);
  return `${saludo()}<h1>Biblia</h1>
    <form id="f-buscar" autocomplete="off">${ic("bus", "style='color:var(--sub)'")}
      <input id="q" type="search" enterkeyhint="search" value="${esc(busqueda?.consulta || "")}" placeholder="Una cita (jn 3 16) o unas palabras del versículo" aria-label="Cita o texto">
      <button type="submit" class="btn pri" id="b-abrir" disabled>Abrir</button></form>
    <div id="pista" class="pista"></div>
    <div id="resultados">${busqueda ? htmlResultados() : ""}</div>
    ${busqueda ? "" : `${ultimo ? `<div class="acciones"><button class="btn peq" data-capitulo="${enc({ codigo: ultimo.codigo, cap: ultimo.cap })}">${ic("bib")}Seguir leyendo: <span class="ref" style="font-size:18px">${esc(etiquetaRef({ ...ultimo, v1: null, v2: null }))}</span></button></div>` : ""}
    <div class="pestanas" style="margin-top:16px"><button class="${testamento === "at" ? "on" : ""}" data-testamento="at">Antiguo Testamento</button><button class="${testamento === "nt" ? "on" : ""}" data-testamento="nt">Nuevo Testamento</button></div>
    ${libro ? `<div class="cab-dom" style="margin-bottom:10px"><h2 style="margin:0">${esc(libro[1])}</h2><button class="enlace" data-libro="">Todos los libros</button></div>
        <div class="caps">${Array.from({ length: libro[2] }, (_, i) => `<button data-capitulo="${enc({ codigo: libro[0], cap: i + 1 })}">${i + 1}</button>`).join("")}</div>`
      : `<div class="libros">${libros.map(l => `<button data-libro="${l[0]}">${esc(l[1])}</button>`).join("")}</div>`}`}`;
}

function pista() {
  const q = $("#q").value, p = $("#pista"), b = $("#b-abrir");
  b.disabled = !q.trim();
  if (!q.trim()) { p.innerHTML = ""; b.textContent = "Abrir"; return; }
  const r = parseCita(q);
  b.textContent = r.ok ? "Abrir" : "Buscar";
  p.innerHTML = r.ok
    ? `Se abrirá <b>${esc(r.etiqueta)}</b>${r.corregido ? " (ordené el rango)" : ""} <button type="button" class="estrella" data-fav="${enc(citaDe(r))}" aria-label="Guardar en favoritos">${ic("est")}</button>`
    : `Pulsa Buscar para buscar esas palabras en tus Biblias${r.sugerencias.length ? " · ¿Quisiste decir?" : ""}
      ${r.sugerencias.map(s => `<button type="button" class="sugerencia" data-sugerir="${esc(s + (r.numeros ? " " + r.numeros : ""))}">${esc(s)}</button>`).join("")}`;
}

// El índice de búsqueda se arma por partes (sin congelar la pantalla) y una sola vez. Si falla, se descarta
// para que la próxima búsqueda lo intente de nuevo. Se empieza a armar al abrir la vista Biblia.
function prepararIndice() {
  if (!indice) {
    const p = armarIndiceDesde(biblias).catch(e => { if (indice === p) indice = null; throw e; });
    indice = p;
  }
  return indice;
}

async function buscarTexto(consulta, sigla = null) {
  const mia = busqueda = { consulta, sigla, resultados: null, versiones: busqueda?.versiones ?? [] };
  pintar();
  const mostrar = () => { if (vista === "biblia" && busqueda === mia && $("#resultados")) $("#resultados").innerHTML = htmlResultados(); };
  try {
    mia.versiones = (await biblias.versiones()).map(m => m.sigla);
    if (!indice && $("#resultados")) $("#resultados").innerHTML = `<p class="meta">Preparando la búsqueda… (solo la primera vez)</p>`;
    const idx = await prepararIndice();
    if (busqueda !== mia) return;
    mia.resultados = buscar(idx, consulta, { sigla, max: 20 });
    mostrar();
  } catch (e) {
    console.error("Búsqueda:", e);
    if (busqueda === mia) { mia.error = true; mostrar(); }
    aviso("No se pudo preparar la búsqueda, intenta de nuevo");
  }
}

// Resalta las palabras completas de la consulta sobre el texto ya escapado (nunca dentro de una palabra).
function resaltar(texto, consulta) {
  const q = new Set(palabrasResaltar(consulta).flatMap(fichas));
  return texto.split(/([\p{L}\p{N}]+)/u).map((p, i) => i % 2 && q.has(fichas(p)[0]) ? `<mark>${esc(p)}</mark>` : esc(p)).join("");
}
const recortar = t => t.length > 170 ? t.slice(0, t.lastIndexOf(" ", 165)) + "…" : t;

function htmlResultados() {
  const { consulta, sigla, resultados, versiones } = busqueda;
  const filtro = `<div class="modo">No es una cita, así que busqué ese texto en tus Biblias ·
    <button class="${sigla ? "" : "on"}" data-filtro="">Todas las versiones</button>
    ${versiones.length > 1 ? versiones.map(s => `<button class="${sigla === s ? "on" : ""}" data-filtro="${esc(s)}">Solo ${esc(s)}</button>`).join("") : ""}
    <button data-limpiar>✕ Limpiar</button></div>`;
  if (busqueda.error) return filtro + `<p class="vacio">No se pudo preparar la búsqueda, intenta de nuevo</p>`;
  if (!resultados) return filtro + `<p class="meta">Buscando…</p>`;
  if (!versiones.length) return filtro + `<p class="vacio">Primero carga una Biblia en Configuración.</p>`;
  if (!resultados.length) return filtro + `<p class="vacio">No encontré versículos con esas palabras. Prueba con menos palabras o con otras más particulares.</p>`;
  return filtro + `<div class="resultados">${resultados.map((r, i) => {
    const ref = { codigo: LIBROS[r.libro - 1][0], cap: r.cap, v1: r.v, v2: null };
    const cita = { codigo: codigoRef(ref), etiqueta: etiquetaRef(ref) };
    return `<button class="res" data-cita="${enc(cita)}" data-sigla="${esc(r.sigla)}"><span class="ref">${esc(cita.etiqueta)}</span>
      <span><span class="t">${resaltar(recortar(r.texto), consulta)}</span><small>${esc(r.sigla)}${i === 0 ? " · MEJOR COINCIDENCIA" : ""}</small></span></button>`;
  }).join("")}</div>`;
}

// ---------- Guardados ----------
function vistaGuardados() {
  const tabs = `<h1>Guardados</h1><div class="pestanas"><button class="${pestana === "historial" ? "on" : ""}" data-pestana="historial">Historial</button><button class="${pestana === "favoritos" ? "on" : ""}" data-pestana="favoritos">Favoritos</button></div>`;
  const fila = (cita, extra, accion) => `<div class="fila"><button class="abrir" data-cita="${enc(cita)}"><span class="abr">${esc(abreviatura(cita.codigo.slice(0, 3)))}</span>
    <span><span class="ref-txt">${esc(cita.etiqueta)}</span>${extra ? ` <small>· ${esc(extra)}</small>` : ""}</span></button>${accion}</div>`;
  if (pestana === "historial") {
    const h = almacen.historial();
    return tabs + (h.length ? `<div class="card">${h.map(x => fila(x.cita, hace(x.cuando),
      `<button class="estrella" data-fav="${enc(x.cita)}" aria-label="Guardar en favoritos">${ic("est")}</button>`)).join("")}</div>`
      : `<p class="vacio">Aquí aparecerán los pasajes que abras.</p>`);
  }
  const porSerie = new Map();
  for (const f of almacen.favoritos()) porSerie.set(f.serie, [...(porSerie.get(f.serie) || []), f]);
  if (!porSerie.size) return tabs + `<p class="vacio">Toca la estrella en cualquier pasaje para guardarlo en una serie.</p>`;
  return tabs + almacen.series().map(s => `<div class="serie">${esc(s)}</div><div class="card">${porSerie.get(s)
    .sort((x, y) => ordenBiblico(x.cita.codigo) - ordenBiblico(y.cita.codigo))
    .map(f => fila(f.cita, "", `<button class="estrella" data-quitar="${esc(f.id)}" aria-label="Quitar de favoritos">${ic("x")}</button>`)).join("")}</div>`).join("");
}

function pedirSerie(cita) {
  favPendiente = cita;
  $("#fav-etiqueta").textContent = cita.etiqueta;
  $("#fav-nueva").value = "";
  $("#fav-series").innerHTML = almacen.series().map(s => `<button type="button" class="chip" data-serie="${esc(s)}">${esc(s)}</button>`).join("");
  $("#dlg-fav").showModal();
}

// ---------- Configuración ----------
function aplicarTema() {
  const c = almacen.config(), oscuro = c.tema === "oscuro";
  document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
  document.documentElement.dataset.letra = c.letra;
  $('meta[name="theme-color"]')?.setAttribute("content", oscuro ? "#000000" : "#07122b");
}

function vistaConfig() {
  const c = almacen.config();
  const seg = (attr, ops, val) => `<span class="seg">${ops.map(([v, t, st]) => `<button class="${v === val ? "on" : ""}" data-${attr}="${v}" ${st ? `style="${st}"` : ""}>${t}</button>`).join("")}</span>`;
  const estado = !c.pantalla ? "" : sinRespuesta() ? `<span class="pill mal">● Sin respuesta</span>` : proy.respuesta ? `<span class="pill ok">● Responde</span>` : "";
  // Dos columnas que se llenan por separado: Apariencia (la más alta) a la izquierda y las otras tres a la derecha,
  // así ninguna tarjeta deja un hueco debajo de otra.
  return `<h1>Configuración</h1><div class="cfg"><div class="cfg-col">
    <section class="card"><h2>Apariencia</h2>
      <form id="f-pastor" class="lin saludo-f"><label for="c-pastor">Saludo<small>La app dice «Buenos días, …» con lo que escribas aquí</small></label>
        <span class="saludo-campo"><input id="c-pastor" class="campo" maxlength="40" value="${esc(c.pastor)}" placeholder="Por ejemplo: pastor Juan Pérez" autocomplete="off" autocapitalize="sentences" spellcheck="false">
        <button class="btn pri peq">Guardar</button></span></form>
      <div class="lin">Tema ${seg("tema", [["claro", "Claro"], ["oscuro", "Oscuro"]], c.tema)}</div>
      <div class="lin">Tamaño de letra ${seg("letra", [["normal", "A", "font-size:14px"], ["grande", "A", "font-size:18px"], ["muy-grande", "A", "font-size:22px"]], c.letra)}</div>
      <div class="lin">Orientación de la pantalla ${seg("orientacion", [["horizontal", "Horizontal"], ["vertical", "Vertical"]], c.orientacion)}</div>
      <div class="lin"><p class="texto-biblia" id="c-previa" style="margin:0;font-size:calc(var(--base) * 1.1)"><span class="ref">Juan 3:16</span></p></div></section></div>
    <div class="cfg-col"><section class="card"><h2>Pantalla de proyección</h2>
      ${c.pantalla ? `<div class="lin">Conectada a <b>${esc(c.pantalla)}</b> ${estado}</div>
        <div class="lin meta">Lo que proyectas aparece en la pantalla de la iglesia.</div>
        <div class="acciones"><button type="button" class="btn peq peli" id="c-desconectar">Desconectar la pantalla</button></div>`
      : `<form id="f-pantalla" class="lin" style="display:grid;gap:10px;border:0"><label class="meta" for="c-pantalla">Código que muestra la pantalla de la iglesia (tecla F2)</label>
        <input id="c-pantalla" class="campo" placeholder="UC-XXXX-XXXX" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="20">
        <div><button class="btn pri peq">Conectar</button></div></form>`}</section>
    <section class="card" id="c-versiones"><h2>Versiones de la Biblia</h2><p class="meta">Cargando…</p></section>
    <section class="card"><h2>Copia de respaldo</h2>
      <div class="lin">Última copia <b>${c.ultimoRespaldo ? esc(hace(c.ultimoRespaldo)) : "nunca"}</b></div>
      <div class="lin meta">Domingos, favoritos e historial. Guárdala fuera de la tablet (WhatsApp, Drive o correo).</div>
      <div class="acciones"><button type="button" class="btn pri peq" id="c-compartir">Compartir copia</button>
        <button type="button" class="btn peq" id="c-exportar">Descargar</button>
        <label class="btn peq">Restaurar…<input type="file" id="c-importar" accept="application/json,.json,text/plain,.txt" hidden></label></div></section></div>
  </div>`;
}

async function pintarVersiones() {
  const s = $("#c-versiones");
  const [ms, principal] = await Promise.all([biblias.versiones(), biblias.principal()]);
  if (!s?.isConnected) return;
  const n = x => x.toLocaleString("es");
  s.innerHTML = `<h2>Versiones de la Biblia</h2>
    ${ms.length ? ms.map(m => `<div class="lin version"><span><b>${esc(m.sigla)}</b> · ${esc(m.nombre)}
      <small>${n(m.resumen.libros)} libros, ${n(m.resumen.versiculos)} versículos${m.resumen.agrupados ? ` (${n(m.resumen.agrupados)} agrupados)` : ""}</small></span>
      <span class="acciones" style="margin:0">${m.sigla === principal ? `<span class="pill">Principal</span>` : `<button class="btn peq" data-principal="${esc(m.sigla)}">Hacer principal</button>`}
      <button class="btn peq peli" data-quitar-version="${esc(m.sigla)}">Quitar</button></span></div>`).join("")
      : `<p class="meta">No hay ninguna Biblia cargada. Carga un archivo XML (formato Zefania o «bible»).</p>`}
    <div class="acciones"><label class="btn peq">Cargar archivo<input type="file" id="c-biblia" accept=".xml,.XML,text/xml,application/xml" hidden></label></div>`;
  const cap = principal && await biblias.capitulo(principal, "JHN", 3);
  const p = $("#c-previa");
  if (cap?.[16] && p?.isConnected) p.innerHTML = `<b class="num">16</b>${esc(cap[16])} <span class="ref" style="color:var(--oro-t)">Juan 3:16</span>`;
}

const nombreCopia = ext => `united-church-respaldo-${hoyISO()}.${ext}`;
function descargarCopia(texto, msg) {
  try {
    const blob = new Blob([texto], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nombreCopia("json") });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    console.error("Descarga de la copia:", e);
    return aviso("No se pudo preparar la descarga de la copia. Intenta con «Compartir copia».", 8000);
  }
  almacen.marcarRespaldo(); pintar(); aviso(msg, 8000);
}

// Orientación fija según Configuración (la app no gira sola). Si el navegador no deja, avisa una sola vez.
let avisoOrientacion = false;
// Al abrir la app se fija en silencio; solo si el pastor la elige en Configuración y no se puede, se avisa.
async function fijarOrientacion({ callado = false } = {}) {
  const modo = almacen.config().orientacion === "vertical" ? "portrait" : "landscape";
  try { await screen.orientation.lock(modo); }
  catch {
    if (callado || avisoOrientacion) return;
    avisoOrientacion = true; aviso("Tu tablet no permite fijar la orientación desde la app", 6000);
  }
}

function desconectar() {
  almacen.guardarConfig({ pantalla: null }); soltarPantalla(); proy.respuesta = null;
  conectarPantalla(); pintar();
  return almacen.persistido();
}

// Pinta el lector; si el pasaje no se puede abrir, avisa en vez de dejar la pantalla a medias.
const repintarLector = () => pintarLector(lectura).then(sincronizarProyeccion)
  .catch(e => { console.error("Lector:", e); aviso("No se pudo abrir el pasaje"); });

// ---------- Navegación ----------
function pintar() {
  aplicarTema();
  luzDelLector(vista === "lector"); // la tablet no se apaga mientras se lee
  document.body.classList.toggle("en-lector", vista === "lector");
  $("#vista").innerHTML = { domingo: vistaDomingo, biblia: vistaBiblia, bosquejo: vistaBosquejo, guardados: vistaGuardados, config: vistaConfig, lector: () => vistaLector(lectura) }[vista]();
  document.querySelectorAll(".nav [data-ir]").forEach(b => b.classList.toggle("activa", b.dataset.ir === vista));
  if (vista === "domingo" && editando) { previstaDomingo(); baseEd = valoresEditor(); }
  if (vista === "bosquejo" && editandoB) { revisarFormBq(); baseBq = crudoDeForm(); }
  if (vista === "biblia") pista();
  if (vista === "config") pintarVersiones();
  if (vista === "lector") repintarLector();
}

function ir(v, nueva = false) {
  if (v !== vista || nueva) history.pushState({ vista: v, lectura: v === "lector" ? lectura : null }, "", "#" + v);
  vista = v; pintar(); $("#vista").scrollTop = 0;
}
window.addEventListener("popstate", ev => {
  const v = VISTAS.includes(ev.state?.vista) ? ev.state.vista : vistaDeHash();
  if (v === "lector" && !ev.state?.lectura) vista = vistaInicial();
  else { vista = v; if (v === "lector") { lectura = ev.state.lectura; alVolver(lectura); } }
  pintar(); $("#vista").scrollTop = 0;
});

// ---------- Eventos ----------
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button,[data-ir]");
  if (!t) return;
  const d = t.dataset;
  if (d.ir) {
    if (!await puedeSalirEditor() || !await puedeSalirBosquejo()) return;
    if (d.ir === "domingo") { editando = false; verDomingo = null; }
    if (d.ir === "bosquejo") editandoB = false;
    ir(d.ir);
    // Al entrar a Biblia se escribe de una vez, salvo que ya haya resultados o un pasaje abierto en pantalla (no abrir el teclado).
    if (d.ir === "biblia" && !busqueda && !proy.activo) $("#q")?.focus();
    // Con la tablet quieta en la vista Biblia (nunca desde el lector) se empieza a armar la búsqueda.
    if (d.ir === "biblia" && !proy.activo) prepararIndice().catch(() => {});
    return;
  }
  if (t.hasAttribute("data-volver")) return history.back();
  // Inicio: de un salto a la pantalla principal (Domingo, o Biblia si no hay domingo), sin ir atrás varias veces.
  // Lo proyectado sigue en la pantalla de la iglesia; "Seguir sermón" vuelve a la cita.
  if (t.hasAttribute("data-inicio")) { editando = false; verDomingo = null; return ir(vistaInicial()); }
  if (t.hasAttribute("data-buscar")) { ir("biblia"); return $("#q")?.focus(); }
  if (t.hasAttribute("data-proyectar")) return proyectarActual();
  if (t.hasAttribute("data-reintentar")) return reintentar();
  if (d.parte) return cambiarParte(Number(d.parte));
  if (t.hasAttribute("data-quitar-pantalla")) return quitarDePantalla();
  if (t.id === "c-desconectar") {
    const queda = proy.activo ? " Lo que está proyectado se queda en la pantalla." : "";
    if (!await confirmar(`¿Desconectar la pantalla de la iglesia?${queda} Tendrás que escribir el código otra vez.`, "Sí, desconectar", "Cancelar")) return;
    desconectar(); return avisoGuardado("Pantalla desconectada");
  }
  // Desde el lector: letra y tema cambian al instante, sin volver a dibujar el pasaje (no se pierde la posición).
  if (d.letraPaso) {
    const i = LETRAS.indexOf(almacen.config().letra) + Number(d.letraPaso);
    if (!LETRAS[i]) return;
    almacen.guardarConfig({ letra: LETRAS[i] }); aplicarTema(); pintarHerramientas(); return avisoGuardado();
  }
  if (t.hasAttribute("data-tema-cambiar")) {
    almacen.guardarConfig({ tema: almacen.config().tema === "oscuro" ? "claro" : "oscuro" });
    aplicarTema(); pintarHerramientas(); return avisoGuardado();
  }
  if (d.verDomingo !== undefined) { verDomingo = d.verDomingo || null; pintar(); return ($("#vista").scrollTop = 0); }
  if (d.tema) { almacen.guardarConfig({ tema: d.tema }); pintar(); return avisoGuardado(); }
  if (d.letra) { almacen.guardarConfig({ letra: d.letra }); pintar(); return avisoGuardado(); }
  if (d.orientacion) { almacen.guardarConfig({ orientacion: d.orientacion }); pintar(); fijarOrientacion(); return avisoGuardado(); }
  if (d.capitulo) {
    const c = dec(d.capitulo);
    return abrirCapitulo(c.codigo, c.cap);
  }
  if (d.versiculo) { const r = dec(d.versiculo); return abrir({ codigo: codigoRef(r), etiqueta: etiquetaRef(r) }, { navegando: true }); }
  if (d.libro !== undefined) { libroSel = d.libro || null; pintar(); return ($("#vista").scrollTop = 0); }
  if (d.testamento) { testamento = d.testamento; libroSel = null; return pintar(); }
  if (d.pestana) { pestana = d.pestana; return pintar(); }
  if (d.filtro !== undefined) return buscarTexto(busqueda.consulta, d.filtro || null);
  if (t.hasAttribute("data-limpiar")) { busqueda = null; return pintar(); }
  if (t.hasAttribute("data-completo")) {
    lectura.completo = !lectura.completo; history.replaceState({ vista, lectura }, "", "#lector");
    return repintarLector();
  }
  if (d.version) {
    const cuerpo = $("#l-cuerpo"), y = cuerpo.scrollTop;
    lectura.sigla = d.version; history.replaceState({ vista, lectura }, "", "#lector");
    try { await pintarLector(lectura); cuerpo.scrollTop = y; await sincronizarProyeccion(); }
    catch (e) { console.error("Lector:", e); aviso("No se pudo abrir el pasaje"); }
    return;
  }
  if (d.principal) { await biblias.hacerPrincipal(d.principal); return pintarVersiones(); }
  if (d.quitarVersion) {
    if (!await confirmar(`¿Quitar la versión ${d.quitarVersion} de esta tablet?`, "Sí, quitar", "Cancelar")) return;
    await biblias.quitar(d.quitarVersion); indice = null; aviso("Versión quitada"); return pintarVersiones();
  }
  if (d.domPaso) {
    const dom = lectura?.domingo, dm = dom && almacen.domingos().find(x => x.id === dom.id), i = dom ? dom.i + Number(d.domPaso) : -1;
    if (dm?.citas[i]) abrir(dm.citas[i], { domingo: { id: dm.id, i } });
    return;
  }
  if (d.empezar) {
    const dm = almacen.domingos().find(x => x.id === d.empezar);
    if (!dm?.citas.length) return;
    const i = dm.citas[Number(d.desde)] ? Number(d.desde) : 0; // "Seguir sermón" retoma la cita en la que iba
    abrir(dm.citas[i], { domingo: { id: dm.id, i } });
    if (hayPantalla()) proyectarActual();
    return;
  }
  if (d.cita) return abrir(dec(d.cita), { domingo: d.domingoI ? dec(d.domingoI) : null, sigla: d.sigla || null });
  if (d.fav) return pedirSerie(dec(d.fav));
  if (d.quitar) { almacen.quitarFavorito(d.quitar); pintar(); return avisoGuardado(); }
  if (d.sugerir !== undefined) { $("#q").value = d.sugerir; pista(); return $("#q").focus(); }
  if (d.editar !== undefined) {
    editando = true; domingoSel = d.editar || null; pintar(); $("#vista").scrollTop = 0;
    return ofrecerBorrador();
  }
  if (d.bqAbrir !== undefined) {
    editandoB = true; bosquejoSel = d.bqAbrir || null; pintar(); $("#vista").scrollTop = 0;
    return ofrecerBorradorBq();
  }
  if (t.hasAttribute("data-bq-volver")) {
    if (!await puedeSalirBosquejo()) return;
    editandoB = false; pintar(); return ($("#vista").scrollTop = 0);
  }
  if (t.hasAttribute("data-bq-agregar")) {
    const c = crudoDeForm();
    if (!c || c.puntos.length >= MAX_PUNTOS) return;
    c.puntos.push({ frase: "", versos: "", explicacion: "", ilustracion: "" });
    repintarFormBq(c); guardarBorradorBq(); return $(`#p${c.puntos.length - 1}-frase`)?.focus();
  }
  if (d.bqQuitar !== undefined) {
    const i = Number(d.bqQuitar), p = crudoDeForm()?.puntos[i];
    if (!p || crudoDeForm().puntos.length < 2) return;
    if ((p.frase + p.versos + p.explicacion + p.ilustracion).trim()
      && !await confirmar(`¿Quitar el punto ${i + 1} con todo lo que escribiste en él?`, "Sí, quitar", "Cancelar")) return;
    const c = crudoDeForm();
    if (!c || c.puntos.length < 2) return;
    c.puntos.splice(i, 1);
    repintarFormBq(c); return guardarBorradorBq();
  }
  if (t.id === "b-borrar") {
    if (!await confirmar("¿Borrar este bosquejo? El domingo no se toca.", "Sí, borrar", "Cancelar")) return;
    almacen.borrarBosquejo(bosquejoSel); bosquejoSel = null; editandoB = false; borrarBorradorBq(); pintar(); $("#vista").scrollTop = 0;
    return avisoGuardado("Bosquejo borrado");
  }
  if (t.hasAttribute("data-plan")) {
    if (!await puedeSalirEditor()) return;
    editando = false; return pintar();
  }
  if (d.domingo !== undefined) {
    if (!await puedeSalirEditor()) return;
    domingoSel = d.domingo || null; pintar();
    return ofrecerBorrador();
  }
  if (d.serie) { document.querySelectorAll("#fav-series .chip").forEach(c => c.classList.toggle("sel", c === t)); $("#fav-nueva").value = d.serie; }
  if (t.id === "d-borrar" && await confirmar("¿Borrar este domingo?", "Sí, borrar", "Cancelar")) {
    almacen.borrarDomingo(domingoSel); domingoSel = null; borrarBorrador(); pintar();
    avisoGuardado("Domingo borrado");
  }
  if (t.id === "c-exportar") descargarCopia(almacen.exportar(), `Se inició la descarga de la copia (${nombreCopia("json")}). Búscala en la carpeta Descargas.`);
  if (t.id === "c-compartir") {
    const texto = almacen.exportar();
    const file = new File([texto], nombreCopia("txt"), { type: "text/plain" });
    let motivo = "Este dispositivo no permite compartir archivos";
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Copia de United Church", text: "Copia de respaldo de United Church (guárdala en Drive, WhatsApp o correo)." });
        almacen.marcarRespaldo(); pintar(); return aviso("Copia compartida");
      } catch (e) {
        if (e?.name === "AbortError") return;   // el pastor cerró el menú de compartir
        console.error("Compartir:", e);
        motivo = `No se pudo compartir la copia (${e?.message || e?.name || "motivo desconocido"})`;
      }
    }
    descargarCopia(texto, `${motivo}. Se inició la descarga de la copia.`);
  }
});

document.addEventListener("input", ev => {
  if (ev.target.id === "q") pista();
  if (ev.target.id === "d-citas") previstaDomingo();
  if (["d-fecha", "d-titulo", "d-citas"].includes(ev.target.id)) guardarBorradorEditor();
  if (ev.target.closest?.("#f-bosquejo")) { revisarFormBq(); guardarBorradorBq(); }
});

document.addEventListener("submit", ev => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === "f-buscar") {
    const q = $("#q").value.trim();
    if (!q) return;
    const r = parseCita(q);
    if (r.ok) { busqueda = null; return abrir(citaDe(r)); }
    return buscarTexto(q);
  }
  if (f.id === "f-domingo") {
    const ls = lineasDomingo($("#d-citas").value);
    if (!ls.length || ls.some(l => !l.r.ok)) return;
    const id = almacen.guardarDomingo({ id: domingoSel, fecha: $("#d-fecha").value, titulo: $("#d-titulo").value.trim(),
      citas: ls.map(l => ({ ...citaDe(l.r), ...(l.titulo ? { titulo: l.titulo } : {}) })) });
    if (!id) return aviso("Ese domingo no se puede guardar: revisa la fecha y las citas.", 6000);
    domingoSel = id;
    // Sin espacio: el editor queda abierto con lo escrito (y el borrador) para reintentar; no se dice "guardado".
    if (!almacen.persistido()) return aviso(`${SIN_ESPACIO}. Lo que escribiste sigue aquí.`, 8000);
    borrarBorrador(); editando = false; pintar(); aviso("Domingo guardado");
  }
  if (f.id === "f-bosquejo") return guardarBosquejoForm(f);
  if (f.id === "f-pastor") {
    almacen.guardarConfig({ pastor: $("#c-pastor").value }); pintar();
    return avisoGuardado(almacen.config().pastor ? "Saludo guardado" : "Saludo borrado");
  }
  if (f.id === "f-pantalla") {
    const codigo = normalizarCodigo($("#c-pantalla").value);
    if (!codigo) return aviso("Ese código no es válido. Cópialo de la pantalla (tecla F2), por ejemplo UC-7K4P-9QX2.", 6000);
    const ok = almacen.guardarConfig({ pantalla: codigo }); conectarPantalla(); pintar();
    return aviso(ok ? "Pantalla conectada" : "Pantalla conectada, pero no se pudo guardar en la tablet: falta espacio", ok ? 3500 : 7000);
  }
  if (f.id === "f-sigla") $("#dlg-sigla").close(ev.submitter?.value === "cancelar" ? "cancelar" : "ok");
  if (f.id === "f-fav") {
    const guardar = ev.submitter?.value !== "cancelar" && favPendiente;
    const ok = guardar ? almacen.agregarFavorito($("#fav-nueva").value, favPendiente) : false;
    $("#dlg-fav").close();
    if (guardar) { if (vista !== "lector") pintar(); aviso(ok ? "Guardado en favoritos" : almacen.persistido() ? "No se pudo guardar ese favorito" : SIN_ESPACIO, ok ? 3500 : 7000); }
  }
});

document.addEventListener("change", async ev => {
  if (ev.target.id === "c-biblia" && ev.target.files[0]) {
    const inp = ev.target, archivo = inp.files[0];
    inp.value = "";
    // La misma carga que la pantalla de la PC (src/importar.js): lee, pide sigla, confirma el reemplazo y guarda.
    try {
      await cargarBiblia(archivo, biblias, {
        avisar: aviso,
        invalidar: () => { indice = null; },
        pedirSigla,
        confirmar: sigla => confirmar(`Ya hay una versión ${sigla}. ¿Reemplazarla por este archivo?`, "Sí, reemplazar", "Cancelar"),
      });
    } catch (e) {
      console.error("Cargar Biblia:", e);
      aviso(e instanceof ErrorBiblia ? e.message : e?.cancelada ? "Carga cancelada"
        : "No se pudo guardar la Biblia (¿falta espacio en la tablet?). La versión anterior sigue igual.", e?.cancelada ? 3500 : 8000);
    }
    return pintarVersiones();
  }
  if (ev.target.id !== "c-importar" || !ev.target.files[0]) return;
  const inp = ev.target;
  // 1) Leer el archivo. 2) Restaurar los datos. 3) Pintar. Cada paso avisa qué falló.
  let texto;
  try { texto = await inp.files[0].text(); }
  catch (e) { console.error("Leer copia:", e); inp.value = ""; return aviso("No se pudo leer el archivo. Vuelve a elegirlo."); }
  if (await confirmar("Esto reemplaza todos los datos actuales por los de la copia. ¿Continuar?", "Sí, restaurar", "Cancelar")) {
    let n;
    try { n = almacen.importar(texto); }
    catch (e) {
      console.error("Restaurar copia:", e);
      inp.value = "";
      return aviso(e?.message === "Archivo no válido" ? "Ese archivo no es una copia válida de United Church" : "No se pudo restaurar la copia; tus datos siguen como estaban.", 7000);
    }
    borrarBorrador(); editando = false; borrarBorradorBq(); editandoB = false;
    try { pintar(); }
    catch (e) { console.error("Pintar tras restaurar:", e); inp.value = ""; return aviso("La copia se restauró, pero la pantalla no se pudo actualizar. Cierra y abre la app.", 8000); }
    const resto = n ? `${n} elementos dañados se omitieron. ` : "";
    aviso(almacen.persistido()
      ? `Copia restaurada. ${resto}Tu conexión con la pantalla no cambió.`
      : `Copia restaurada, pero no se pudo guardar en la tablet: falta espacio. ${resto}Tu conexión con la pantalla no cambió.`, 9000);
  }
  inp.value = "";
});

$("#dlg-fav").addEventListener("close", () => { favPendiente = null; });
$("#conf-si").addEventListener("click", () => $("#dlg-confirmar").close("si"));
$("#conf-no").addEventListener("click", () => $("#dlg-confirmar").close("no"));
$("#b-actualizar").addEventListener("click", () => location.reload());
// Al volver a la app, si sigue en el lector se pide de nuevo que la pantalla no se apague.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") luzAlVolver(); });
// Pide al navegador que no borre los datos de la tablet cuando falte espacio (sin esperar la respuesta).
try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch { /* no disponible */ }
{
  // Si al abrir se apartaron datos dañados, se avisa (queda una copia cruda en la tablet).
  const { descartados, ilegible, copia } = almacen.infoCarga();
  if (ilegible) aviso(`Los datos guardados no se pudieron leer y se apartaron${copia ? " (hay copia)" : ""}. Empiezas con la app vacía.`, 10000);
  else if (descartados) aviso(`${descartados} ${descartados === 1 ? "elemento dañado se apartó" : "elementos dañados se apartaron"}${copia ? " (hay copia)" : ""}`, 10000);
}
history.replaceState({ vista }, "", "#" + vista);
if ("serviceWorker" in navigator) {
  // Solo avisa si ya había una versión controlando la página (la primera instalación no es una actualización).
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habia) $("#actualizar").hidden = false; });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
conectarPantalla();
fijarOrientacion({ callado: true });
// Si la app se recargó con un pasaje en la pantalla de la iglesia, se vuelve al lector en ese pasaje:
// así el pastor tiene a mano "Quitar" y "Reintentar" (la barra dice "Sin confirmar" hasta que la PC responda).
const refProyectada = proy.activo ? refDeCodigo(proy.codigo) : null;
if (refProyectada) abrir({ codigo: proy.codigo, etiqueta: etiquetaRef(refProyectada) }, { completo: !!proy.completo, sigla: proy.sigla });
else pintar();
