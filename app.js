// Interfaz de United Church. El texto bíblico lo muestra el lector propio desde las Biblias cargadas en esta tablet.
import { parseCita, ordenBiblico } from "./src/citas.js";
import { crearAlmacen } from "./src/datos.js";
import { crearBiblias } from "./src/biblias.js";
import { decodificar, importarBiblia, ErrorBiblia } from "./src/importar.js";
import { armarPasaje, refDeCodigo, etiquetaRef, codigoRef, capituloVecino, ordenAlternativas } from "./src/pasaje.js";
import { LIBROS } from "./src/libros.js";
import { nuevaLectura, seguirProyeccion } from "./src/lectura.js";
import { crearCanal } from "./src/proyeccion/canal.js";
import { temaDe, normalizarCodigo, msgPasaje, msgParte, msgEspera } from "./src/proyeccion/mensajes.js";

const almacen = crearAlmacen();
const biblias = crearBiblias();
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = o => encodeURIComponent(JSON.stringify(o));
const dec = s => JSON.parse(decodeURIComponent(s));
const hoyISO = () => new Date().toLocaleDateString("en-CA");
const citaDe = r => ({ codigo: r.codigoRef, etiqueta: r.etiqueta });
const VISTAS = ["inicio", "domingo", "favoritos", "historial", "biblia", "config", "lector"];
const vistaDeHash = () => { const h = location.hash.slice(1); return VISTAS.includes(h) && h !== "lector" ? h : "inicio"; };
let vista = vistaDeHash(), domingoSel = null, favPendiente = null;
// Lo que muestra el lector: la cita, si se ve el capítulo completo y qué versión (null = la principal).
let lectura = null, libroSel = null;

const PAISAJE = `<svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
<linearGradient id="cielo" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff7e6"/><stop offset=".7" stop-color="#fde7c2"/><stop offset="1" stop-color="#f5f6fb"/></linearGradient>
<radialGradient id="sol" cx="82%" cy="35%" r="35%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".25" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="220" fill="url(#cielo)"/><rect width="1200" height="220" fill="url(#sol)"/>
<path d="M0 170 L180 120 L330 150 L520 95 L700 140 L860 105 L1020 135 L1200 100 L1200 220 L0 220Z" fill="#e9d3b2" opacity=".55"/>
<path d="M0 190 L220 150 L420 175 L640 135 L820 170 L1000 140 L1200 165 L1200 220 L0 220Z" fill="#d9bf98" opacity=".5"/>
<rect y="200" width="1200" height="20" fill="#f5f6fb"/></svg>`;

function saludo() { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; }
function hace(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "ahora"; if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? "ayer" : `hace ${d} días`;
}
function tono(t) { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
const serieDe = codigo => almacen.favoritos().find(f => f.cita.codigo === codigo)?.serie || "";
const fechaLarga = iso => new Date(iso + "T12:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

function aviso(msg, ms = 3500) { const a = $("#aviso"); a.textContent = msg; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), ms); }

// Pantalla de proyección: lo que el pastor tiene en la pantalla del templo. "seguir" reenvía los cambios
// del pasaje proyectado (capítulo, versión, capítulo completo); una cita nueva no sale hasta pulsar Proyectar.
const proy = { activo: false, seguir: false, enviado: null, codigo: null, partes: 1, parte: 0, esperando: null };
let canalProy = null, cerrarProy = null;

function conectarPantalla() {
  cerrarProy?.(); cerrarProy = canalProy = null;
  const codigo = almacen.config().pantalla;
  if (!codigo) return;
  canalProy = crearCanal(temaDe(codigo));
  cerrarProy = canalProy.escuchar(m => {
    if (m.de !== "pantalla" || m.tipo !== "estado" || m.codigo !== proy.codigo) return;
    Object.assign(proy, { partes: m.partes, parte: m.parte, esperando: null });
    pintarBarra();
  });
}

const claveLectura = sigla => `${lectura.cita.codigo}|${sigla}|${lectura.completo}`;

async function enviarPasaje(sigla) {
  const m = msgPasaje({ codigo: lectura.cita.codigo, sigla, completo: lectura.completo, parte: 0 });
  try { await canalProy.publicar(m); }
  catch { aviso("Sin conexión: no se pudo enviar a la pantalla", 6000); return; }
  Object.assign(proy, { activo: true, enviado: claveLectura(sigla), codigo: m.codigo, partes: 1, parte: 0, esperando: Date.now() });
  setTimeout(pintarBarra, 5200);
}

