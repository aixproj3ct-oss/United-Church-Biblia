// Interfaz de United Church: el texto bíblico lo muestra YouVersion; aquí solo hay referencias y datos del pastor.
import { parseCita, ordenBiblico } from "./src/citas.js";
import { crearAlmacen } from "./src/datos.js";

const almacen = crearAlmacen();
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = o => encodeURIComponent(JSON.stringify(o));
const dec = s => JSON.parse(decodeURIComponent(s));
const hoyISO = () => new Date().toLocaleDateString("en-CA");
const citaDe = r => ({ codigo: r.codigoRef, etiqueta: r.etiqueta, url: r.url });
const VISTAS = ["inicio", "domingo", "favoritos", "historial", "config"];
const vistaDeHash = () => { const h = location.hash.slice(1); return VISTAS.includes(h) ? h : "inicio"; };
let vista = vistaDeHash(), domingoSel = null, favPendiente = null;

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

function abrir(cita) {
  almacen.registrarHistorial(cita);
  if (!navigator.onLine) aviso("Sin internet; si descargaste la TLA en YouVersion se abrirá igual.", 6000);
  else if (!almacen.config().avisoYouVersion) {
    almacen.guardarConfig({ avisoYouVersion: true });
    aviso("Si el pasaje se abre en el navegador en vez de la app Biblia: Ajustes › Aplicaciones › Biblia › Abrir enlaces compatibles.", 8000);
  }
  window.open(cita.url, "_blank", "noopener");
  pintar();
}

function itemCita(c, i) {
  return `<li><button class="cita-btn" data-cita="${enc(c)}"><span class="n">${i + 1}</span><span><b>${esc(c.etiqueta)}</b>${c.titulo ? `<small>${esc(c.titulo)}</small>` : ""}</span><span class="chev">›</span></button></li>`;
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
    <ol class="citas">${d.citas.map(itemCita).join("")}</ol>`;
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

function vistaConfig() {
  const c = almacen.config();
  return `<h1 class="titulo-vista">Configuración</h1><form id="f-config" class="card form">
    <label>Nombre en el saludo<input id="c-nombre" maxlength="40" value="${esc(c.nombre)}"></label>
    <label>Tamaño de letra<select id="c-letra">${[["normal", "Normal"], ["grande", "Grande"], ["muy-grande", "Muy grande"]].map(([v, t]) => `<option value="${v}" ${c.letra === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <div class="acciones"><button type="submit" class="btn-primario">Guardar</button></div></form>
    <section class="card form" style="margin-top:22px"><h2>Copia de respaldo</h2>
      <p class="meta">Último respaldo: ${c.ultimoRespaldo ? esc(new Date(c.ultimoRespaldo).toLocaleString("es")) : "nunca"}</p>
      <div class="acciones" style="justify-content:flex-start"><button type="button" class="btn-primario" id="c-exportar">Exportar copia</button>
      <label class="btn-sec" style="display:inline-grid;place-items:center">Importar copia<input type="file" id="c-importar" accept="application/json,.json" hidden></label></div></section>`;
}

function pintar() {
  document.documentElement.dataset.letra = almacen.config().letra;
  $("#vista").innerHTML = { inicio: vistaInicio, domingo: vistaDomingo, favoritos: vistaFavoritos, historial: vistaHistorial, config: vistaConfig }[vista]();
  document.querySelectorAll(".menu [data-ir]").forEach(b => b.classList.toggle("activa", b.dataset.ir === vista));
  if (vista === "domingo") previstaDomingo();
}

function ir(v) {
  if (v !== vista) history.pushState({ vista: v }, "", "#" + v);
  vista = v; pintar(); $("#vista").scrollTop = 0;
}
window.addEventListener("popstate", ev => { vista = VISTAS.includes(ev.state?.vista) ? ev.state.vista : vistaDeHash(); pintar(); $("#vista").scrollTop = 0; });

function pista() {
  const q = $("#q").value, p = $("#pista"), b = $("#b-abrir");
  if (!q.trim()) { p.innerHTML = ""; b.disabled = true; return; }
  const r = parseCita(q);
  b.disabled = !r.ok;
  p.innerHTML = r.ok
    ? `Se abrirá <b>${esc(r.etiqueta)}</b> · TLA${r.corregido ? " (ordené el rango)" : ""}${r.rangoRecortado ? " (el enlace abre el primer versículo)" : ""} <button type="button" class="estrella" data-fav="${enc(citaDe(r))}" aria-label="Guardar en favoritos">☆</button>`
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

document.addEventListener("click", ev => {
  const t = ev.target.closest("button,[data-ir]");
  if (!t) return;
  if (t.dataset.ir) return ir(t.dataset.ir);
  if (t.hasAttribute("data-abrir-biblia")) {
    const h = almacen.historial();
    const codigo = h.length ? h[0].cita.codigo : "GEN.1";
    const [libro, capitulo] = codigo.split(".");
    const url = `https://www.bible.com/bible/176/${libro}.${capitulo}.TLA`;
    window.open(url, "_blank", "noopener");
    return;
  }
  if (t.dataset.cita) return abrir(dec(t.dataset.cita));
  if (t.dataset.fav) return pedirSerie(dec(t.dataset.fav));
  if (t.dataset.quitar) { almacen.quitarFavorito(t.dataset.quitar); return pintar(); }
  if (t.dataset.sugerir !== undefined) { $("#q").value = t.dataset.sugerir; pista(); return $("#q").focus(); }
  if (t.dataset.domingo !== undefined) { domingoSel = t.dataset.domingo || null; return pintar(); }
  if (t.dataset.serie) { document.querySelectorAll("#fav-series .chip").forEach(c => c.classList.toggle("sel", c === t)); $("#fav-nueva").value = t.dataset.serie; }
  if (t.id === "d-borrar" && confirm("¿Borrar este domingo?")) { almacen.borrarDomingo(domingoSel); domingoSel = null; pintar(); aviso("Domingo borrado"); }
  if (t.id === "c-exportar") {
    const nombre = `united-church-respaldo-${hoyISO()}.json`;
    const blob = new Blob([almacen.exportar()], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nombre });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); pintar(); aviso(`Copia guardada en Descargas: ${nombre}`, 7000);
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
  if (f.id === "f-config") { almacen.guardarConfig({ nombre: $("#c-nombre").value.trim() || "pastor", letra: $("#c-letra").value }); pintar(); aviso("Guardado"); }
  if (f.id === "f-fav") {
    const guardar = ev.submitter?.value !== "cancelar" && favPendiente;
    if (guardar) almacen.agregarFavorito($("#fav-nueva").value, favPendiente);
    $("#dlg-fav").close();
    if (guardar) { pintar(); aviso("Guardado en favoritos"); }
  }
});

document.addEventListener("change", async ev => {
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
window.addEventListener("offline", () => aviso("Sin internet: los pasajes se abrirán cuando vuelva el Wi-Fi."));
navigator.storage?.persist?.().catch?.(() => {});
history.replaceState({ vista }, "", "#" + vista);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
pintar();
