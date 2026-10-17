// Pantalla de proyección (PC de EasyWorship): recibe por ntfy lo que el pastor proyecta y lo dibuja
// en una lámina 16:9 con la Biblia cargada en esta PC. El texto bíblico nunca viaja por la red.
import { crearBiblias } from "../biblias.js";
import { decodificar, importarBiblia, ErrorBiblia } from "../importar.js";
import { armarPasaje, refDeCodigo, etiquetaRef, ordenAlternativas } from "../pasaje.js";
import { repartir, refDeParte } from "./partes.js";
import { generarCodigo, temaDe, crearOrden, msgEstado } from "./mensajes.js";
import { crearCanal } from "./canal.js";

const CLAVE = "uc-pantalla-v1", N_FONDOS = 11;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const urlFondo = n => `assets/proyeccion/fondos/${String(n).padStart(2, "0")}.jpg`;
const biblias = crearBiblias();

function leerConf() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE));
    if (c && typeof c.codigo === "string") return { codigo: c.codigo, fondo: c.fondo >= 1 && c.fondo <= N_FONDOS ? c.fondo : 1, rotar: c.rotar === true };
  } catch { /* sin almacenamiento */ }
  return guardarConf({ codigo: generarCodigo(), fondo: 1, rotar: false });
}
function guardarConf(c) { try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* sin almacenamiento */ } return c; }

let conf = leerConf(), canal = null, cerrarCanal = null, orden = crearOrden(), cola = Promise.resolve();
let actual = null; // { codigo, refBase, partes, tam, parte, unaParte }
let conectado = false;

function aviso(msg, ms = 4000) { const a = $("#aviso"); a.textContent = msg; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), ms); }
function escalar() { document.documentElement.style.setProperty("--s", Math.min(innerWidth / 1920, innerHeight / 1080)); }
function pintarFondo() { $("#foto").src = urlFondo(conf.fondo); }

const htmlBloques = bs => bs.map(b => `<span class="vers${b.sigla ? " relleno" : ""}">${b.cont ? "" : `<b class="num">${esc(b.etiqueta)}</b>`}${esc(b.texto)}${b.sigla ? `<small class="de">${esc(b.sigla)}</small>` : ""}</span>`).join(" ");

// ¿Caben estos bloques a este tamaño en la caja, dejando lugar para la referencia y el pie?
function cabe(bloques, tam) {
  const disponible = 1080 - 2 * 110 - $("#ref").offsetHeight - 18 - $("#pie").offsetHeight - 30;
  const m = $("#medida");
  m.style.fontSize = tam + "px";
  m.innerHTML = htmlBloques(bloques);
  return m.scrollHeight <= disponible;
}

function mostrarEspera() { $("#lamina").hidden = true; $("#espera").hidden = false; }
function mostrarMensaje(ref, texto) {
  $("#espera").hidden = true; $("#lamina").hidden = false;
  $("#ref").textContent = ref; $("#pie").textContent = "";
  const t = $("#texto"); t.className = "texto aviso-texto"; t.style.fontSize = ""; t.textContent = texto;
}
function dibujar() {
  const { refBase, partes, tam, parte } = actual;
  $("#espera").hidden = true; $("#lamina").hidden = false;
  $("#ref").textContent = partes.length > 1 ? refDeParte(refBase, partes[parte]) : etiquetaRef(refBase);
  const t = $("#texto"); t.className = "texto"; t.style.fontSize = tam + "px"; t.innerHTML = htmlBloques(partes[parte]);
}
function publicarEstado() {
  if (!actual || !canal) return;
  canal.publicar(msgEstado({ codigo: actual.codigo, partes: actual.partes.length, parte: actual.parte })).catch(() => {});
}