function pintarBarra() {
  const b = $("#l-barra");
  if (!b) return;
  b.hidden = !proy.activo;
  if (!proy.activo) return;
  const sinRespuesta = proy.esperando && Date.now() - proy.esperando > 5000;
  b.innerHTML = `<b>📺 En pantalla</b>
    <button class="btn-sec" data-parte="-1" ${proy.parte <= 0 ? "disabled" : ""}>◀ Parte</button>
    <span>${sinRespuesta ? "Pantalla sin respuesta" : `${proy.parte + 1}/${proy.partes}`}</span>
    <button class="btn-sec ${proy.parte < proy.partes - 1 ? "hay-mas" : ""}" data-parte="1" ${proy.parte >= proy.partes - 1 ? "disabled" : ""}>Parte ▶</button>
    <button class="btn-peligro" data-quitar-pantalla>Quitar de pantalla</button>`;
}

// `domingo` ({id, i}): la cita viene de la lista del domingo; si ya se está proyectando, sale sola en la pantalla.
// Franja para recorrer el plan del domingo sin volver a la lista (solo si el pasaje viene de allí).
function franjaDomingo() {
  const dom = lectura?.domingo;
  const d = dom && almacen.domingos().find(x => x.id === dom.id);
  if (!d || !d.citas[dom.i]) return "";
  const n = d.citas.length, ant = dom.i > 0, sig = dom.i < n - 1;
  return `<div class="franja-domingo">
    <button class="btn-sec" ${ant ? `data-dom-paso="-1"` : "disabled"}>◀ Anterior</button>
    <span><b>${dom.i + 1} de ${n}</b> · ${esc(d.citas[dom.i].etiqueta)}${sig ? ` <small>· sigue ${esc(d.citas[dom.i + 1].etiqueta)}</small>` : ""}</span>
    <button class="btn-sec ${sig ? "hay-mas" : ""}" ${sig ? `data-dom-paso="1"` : "disabled"}>Siguiente ▶</button></div>`;
}

function abrir(cita, completo = false, navegando = false, domingo = null) {
  const ref = refDeCodigo(cita.codigo);
  if (!ref) return aviso("No pude abrir esa cita");
  proy.seguir = seguirProyeccion(proy, { navegando, domingo });
  almacen.registrarHistorial({ codigo: cita.codigo, etiqueta: cita.etiqueta });
  const r = nuevaLectura(lectura, { codigo: cita.codigo, etiqueta: cita.etiqueta }, ref, { completo, navegando, domingo });
  lectura = r.lectura;
  if (!r.reemplazar) return ir("lector", true);
  history.replaceState({ vista: "lector", lectura }, "", "#lector");
  pintar(); $("#vista").scrollTop = 0;
}

function abrirCapitulo(codigo, cap) {
  const ref = { codigo, cap, v1: null, v2: null };
  abrir({ codigo: codigoRef(ref), etiqueta: etiquetaRef(ref) }, true, vista === "lector");
}

function itemCita(c, i, idDomingo) {
  return `<li><button class="cita-btn" data-cita="${enc(c)}" data-domingo-i="${enc({ id: idDomingo, i })}"><span class="n">${i + 1}</span><span><b>${esc(c.etiqueta)}</b>${c.titulo ? `<small>${esc(c.titulo)}</small>` : ""}</span><span class="chev">›</span></button></li>`;
}

function itemHistorial(h) {
  const s = serieDe(h.cita.codigo);
  return `<li><button class="fila" data-cita="${enc(h.cita)}"><span class="ic-serie" style="--h:${tono(s || h.cita.etiqueta)}">${esc([...(s || h.cita.etiqueta)][0])}</span>
    <span class="txt"><b>${esc(h.cita.etiqueta)}</b> <small>· ${hace(h.cuando)}</small>${s ? `<span class="tag">${esc(s)}</span>` : ""}</span><span class="chev">›</span></button>
    <button class="estrella" data-fav="${enc(h.cita)}" aria-label="Guardar en favoritos">☆</button></li>`;
}

function tarjetaDomingo(d) {
  if (!d) return `<h2>Pasajes del domingo</h2><h3>Aún no hay un domingo preparado</h3><p class="meta">Anota las citas del sermón y aquí aparecerán como botones.</p><button class="btn-primario" data-ir="domingo">Preparar el domingo</button>`;
  return `<h2>Pasajes del domingo</h2><h3>${esc(d.titulo || "Sin título")}</h3>
    <div class="meta">📅 ${esc(fechaLarga(d.fecha))} · ${d.citas.length} cita${d.citas.length === 1 ? "" : "s"}</div>
    <ol class="citas">${d.citas.map((c, i) => itemCita(c, i, d.id)).join("")}</ol>`;
}

