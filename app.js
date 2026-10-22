// Interfaz de United Church. El texto bíblico lo muestra el lector propio desde las Biblias cargadas en esta tablet.
import { parseCita, ordenBiblico } from "./src/citas.js";
import { crearAlmacen } from "./src/datos.js";
import { crearBiblias } from "./src/biblias.js";
import { decodificar, importarBiblia, ErrorBiblia } from "./src/importar.js";
import { refDeCodigo, etiquetaRef, codigoRef, abreviatura } from "./src/pasaje.js";
import { LIBROS } from "./src/libros.js";
import { nuevaLectura, seguirProyeccion } from "./src/lectura.js";
import { normalizarCodigo } from "./src/proyeccion/mensajes.js";
import { crearIndice, buscar, fichas, palabrasResaltar } from "./src/busqueda.js";
import { proximoDomingo, fechaLarga } from "./src/fechas.js";
import { esc, aviso } from "./src/ui.js";
import { proy, iniciarLector, conectarPantalla, hayPantalla, sinRespuesta, soltarPantalla, vistaLector, pintarLector,
  sincronizarProyeccion, proyectarActual, reintentar, cambiarParte, quitarDePantalla, alVolver } from "./src/lector.js";

const almacen = crearAlmacen();
const biblias = crearBiblias();
iniciarLector({ almacen, biblias });
const $ = (s, r = document) => r.querySelector(s);
const enc = o => encodeURIComponent(JSON.stringify(o));
const dec = s => JSON.parse(decodeURIComponent(s));
const ic = (id, extra = "") => `<svg class="ico" ${extra}><use href="#i-${id}"/></svg>`;
const hoyISO = () => new Date().toLocaleDateString("en-CA");
const citaDe = r => ({ codigo: r.codigoRef, etiqueta: r.etiqueta });
const VISTAS = ["domingo", "biblia", "guardados", "config", "lector"];
const vistaInicial = () => almacen.domingoActual(hoyISO()) ? "domingo" : "biblia";
const vistaDeHash = () => { const h = location.hash.slice(1); return VISTAS.includes(h) && h !== "lector" ? h : vistaInicial(); };
let vista = vistaDeHash(), favPendiente = null;
// Domingo: el plan vigente o la lista con el editor (editando: true; domingoSel: el que se edita, null = nuevo).
let editando = false, domingoSel = null;
// Lo que muestra el lector: la cita, si se ve el capítulo completo y qué versión (null = la principal).
let lectura = null, libroSel = null, testamento = "at", pestana = "historial";
// Búsqueda por texto: el índice se arma una vez (al primer uso) y se descarta si cambian las versiones.
let indice = null, busqueda = null;

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