async function mostrarPasaje(m) {
  const ms = await biblias.versiones();
  if (!ms.length) { actual = null; return mostrarMensaje("", "Carga una Biblia (F2)"); }
  const ref = refDeCodigo(m.codigo), principal = await biblias.principal();
  const sigla = ms.some(v => v.sigla === m.sigla) ? m.sigla : principal;
  const alts = ordenAlternativas(ms, sigla);
  const caps = await Promise.all([sigla, ...alts.map(a => a.sigla)].map(s => biblias.capitulo(s, ref.codigo, ref.cap)));
  const r = armarPasaje({ principal: { sigla, cap: caps[0] }, alternativas: alts.map((a, i) => ({ sigla: a.sigla, cap: caps[i + 1] })),
    desde: m.completo ? null : ref.v1, hasta: m.completo ? null : (ref.v2 ?? ref.v1) });
  const refBase = m.completo ? { ...ref, v1: null, v2: null } : ref;
  if (conf.rotar && actual?.codigo !== m.codigo) { conf = guardarConf({ ...conf, fondo: conf.fondo % N_FONDOS + 1 }); pintarFondo(); }
  if (!r.bloques.length) {
    actual = { codigo: m.codigo, refBase, partes: [[]], tam: 48, parte: 0 };
    mostrarMensaje(etiquetaRef(refBase), "Este pasaje no está en las Biblias cargadas");
    return publicarEstado();
  }
  $("#espera").hidden = true; $("#lamina").hidden = false;
  $("#ref").textContent = etiquetaRef(refBase);
  $("#pie").textContent = ms.find(v => v.sigla === sigla)?.nombre || sigla;
  const { tam, partes } = repartir(r.bloques, cabe);
  actual = { codigo: m.codigo, refBase, partes, tam, parte: Math.min(m.parte, partes.length - 1) };
  dibujar();
  publicarEstado();
}

function irAParte(n) {
  if (!actual || n < 0 || n >= actual.partes.length || n === actual.parte) return;
  actual.parte = n; dibujar(); publicarEstado();
}

async function aplicar(m) {
  if (m.de !== "tablet" || !orden(m)) return;
  if (m.tipo === "pasaje") return mostrarPasaje(m);
  if (m.tipo === "parte") return irAParte(Math.min(m.parte, (actual?.partes.length ?? 1) - 1));
  if (m.tipo === "espera") { actual = null; mostrarEspera(); }
}
const encolar = m => { cola = cola.then(() => aplicar(m)).catch(() => {}); };

async function conectar() {
  cerrarCanal?.();
  canal = crearCanal(temaDe(conf.codigo));
  orden = crearOrden();
  cerrarCanal = canal.escuchar(encolar, ok => { conectado = ok; pintarPanel(); });
  // Al abrir o recargar: el último pasaje (o espera) y los cambios de parte que vinieron después.
  const ms = await canal.recientes("tablet");
  const i = ms.findLastIndex(m => m.tipo !== "parte");
  if (i >= 0) ms.slice(i).forEach(encolar);
}

async function pintarPanel() {
  const p = $("#panel");
  if (p.hidden) return;
  const [ms, principal] = await Promise.all([biblias.versiones(), biblias.principal()]);
  p.innerHTML = `<h2>Código de conexión</h2>
    <div class="codigo">${esc(conf.codigo)}</div>
    <small>Escríbelo una vez en la tablet: Configuración → Pantalla de proyección.</small><br>
    <small><span class="punto ${conectado ? "ok" : ""}"></span>${conectado ? "Conectada" : "Sin conexión"}</small><br>
    <button data-accion="nuevo-codigo">Nuevo código</button>
    <h2>Versiones de la Biblia</h2>
    ${ms.length ? `<ul>${ms.map(m => `<li><b>${esc(m.sigla)}</b> · ${esc(m.nombre)} ${m.sigla === principal ? "<small>(principal)</small>" : `<button data-principal="${esc(m.sigla)}">Hacer principal</button>`}
      <button data-quitar="${esc(m.sigla)}">Quitar</button></li>`).join("")}</ul>` : "<small>No hay ninguna Biblia cargada.</small>"}
    <label class="boton principal">Cargar archivo<input type="file" id="p-biblia" accept=".xml,.XML,text/xml,application/xml" hidden></label>
    <h2>Fondo</h2>
    <div class="fondos">${Array.from({ length: N_FONDOS }, (_, i) => `<button data-fondo="${i + 1}" class="${conf.fondo === i + 1 ? "sel" : ""}"><img src="${urlFondo(i + 1)}" alt="Fondo ${i + 1}"></button>`).join("")}</div>
    <label><input type="checkbox" id="p-rotar" ${conf.rotar ? "checked" : ""}> Cambiar con cada pasaje</label>
    <h2>Pantalla</h2>
    <button data-accion="espera">Ver pantalla de espera</button> <button data-accion="cerrar">Cerrar panel (F2)</button>
    <p><small>← → cambian de parte · Esc: pantalla de espera · F2: este panel</small></p>`;
}
function alternarPanel() { const p = $("#panel"); p.hidden = !p.hidden; pintarPanel(); }