function recordatorioRespaldo() {
  const r = almacen.config().ultimoRespaldo;
  const viejo = !r || !(Date.now() - Date.parse(r) <= 30 * 86400000);
  if (!viejo || !(almacen.domingos().length || almacen.favoritos().length)) return "";
  return `<p class="recordatorio">Haz una copia de respaldo <button class="link" data-ir="config">Ir a Configuración</button></p>`;
}

function vistaInicio() {
  const h = almacen.historial().slice(0, 5);
  return `<header class="hero">${PAISAJE}<div><h1>${saludo()}, ${esc(almacen.config().nombre)}</h1><p>Que la Palabra de Dios te guíe hoy.</p></div>
      <div class="fecha-hoy">☀ ${esc(new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }))}</div></header>
    <section class="buscador"><form id="f-buscar" autocomplete="off"><span class="lupa" aria-hidden="true">⌕</span>
      <input id="q" type="search" enterkeyhint="go" placeholder="Ej.: jn 3 16 · 1 co 13 del 4 al 7" aria-label="Cita bíblica">
      <button type="submit" class="btn-primario" id="b-abrir" disabled>Abrir pasaje →</button></form>
      <div id="pista" class="pista"></div></section>
    ${recordatorioRespaldo()}
    <div class="grid-inicio"><section class="card domingo">${tarjetaDomingo(almacen.domingoActual(hoyISO()))}</section>
      <section class="card"><div class="card-cab"><h2>🕘 Lecturas recientes</h2><button class="link" data-ir="historial">Ver todo</button></div>
      ${h.length ? `<ul class="lista">${h.map(itemHistorial).join("")}</ul>` : `<p class="vacio">Aquí aparecerán los pasajes que abras.</p>`}</section></div>`;
}

function lineasDomingo(txt) {
  return txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [c, ...t] = l.split("/");
    return { linea: l, r: parseCita(c), titulo: t.join("/").trim() };
  });
}

function vistaDomingo() {
  const ds = almacen.domingos();
  const d = ds.find(x => x.id === domingoSel) || null;
  const texto = d ? d.citas.map(c => c.etiqueta + (c.titulo ? ` / ${c.titulo}` : "")).join("\n") : "";
  return `<h1 class="titulo-vista">Pasajes del domingo</h1>
    <div class="domingos-lista"><button class="domingo-mini ${d ? "" : "sel"}" data-domingo="">＋ Nuevo domingo</button>
      ${ds.map(x => `<button class="domingo-mini ${x.id === domingoSel ? "sel" : ""}" data-domingo="${esc(x.id)}"><b>${esc(x.titulo || "Sin título")}</b><br><small>${esc(fechaLarga(x.fecha))} · ${x.citas.length} citas</small></button>`).join("")}</div>
    <form id="f-domingo" class="card form">
      <label>Fecha<input type="date" id="d-fecha" required value="${esc(d?.fecha || hoyISO())}"></label>
      <label>Título del sermón (opcional)<input id="d-titulo" maxlength="80" value="${esc(d?.titulo || "")}" placeholder="La gracia que transforma"></label>
      <label>Citas: una por línea. Si quieres, agrega un título después de “/”.
        <textarea id="d-citas" placeholder="ef 2 8-9 / La salvación por gracia&#10;tito 2 11-12&#10;1 co 13 del 4 al 7">${esc(texto)}</textarea></label>
      <ul id="d-prevista" class="prevista lista"></ul>
      <div class="acciones">${d ? `<button type="button" class="btn-peligro" id="d-borrar">Borrar</button>` : ""}<button type="submit" class="btn-primario" id="d-guardar">Guardar domingo</button></div>
    </form>`;
}

function vistaFavoritos() {
  const fs = almacen.favoritos();
  if (!fs.length) return `<h1 class="titulo-vista">Favoritos y series</h1><p class="vacio">Toca ☆ en cualquier pasaje para guardarlo en una serie.</p>`;
  return `<h1 class="titulo-vista">Favoritos y series</h1>` + almacen.series().map(s => `<section class="card serie-bloque">
      <div class="card-cab"><h2><span class="tag">${esc(s)}</span></h2></div><ul class="lista">
      ${fs.filter(f => f.serie === s).sort((x, y) => ordenBiblico(x.cita.codigo) - ordenBiblico(y.cita.codigo)).map(f => `<li><button class="fila" data-cita="${enc(f.cita)}"><span class="ic-serie" style="--h:${tono(s)}">${esc([...s][0])}</span><b>${esc(f.cita.etiqueta)}</b><span class="chev">›</span></button>
        <button class="estrella" data-quitar="${esc(f.id)}" aria-label="Quitar de favoritos">✕</button></li>`).join("")}</ul></section>`).join("");
}