// ---------- Domingo ----------
function vistaDomingo() {
  if (editando) return vistaEditor();
  const d = almacen.domingoActual(hoyISO());
  if (!d) return `<h1>Domingo</h1><div class="card form"><h2>Aún no hay un domingo preparado</h2>
    <p class="meta">Anota las citas del sermón y aquí aparecerán como botones, listas para proyectar.</p>
    <div><button class="btn pri" data-editar="">${ic("edit")}Preparar el domingo</button></div></div>`;
  const etiqueta = d.fecha === hoyISO() ? "HOY" : d.fecha > hoyISO() ? "PRÓXIMO DOMINGO" : "ÚLTIMO DOMINGO";
  return `<div class="cab-dom"><div><div class="eti">${etiqueta} · ${esc(fechaLarga(d.fecha).toUpperCase())}</div>
      <span class="ref">${esc(d.titulo || "Sin título")}</span></div>
    <div class="acciones" style="margin:0"><button class="btn" data-editar="${esc(d.id)}">${ic("edit")}Editar plan</button>
      ${d.citas.length ? `<button class="btn pri" data-empezar="${esc(d.id)}">${ic("play", "style='fill:#f5c86a;stroke:none'")}Empezar sermón</button>` : ""}</div></div>
    <ol class="citas">${d.citas.map((c, i) => `<li><button class="cita" data-cita="${enc(c)}" data-domingo-i="${enc({ id: d.id, i })}">
      <span class="num-c">${i + 1}</span><span><b>${esc(c.etiqueta)}</b>${c.titulo ? `<small>${esc(c.titulo)}</small>` : ""}</span>${ic("der")}</button></li>`).join("")}</ol>
    <button class="enlace" data-editar="${esc(d.id)}">Domingos anteriores ›</button>`;
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
      <label>Fecha<input type="date" id="d-fecha" required value="${esc(d?.fecha || proximoDomingo(new Date()))}"></label>
      <label>Título del sermón (opcional)<input id="d-titulo" maxlength="80" value="${esc(d?.titulo || "")}"></label>
      <label>Una cita por línea. Ejemplo: ef 2 8-9 / La salvación por gracia
        <textarea id="d-citas">${esc(texto)}</textarea></label>
      <ul id="d-prevista" class="prevista"></ul>
      <div class="acciones">${d ? `<button type="button" class="btn peli" id="d-borrar">Borrar</button>` : ""}<button type="submit" class="btn pri" id="d-guardar">Guardar domingo</button></div>
    </form>`;
}

function previstaDomingo() {
  const ls = lineasDomingo($("#d-citas").value);
  $("#d-prevista").innerHTML = ls.map(l => l.r.ok
    ? `<li class="ok">✓ ${esc(l.r.etiqueta)}${l.titulo ? ` · ${esc(l.titulo)}` : ""}</li>`
    : `<li class="mal">✗ “${esc(l.linea)}”: ${esc(l.r.error)}</li>`).join("");
  $("#d-guardar").disabled = !ls.length || ls.some(l => !l.r.ok);
}

// ---------- Biblia y búsqueda ----------
function vistaBiblia() {
  const h = almacen.historial()[0];
  const ultimo = h && refDeCodigo(h.cita.codigo);
  const libro = libroSel && LIBROS.find(l => l[0] === libroSel);
  const libros = testamento === "at" ? LIBROS.slice(0, 39) : LIBROS.slice(39);
  return `<h1>Biblia</h1>
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

async function armarIndice() {
  const versiones = [];
  for (const m of await biblias.versiones()) {
    const libros = {};
    for (const [n, [codigo, , caps]] of LIBROS.entries())
      for (let c = 1; c <= caps; c++) {
        const cap = await biblias.capitulo(m.sigla, codigo, c);
        if (cap) (libros[n + 1] ??= {})[c] = cap;
      }
    versiones.push({ sigla: m.sigla, libros });
  }
  return crearIndice(versiones);
}

async function buscarTexto(consulta, sigla = null) {
  busqueda = { consulta, sigla, resultados: null, versiones: busqueda?.versiones ?? [] };
  pintar();
  busqueda.versiones = (await biblias.versiones()).map(m => m.sigla);
  if (!indice) { $("#resultados").innerHTML = `<p class="meta">Preparando la búsqueda… (solo la primera vez)</p>`; indice = armarIndice(); }
  const idx = await indice;
  if (busqueda?.consulta !== consulta) return;
  busqueda.resultados = buscar(idx, consulta, { sigla, max: 20 });
  if (vista === "biblia") $("#resultados").innerHTML = htmlResultados();
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
  return `<h1>Configuración</h1><div class="cfg">
    <section class="card"><h2>Apariencia</h2>
      <div class="lin">Tema ${seg("tema", [["claro", "Claro"], ["oscuro", "Oscuro"]], c.tema)}</div>
      <div class="lin">Tamaño de letra ${seg("letra", [["normal", "A", "font-size:14px"], ["grande", "A", "font-size:18px"], ["muy-grande", "A", "font-size:22px"]], c.letra)}</div>
      <div class="lin"><p class="texto-biblia" id="c-previa" style="margin:0;font-size:calc(var(--base) * 1.1)"><span class="ref">Juan 3:16</span></p></div></section>
    <section class="card"><h2>Pantalla de proyección</h2>
      ${c.pantalla ? `<div class="lin">Conectada a <b>${esc(c.pantalla)}</b> ${estado}</div>
        <div class="lin meta">Lo que proyectas aparece en la pantalla de la iglesia.</div>
        <div class="acciones"><button type="button" class="btn peq" id="c-desconectar">Cambiar código</button><button type="button" class="btn peq peli" id="c-desconectar2">Desconectar</button></div>`
      : `<form id="f-pantalla" class="lin" style="display:grid;gap:10px;border:0"><label class="meta">Código que muestra la pantalla de la iglesia (tecla F2)</label>
        <input id="c-pantalla" class="campo" placeholder="UC-XXXX-XXXX" autocomplete="off" autocapitalize="characters" maxlength="20">
        <div><button class="btn pri peq">Conectar</button></div></form>`}</section>
    <section class="card" id="c-versiones"><h2>Versiones de la Biblia</h2><p class="meta">Cargando…</p></section>
    <section class="card"><h2>Copia de respaldo</h2>
      <div class="lin">Última copia <b>${c.ultimoRespaldo ? esc(hace(c.ultimoRespaldo)) : "nunca"}</b></div>
      <div class="lin meta">Domingos, favoritos e historial. Guárdala fuera de la tablet (WhatsApp, Drive o correo).</div>
      <div class="acciones"><button type="button" class="btn pri peq" id="c-compartir">Compartir copia</button>
        <button type="button" class="btn peq" id="c-exportar">Descargar</button>
        <label class="btn peq">Restaurar…<input type="file" id="c-importar" accept="application/json,.json,text/plain,.txt" hidden></label></div></section>
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
  const blob = new Blob([texto], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nombreCopia("json") });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  almacen.marcarRespaldo(); pintar(); aviso(msg, 7000);
}

function desconectar() {
  almacen.guardarConfig({ pantalla: null }); soltarPantalla(); proy.respuesta = null;
  conectarPantalla(); pintar();
}

// ---------- Navegación ----------
function pintar() {
  aplicarTema();
  document.body.classList.toggle("en-lector", vista === "lector");
  $("#vista").innerHTML = { domingo: vistaDomingo, biblia: vistaBiblia, guardados: vistaGuardados, config: vistaConfig, lector: () => vistaLector(lectura) }[vista]();
  document.querySelectorAll(".nav [data-ir]").forEach(b => b.classList.toggle("activa", b.dataset.ir === vista));
  if (vista === "domingo" && editando) previstaDomingo();
  if (vista === "biblia") pista();
  if (vista === "config") pintarVersiones();
  if (vista === "lector") pintarLector(lectura).then(sincronizarProyeccion);
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
  if (d.ir) { if (d.ir === "domingo") editando = false; return ir(d.ir); }
  if (t.hasAttribute("data-volver")) return history.back();
  if (t.hasAttribute("data-buscar")) { ir("biblia"); return $("#q")?.focus(); }
  if (t.hasAttribute("data-proyectar")) return proyectarActual();
  if (t.hasAttribute("data-reintentar")) return reintentar();
  if (d.parte) return cambiarParte(Number(d.parte));
  if (t.hasAttribute("data-quitar-pantalla")) return quitarDePantalla();
  if (t.id === "c-desconectar" || t.id === "c-desconectar2") { desconectar(); return aviso("Pantalla desconectada"); }
  if (d.tema) { almacen.guardarConfig({ tema: d.tema }); return pintar(); }
  if (d.letra) { almacen.guardarConfig({ letra: d.letra }); return pintar(); }
  if (d.capitulo) { const c = dec(d.capitulo); return abrirCapitulo(c.codigo, c.cap); }
  if (d.versiculo) { const r = dec(d.versiculo); return abrir({ codigo: codigoRef(r), etiqueta: etiquetaRef(r) }, { navegando: true }); }
  if (d.libro !== undefined) { libroSel = d.libro || null; pintar(); return ($("#vista").scrollTop = 0); }
  if (d.testamento) { testamento = d.testamento; libroSel = null; return pintar(); }
  if (d.pestana) { pestana = d.pestana; return pintar(); }
  if (d.filtro !== undefined) return buscarTexto(busqueda.consulta, d.filtro || null);
  if (t.hasAttribute("data-limpiar")) { busqueda = null; return pintar(); }
  if (t.hasAttribute("data-completo")) {
    lectura.completo = !lectura.completo; history.replaceState({ vista, lectura }, "", "#lector");
    return pintarLector(lectura).then(sincronizarProyeccion);
  }
  if (d.version) {
    const cuerpo = $("#l-cuerpo"), y = cuerpo.scrollTop;
    lectura.sigla = d.version; history.replaceState({ vista, lectura }, "", "#lector");
    await pintarLector(lectura); cuerpo.scrollTop = y;
    return sincronizarProyeccion();
  }
  if (d.principal) { await biblias.hacerPrincipal(d.principal); return pintarVersiones(); }
  if (d.quitarVersion) {
    if (!confirm(`¿Quitar la versión ${d.quitarVersion} de esta tablet?`)) return;
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
    abrir(dm.citas[0], { domingo: { id: dm.id, i: 0 } });
    if (hayPantalla()) proyectarActual();
    return;
  }
  if (d.cita) return abrir(dec(d.cita), { domingo: d.domingoI ? dec(d.domingoI) : null, sigla: d.sigla || null });
  if (d.fav) return pedirSerie(dec(d.fav));
  if (d.quitar) { almacen.quitarFavorito(d.quitar); return pintar(); }
  if (d.sugerir !== undefined) { $("#q").value = d.sugerir; pista(); return $("#q").focus(); }
  if (d.editar !== undefined) { editando = true; domingoSel = d.editar || null; pintar(); return ($("#vista").scrollTop = 0); }
  if (t.hasAttribute("data-plan")) { editando = false; return pintar(); }
  if (d.domingo !== undefined) { domingoSel = d.domingo || null; return pintar(); }
  if (d.serie) { document.querySelectorAll("#fav-series .chip").forEach(c => c.classList.toggle("sel", c === t)); $("#fav-nueva").value = d.serie; }
  if (t.id === "d-borrar" && confirm("¿Borrar este domingo?")) { almacen.borrarDomingo(domingoSel); domingoSel = null; pintar(); aviso("Domingo borrado"); }
  if (t.id === "c-exportar") descargarCopia(almacen.exportar(), `Copia guardada en Descargas: ${nombreCopia("json")}`);
  if (t.id === "c-compartir") {
    const texto = almacen.exportar();
    const file = new File([texto], nombreCopia("txt"), { type: "text/plain" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Copia de United Church", text: "Copia de respaldo de United Church (guárdala en Drive, WhatsApp o correo)." });
        almacen.marcarRespaldo(); pintar(); return aviso("Copia compartida");
      } catch (e) { if (e?.name === "AbortError") return; }
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
    domingoSel = almacen.guardarDomingo({ id: domingoSel, fecha: $("#d-fecha").value, titulo: $("#d-titulo").value.trim(),
      citas: ls.map(l => ({ ...citaDe(l.r), ...(l.titulo ? { titulo: l.titulo } : {}) })) });
    editando = false; pintar(); aviso("Domingo guardado");
  }
  if (f.id === "f-pantalla") {
    const codigo = normalizarCodigo($("#c-pantalla").value);
    if (!codigo) return aviso("Ese código no es válido. Cópialo de la pantalla (tecla F2), por ejemplo UC-7K4P-9QX2.", 6000);
    almacen.guardarConfig({ pantalla: codigo }); conectarPantalla(); pintar(); return aviso("Pantalla conectada");
  }
  if (f.id === "f-fav") {
    const guardar = ev.submitter?.value !== "cancelar" && favPendiente;
    if (guardar) almacen.agregarFavorito($("#fav-nueva").value, favPendiente);
    $("#dlg-fav").close();
    if (guardar) { if (vista !== "lector") pintar(); aviso("Guardado en favoritos"); }
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
      indice = null;
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
      soltarPantalla(); conectarPantalla();
      pintar(); aviso(n ? `Copia restaurada (${n} elementos dañados se omitieron)` : "Copia restaurada");
    }
  }
  catch { aviso("Ese archivo no es una copia válida de United Church"); }
  inp.value = "";
});

$("#dlg-fav").addEventListener("close", () => { favPendiente = null; });
$("#b-actualizar").addEventListener("click", () => location.reload());
navigator.storage?.persist?.().catch?.(() => {});
history.replaceState({ vista }, "", "#" + vista);
if ("serviceWorker" in navigator) {
  // Solo avisa si ya había una versión controlando la página (la primera instalación no es una actualización).
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habia) $("#actualizar").hidden = false; });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
conectarPantalla();
pintar();