document.addEventListener("click", async ev => {
  const t = ev.target.closest("button");
  if (!t) return;
  if (t.id === "engrane" || t.dataset.accion === "cerrar") return alternarPanel();
  if (t.dataset.accion === "espera") { actual = null; return mostrarEspera(); }
  if (t.dataset.accion === "nuevo-codigo") {
    if (!confirm("Con un código nuevo habrá que volver a escribirlo en la tablet. ¿Continuar?")) return;
    conf = guardarConf({ ...conf, codigo: generarCodigo() }); await conectar(); return pintarPanel();
  }
  if (t.dataset.fondo) { conf = guardarConf({ ...conf, fondo: +t.dataset.fondo }); pintarFondo(); return pintarPanel(); }
  if (t.dataset.principal) { await biblias.hacerPrincipal(t.dataset.principal); return pintarPanel(); }
  if (t.dataset.quitar) {
    if (!confirm(`¿Quitar la versión ${t.dataset.quitar} de esta PC?`)) return;
    await biblias.quitar(t.dataset.quitar); return pintarPanel();
  }
});

document.addEventListener("change", async ev => {
  if (ev.target.id === "p-rotar") { conf = guardarConf({ ...conf, rotar: ev.target.checked }); return; }
  if (ev.target.id !== "p-biblia" || !ev.target.files[0]) return;
  const archivo = ev.target.files[0];
  ev.target.value = "";
  try {
    aviso("Leyendo la Biblia…", 60000);
    const b = importarBiblia(decodificar(await archivo.arrayBuffer()));
    if (!b.sigla) b.sigla = (prompt("¿Qué sigla le ponemos a esta versión? (por ejemplo TLA)") || "").trim().slice(0, 20);
    if (!b.sigla) return aviso("Carga cancelada: falta la sigla");
    if ((await biblias.versiones()).some(m => m.sigla === b.sigla) && !confirm(`Ya hay una versión ${b.sigla}. ¿Reemplazarla?`)) return aviso("Carga cancelada");
    await biblias.guardar(b);
    aviso(`${b.sigla}: ${b.resumen.libros} libros, ${b.resumen.versiculos.toLocaleString("es")} versículos`);
  } catch (e) {
    aviso(e instanceof ErrorBiblia ? e.message : "No se pudo guardar la Biblia (¿falta espacio?). La versión anterior sigue igual.", 8000);
  }
  pintarPanel();
});

document.addEventListener("keydown", ev => {
  if (ev.key === "F2") { ev.preventDefault(); return alternarPanel(); }
  if (ev.target.closest?.("input")) return;
  if (ev.key === "ArrowRight" && actual) irAParte(actual.parte + 1);
  if (ev.key === "ArrowLeft" && actual) irAParte(actual.parte - 1);
  if (ev.key === "Escape") { actual = null; mostrarEspera(); }
});

let ocultarEngrane;
document.addEventListener("mousemove", () => {
  $("#engrane").classList.add("visible");
  clearTimeout(ocultarEngrane);
  ocultarEngrane = setTimeout(() => $("#engrane").classList.remove("visible"), 3000);
});

addEventListener("resize", escalar);
escalar();
pintarFondo();
mostrarEspera();
navigator.storage?.persist?.().catch?.(() => {});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
conectar();