function vistaHistorial() {
  const h = almacen.historial();
  return `<h1 class="titulo-vista">Historial</h1><section class="card">${h.length ? `<ul class="lista">${h.map(itemHistorial).join("")}</ul>` : `<p class="vacio">Todavía no abriste ningún pasaje.</p>`}</section>`;
}


// Tema claro u oscuro: se elige en Configuración o con el botón ☾/☀ del lector, sin salir del pasaje.
const botonTema = () => almacen.config().tema === "oscuro" ? "☀ Claro" : "☾ Oscuro";
function aplicarTema() {
  const oscuro = almacen.config().tema === "oscuro";
  document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", oscuro ? "#000000" : "#0b1a4a");
}

function vistaLector() {
  return `<div class="lector"><div class="lector-cab"><button class="btn-sec" data-volver>‹ Volver</button>
    <h1>${esc(lectura.completo && lectura.ref.v1 ? etiquetaRef({ ...lectura.ref, v1: null, v2: null }) : lectura.cita.etiqueta)}</h1>
    <button class="btn-tema" data-alternar-tema>${botonTema()}</button><span id="l-proy"></span><span class="sigla" id="l-sigla"></span></div><div id="l-cuerpo" class="lector-cuerpo"><p class="meta">Abriendo…</p></div></div>`;
}

async function pintarLector() {
  const cuerpo = $("#l-cuerpo");
  const ms = await biblias.versiones();
  if (!cuerpo.isConnected) return;
  if (!ms.length) {
    cuerpo.innerHTML = `<div class="card"><h2>Todavía no hay una Biblia cargada</h2><p class="meta">Carga una Biblia en Configuración → Versiones de la Biblia.</p>
      <button class="btn-primario" data-ir="config">Ir a Configuración</button></div>`;
    return;
  }
  const principal = await biblias.principal();
  const actual = ms.some(m => m.sigla === lectura.sigla) ? lectura.sigla : principal;
  const { codigo, cap, v1, v2 } = lectura.ref;
  const alts = ordenAlternativas(ms, actual);
  const caps = await Promise.all([actual, ...alts.map(m => m.sigla)].map(s => biblias.capitulo(s, codigo, cap)));
  const r = armarPasaje({ principal: { sigla: actual, cap: caps[0] }, alternativas: alts.map((m, i) => ({ sigla: m.sigla, cap: caps[i + 1] })),
    desde: lectura.completo ? null : v1, hasta: lectura.completo ? null : (v2 ?? v1) });
  if (!cuerpo.isConnected) return;
  $("#l-sigla").textContent = actual;
  if (proy.activo && proy.seguir && canalProy && claveLectura(actual) !== proy.enviado) enviarPasaje(actual).then(() => pintarLector());
  const enPantalla = proy.activo && proy.enviado === claveLectura(actual);
  $("#l-proy").innerHTML = almacen.config().pantalla ? `<button class="btn-tema btn-proyectar ${enPantalla ? "sel" : ""}" data-proyectar>${enPantalla ? "📺 En pantalla" : "📺 Proyectar"}</button>` : "";
  const antes = capituloVecino(codigo, cap, -1), despues = capituloVecino(codigo, cap, 1);
  const textoHTML = r.bloques.map(b => `<span class="vers${b.sigla ? " relleno" : ""}"><b class="num">${esc(b.etiqueta)}</b>${esc(b.texto)}${b.sigla ? ` <small class="de">${esc(b.sigla)}</small>` : ""}</span>`).join(" ");
  const avisoRelleno = r.rellenoDe.length ? `<p class="aviso-relleno">Este pasaje no está en tu archivo ${esc(actual)}; se muestra en ${esc(r.rellenoDe.join(" y "))}</p>` : "";
  const sinTexto = r.vacio ? `<p class="meta">Este capítulo no está en las Biblias cargadas.</p>` : r.sinTexto.length ?`<p class="meta">${r.bloques.length ? `Versículo${r.sinTexto.length > 1 ? "s" : ""} ${esc(r.sinTexto.join(", "))}: ` : ""}Este versículo no está en las Biblias cargadas.</p>` : "";
  cuerpo.innerHTML = `<div id="l-barra" class="barra-proyeccion" hidden></div>${avisoRelleno}<p class="texto-biblia" lang="es">${textoHTML}</p>${sinTexto}
    ${franjaDomingo()}
    <div class="lector-pie">
      <button class="btn-sec" ${antes ? `data-capitulo="${enc(antes)}"` : "disabled"}>◀ Capítulo anterior</button>
      ${v1 ? `<button class="btn-sec" data-completo>${lectura.completo ? "Ver solo el pasaje" : "Ver capítulo completo"}</button>` : ""}
      <span class="versiones">${ms.map(m => `<button class="chip ${m.sigla === actual ? "sel" : ""}" data-version="${esc(m.sigla)}">${esc(m.sigla)}</button>`).join("")}</span>
      <button class="estrella" data-fav="${enc(lectura.cita)}" aria-label="Guardar en favoritos">☆</button>
      <button class="btn-sec" ${despues ? `data-capitulo="${enc(despues)}"` : "disabled"}>Capítulo siguiente ▶</button>
    </div>`;
  pintarBarra();
}

function vistaBiblia() {
  const h = almacen.historial()[0];
  const ultimo = h && refDeCodigo(h.cita.codigo);
  const libro = libroSel && LIBROS.find(l => l[0] === libroSel);
  return `<h1 class="titulo-vista">Abrir Biblia</h1>
    ${ultimo ? `<button class="btn-primario seguir" data-capitulo="${enc({ codigo: ultimo.codigo, cap: ultimo.cap })}">Seguir leyendo: ${esc(etiquetaRef({ ...ultimo, v1: null, v2: null }))}</button>` : ""}
    ${libro ? `<section class="card"><div class="card-cab"><h2>${esc(libro[1])}</h2><button class="link" data-libro="">Todos los libros</button></div>
        <div class="grilla-caps">${Array.from({ length: libro[2] }, (_, i) => `<button class="chip" data-capitulo="${enc({ codigo: libro[0], cap: i + 1 })}">${i + 1}</button>`).join("")}</div></section>`
      : `<section class="card"><h2>Antiguo Testamento</h2><div class="grilla-libros">${LIBROS.slice(0, 39).map(l => `<button class="chip" data-libro="${l[0]}">${esc(l[1])}</button>`).join("")}</div></section>
        <section class="card"><h2>Nuevo Testamento</h2><div class="grilla-libros">${LIBROS.slice(39).map(l => `<button class="chip" data-libro="${l[0]}">${esc(l[1])}</button>`).join("")}</div></section>`}`;
}

async function pintarVersiones() {
  const s = $("#c-versiones");
  const [ms, principal] = await Promise.all([biblias.versiones(), biblias.principal()]);
  if (!s?.isConnected) return;
  const n = x => x.toLocaleString("es");
  s.innerHTML = `<h2>Versiones de la Biblia</h2>
    ${ms.length ? `<ul class="lista">${ms.map(m => `<li class="version"><span class="txt"><b>${esc(m.sigla)}</b> · ${esc(m.nombre)}${m.sigla === principal ? ' <span class="tag">Principal</span>' : ""}
      <small>${n(m.resumen.libros)} libros, ${n(m.resumen.versiculos)} versículos${m.resumen.agrupados ? ` (${n(m.resumen.agrupados)} agrupados)` : ""}</small></span>
      ${m.sigla === principal ? "" : `<button class="btn-sec" data-principal="${esc(m.sigla)}">Hacer principal</button>`}
      <button class="btn-peligro" data-quitar-version="${esc(m.sigla)}">Quitar</button></li>`).join("")}</ul>`
      : `<p class="meta">No hay ninguna Biblia cargada. Carga un archivo XML (formato Zefania o «bible»).</p>`}
    <div class="acciones" style="justify-content:flex-start"><label class="btn-primario" style="display:inline-grid;place-items:center">Cargar archivo<input type="file" id="c-biblia" accept=".xml,.XML,text/xml,application/xml" hidden></label></div>
    <p class="meta">El texto se guarda solo en esta tablet y funciona sin internet.</p>`;
}

function vistaConfig() {
  const c = almacen.config();
  return `<h1 class="titulo-vista">Configuración</h1><form id="f-config" class="card form">
    <label>Nombre en el saludo<input id="c-nombre" maxlength="40" value="${esc(c.nombre)}"></label>
    <label>Tamaño de letra<select id="c-letra">${[["normal", "Normal"], ["grande", "Grande"], ["muy-grande", "Muy grande"]].map(([v, t]) => `<option value="${v}" ${c.letra === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>Tema<select id="c-tema">${[["claro", "Claro (fondo blanco)"], ["oscuro", "Oscuro (fondo negro)"]].map(([v, t]) => `<option value="${v}" ${c.tema === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <div class="acciones"><button type="submit" class="btn-primario">Guardar</button></div></form>
    <section class="card form" style="margin-top:22px"><h2>Pantalla de proyección</h2>
      ${c.pantalla ? `<p class="meta">Conectada a la pantalla <b>${esc(c.pantalla)}</b>. En el lector aparece el botón 📺 Proyectar.</p>
        <div class="acciones" style="justify-content:flex-start"><button type="button" class="btn-sec" id="c-desconectar">Desconectar</button></div>`
      : `<form id="f-pantalla" class="form"><label>Código que muestra la pantalla de la iglesia (tecla F2)<input id="c-pantalla" placeholder="UC-XXXX-XXXX" autocomplete="off" autocapitalize="characters" maxlength="20"></label>
        <div class="acciones" style="justify-content:flex-start"><button class="btn-primario">Conectar</button></div></form>`}</section>
    <section class="card form" style="margin-top:22px" id="c-versiones"><h2>Versiones de la Biblia</h2><p class="meta">Cargando…</p></section>
    <section class="card form" style="margin-top:22px"><h2>Copia de respaldo</h2>
      <p class="meta">Último respaldo: ${c.ultimoRespaldo ? esc(new Date(c.ultimoRespaldo).toLocaleString("es")) : "nunca"}</p>
      <div class="acciones" style="justify-content:flex-start"><button type="button" class="btn-primario" id="c-compartir">Compartir copia</button>
      <button type="button" class="btn-sec" id="c-exportar">Exportar copia</button>
      <label class="btn-sec" style="display:inline-grid;place-items:center">Importar copia<input type="file" id="c-importar" accept="application/json,.json,text/plain,.txt" hidden></label></div>
      <p class="meta">Guarda la copia fuera de la tablet (WhatsApp, Drive o correo). Para recuperarla: Importar copia.</p></section>`;
}

function pintar() {
  document.documentElement.dataset.letra = almacen.config().letra;
  aplicarTema();
  $("#vista").innerHTML = { inicio: vistaInicio, domingo: vistaDomingo, favoritos: vistaFavoritos, historial: vistaHistorial,
    biblia: vistaBiblia, config: vistaConfig, lector: vistaLector }[vista]();
  document.querySelectorAll(".menu [data-ir]").forEach(b => b.classList.toggle("activa", b.dataset.ir === vista));
  if (vista === "domingo") previstaDomingo();
  if (vista === "config") pintarVersiones();
  if (vista === "lector") pintarLector();
}

function ir(v, nueva = false) {
  if (v !== vista || nueva) history.pushState({ vista: v, lectura: v === "lector" ? lectura : null }, "", "#" + v);
  vista = v; pintar(); $("#vista").scrollTop = 0;
}
window.addEventListener("popstate", ev => {
  const v = VISTAS.includes(ev.state?.vista) ? ev.state.vista : vistaDeHash();
  if (v === "lector" && !ev.state?.lectura) vista = "inicio";
  else { vista = v; if (v === "lector") lectura = ev.state.lectura; }
  pintar(); $("#vista").scrollTop = 0;
});

function pista() {
  const q = $("#q").value, p = $("#pista"), b = $("#b-abrir");
  if (!q.trim()) { p.innerHTML = ""; b.disabled = true; return; }
  const r = parseCita(q);
  b.disabled = !r.ok;
  p.innerHTML = r.ok
    ? `Se abrirá <b>${esc(r.etiqueta)}</b>${r.corregido ? " (ordené el rango)" : ""} <button type="button" class="estrella" data-fav="${enc(citaDe(r))}" aria-label="Guardar en favoritos">☆</button>`
    : `<span class="mal">${esc(r.error)}</span>${r.sugerencias.map(s => `<button type="button" class="sugerencia" data-sugerir="${esc(s + (r.numeros ? " " + r.numeros : ""))}">${esc(s)}</button>`).join("")}`;
}

function previstaDomingo() {
  const ls = lineasDomingo($("#d-citas").value);
  $("#d-prevista").innerHTML = ls.map(l => l.r.ok
    ? `<li class="ok">✓ ${esc(l.r.etiqueta)}${l.titulo ? ` · ${esc(l.titulo)}` : ""}</li>`
    : `<li class="mal">✗ “${esc(l.linea)}”: ${esc(l.r.error)}</li>`).join("");
  $("#d-guardar").disabled = !ls.length || ls.some(l => !l.r.ok);
}

function pedirSerie(cita) {
  favPendiente = cita;
  $("#fav-etiqueta").textContent = cita.etiqueta;
  $("#fav-nueva").value = "";
  $("#fav-series").innerHTML = almacen.series().map(s => `<button type="button" class="chip" data-serie="${esc(s)}">${esc(s)}</button>`).join("");
  $("#dlg-fav").showModal();
}

const nombreCopia = ext => `united-church-respaldo-${hoyISO()}.${ext}`;
function descargarCopia(texto, msg) {
  const blob = new Blob([texto], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nombreCopia("json") });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); pintar(); aviso(msg, 7000);
}

document.addEventListener("click", async ev => {
  const t = ev.target.closest("button,[data-ir]");
  if (!t) return;
  if (t.dataset.ir) return ir(t.dataset.ir);
  if (t.hasAttribute("data-volver")) return history.back();
  if (t.hasAttribute("data-proyectar")) {
    if (proy.activo && proy.enviado === claveLectura($("#l-sigla").textContent)) return;
    proy.seguir = true; await enviarPasaje($("#l-sigla").textContent); return pintarLector();
  }
  if (t.dataset.parte && canalProy) {
    const n = proy.parte + Number(t.dataset.parte);
    if (n < 0 || n >= proy.partes) return;
    try { await canalProy.publicar(msgParte(n)); } catch { return aviso("Sin conexión: no se pudo enviar a la pantalla", 6000); }
    Object.assign(proy, { parte: n, esperando: Date.now() }); setTimeout(pintarBarra, 5200); return pintarBarra();
  }
  if (t.hasAttribute("data-quitar-pantalla") && canalProy) {
    try { await canalProy.publicar(msgEspera()); } catch { return aviso("Sin conexión: no se pudo enviar a la pantalla", 6000); }
    Object.assign(proy, { activo: false, seguir: false, enviado: null }); return pintarLector();
  }
  if (t.id === "c-desconectar") {
    almacen.guardarConfig({ pantalla: null }); Object.assign(proy, { activo: false, seguir: false, enviado: null });
    conectarPantalla(); pintar(); return aviso("Pantalla desconectada");
  }
  if (t.hasAttribute("data-alternar-tema")) {
    almacen.guardarConfig({ tema: almacen.config().tema === "oscuro" ? "claro" : "oscuro" });
    aplicarTema(); t.textContent = botonTema(); return;
  }
  if (t.dataset.capitulo) { const c = dec(t.dataset.capitulo); return abrirCapitulo(c.codigo, c.cap); }
  if (t.dataset.libro !== undefined) { libroSel = t.dataset.libro || null; pintar(); return ($("#vista").scrollTop = 0); }
  if (t.hasAttribute("data-completo")) { lectura.completo = !lectura.completo; history.replaceState({ vista, lectura }, "", "#lector"); return pintar(); }
  if (t.dataset.version) {
    const y = $("#vista").scrollTop;
    lectura.sigla = t.dataset.version; history.replaceState({ vista, lectura }, "", "#lector");
    pintar(); await pintarLector(); $("#vista").scrollTop = y; return;
  }
  if (t.dataset.principal) { await biblias.hacerPrincipal(t.dataset.principal); return pintarVersiones(); }
  if (t.dataset.quitarVersion) {
    if (!confirm(`¿Quitar la versión ${t.dataset.quitarVersion} de esta tablet?`)) return;
    await biblias.quitar(t.dataset.quitarVersion); aviso("Versión quitada"); return pintarVersiones();
  }
  if (t.dataset.domPaso) {
    const dom = lectura?.domingo, d = dom && almacen.domingos().find(x => x.id === dom.id), i = dom ? dom.i + Number(t.dataset.domPaso) : -1;
    if (d?.citas[i]) return abrir(d.citas[i], false, false, { id: d.id, i });
    return;
  }
  if (t.dataset.cita) return abrir(dec(t.dataset.cita), false, false, t.dataset.domingoI ? dec(t.dataset.domingoI) : null);
  if (t.dataset.fav) return pedirSerie(dec(t.dataset.fav));
  if (t.dataset.quitar) { almacen.quitarFavorito(t.dataset.quitar); return pintar(); }
  if (t.dataset.sugerir !== undefined) { $("#q").value = t.dataset.sugerir; pista(); return $("#q").focus(); }
  if (t.dataset.domingo !== undefined) { domingoSel = t.dataset.domingo || null; return pintar(); }
  if (t.dataset.serie) { document.querySelectorAll("#fav-series .chip").forEach(c => c.classList.toggle("sel", c === t)); $("#fav-nueva").value = t.dataset.serie; }
  if (t.id === "d-borrar" && confirm("¿Borrar este domingo?")) { almacen.borrarDomingo(domingoSel); domingoSel = null; pintar(); aviso("Domingo borrado"); }
  if (t.id === "c-exportar") descargarCopia(almacen.exportar(), `Copia guardada en Descargas: ${nombreCopia("json")}`);
  if (t.id === "c-compartir") {
    const texto = almacen.exportar();
    const file = new File([texto], nombreCopia("txt"), { type: "text/plain" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Copia de United Church", text: "Copia de respaldo de United Church (guárdala en Drive, WhatsApp o correo)." });
        pintar(); return aviso("Copia compartida");
      } catch (e) { if (e?.name === "AbortError") return pintar(); }
    }
    descargarCopia(texto, "Este dispositivo no permite compartir archivos; la copia se guardó en Descargas.");
  }
});

document.addEventListener("input", ev => {
  if (ev.target.id === "q") pista();
  if (ev.target.id === "d-citas") previstaDomingo();
});

document.addEventListener("submit", ev => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === "f-buscar") { const r = parseCita($("#q").value); if (r.ok) abrir(citaDe(r)); }
  if (f.id === "f-domingo") {
    const ls = lineasDomingo($("#d-citas").value);
    if (!ls.length || ls.some(l => !l.r.ok)) return;
    domingoSel = almacen.guardarDomingo({ id: domingoSel, fecha: $("#d-fecha").value, titulo: $("#d-titulo").value.trim(),
      citas: ls.map(l => ({ ...citaDe(l.r), ...(l.titulo ? { titulo: l.titulo } : {}) })) });
    pintar(); aviso("Domingo guardado");
  }
  if (f.id === "f-pantalla") {
    const codigo = normalizarCodigo($("#c-pantalla").value);
    if (!codigo) return aviso("Ese código no es válido. Cópialo de la pantalla (tecla F2), por ejemplo UC-7K4P-9QX2.", 6000);
    almacen.guardarConfig({ pantalla: codigo }); conectarPantalla(); pintar(); return aviso("Pantalla conectada");
  }
  if (f.id === "f-config") { almacen.guardarConfig({ nombre: $("#c-nombre").value.trim() || "pastor", letra: $("#c-letra").value, tema: $("#c-tema").value }); pintar(); aviso("Guardado"); }
  if (f.id === "f-fav") {
    const guardar = ev.submitter?.value !== "cancelar" && favPendiente;
    if (guardar) almacen.agregarFavorito($("#fav-nueva").value, favPendiente);
    $("#dlg-fav").close();
    if (guardar) { pintar(); aviso("Guardado en favoritos"); }
  }
});

document.addEventListener("change", async ev => {
  if (ev.target.id === "c-biblia" && ev.target.files[0]) {
    const inp = ev.target, archivo = inp.files[0];
    inp.value = "";
    try {
      aviso("Leyendo la Biblia…", 60000);
      const b = importarBiblia(decodificar(await archivo.arrayBuffer()));
      if (!b.sigla) b.sigla = (prompt("¿Qué sigla le ponemos a esta versión? (por ejemplo TLA)") || "").trim().slice(0, 20);
      if (!b.sigla) return aviso("Carga cancelada: falta la sigla");
      const ya = (await biblias.versiones()).some(m => m.sigla === b.sigla);
      if (ya && !confirm(`Ya hay una versión ${b.sigla}. ¿Reemplazarla por este archivo?`)) return aviso("Carga cancelada");
      aviso("Guardando en la tablet…", 60000);
      await biblias.guardar(b);
      aviso(`${b.sigla}: ${b.resumen.libros} libros, ${b.resumen.versiculos.toLocaleString("es")} versículos${b.resumen.agrupados ? ` (${b.resumen.agrupados.toLocaleString("es")} agrupados)` : ""}`, 8000);
    } catch (e) {
      aviso(e instanceof ErrorBiblia ? e.message : "No se pudo guardar la Biblia (¿falta espacio en la tablet?). La versión anterior sigue igual.", 8000);
    }
    return pintarVersiones();
  }
  if (ev.target.id !== "c-importar" || !ev.target.files[0]) return;
  const inp = ev.target;
  try {
    const texto = await inp.files[0].text();
    if (confirm("Esto reemplaza todos los datos actuales por los de la copia. ¿Continuar?")) {
      const n = almacen.importar(texto);
      pintar(); aviso(n ? `Copia restaurada (${n} elementos dañados se omitieron)` : "Copia restaurada");
    }
  }
  catch { aviso("Ese archivo no es una copia válida de United Church"); }
  inp.value = "";
});

$("#dlg-fav").addEventListener("close", () => { favPendiente = null; });
navigator.storage?.persist?.().catch?.(() => {});
history.replaceState({ vista }, "", "#" + vista);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
conectarPantalla();
pintar();
