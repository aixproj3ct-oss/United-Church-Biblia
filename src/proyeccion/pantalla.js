// Pantalla de proyección (PC de EasyWorship): recibe por ntfy lo que el pastor proyecta y lo dibuja
// en una lámina 16:9 con la Biblia cargada en esta PC. El texto bíblico nunca viaja por la red.
import { crearBiblias } from "../biblias.js";
import { cargarBiblia, ErrorBiblia } from "../importar.js";
import { cargarPasaje, refDeCodigo, etiquetaRef } from "../pasaje.js";
import { repartir, refDeParte } from "./partes.js";
import { generarCodigo, temaDe, crearOrden, msgEstado, paraArrancar, crearRecargaDiferida } from "./mensajes.js";
import { crearCanal, recientesHastaLograr } from "./canal.js";
import { esc, aviso } from "../ui.js";
import { laminasDe } from "../bosquejo/modelo.js";
import { htmlTitulo, htmlRecuerda, htmlPunto, htmlEncabezado, TAMANOS_BOSQUEJO } from "./lamina-bosquejo.js";

const CLAVE = "uc-pantalla-v1", N_FONDOS = 11;
const $ = s => document.querySelector(s);
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
// Lo que está en pantalla. De un pasaje: { codigo, refBase, partes, tam, parte, sigla, completo, sinTexto, error }.
// De una lámina del bosquejo: igual pero sin codigo y con bosq: { pub, i, lam, aviso } (pub = bosquejo público, i = índice en laminasDe).
let actual = null;
let conectado = null, fallaRecientes = false, gen = 0, cargando = false, ultimoAvisoReloj = 0;
const recarga = crearRecargaDiferida(() => location.reload());
function escalar() { document.documentElement.style.setProperty("--s", Math.min(innerWidth / 1920, innerHeight / 1080)); }
function pintarFondo() { $("#foto").src = urlFondo(conf.fondo); }
// Punto discreto en la lámina de espera: sin conexión con el servicio de mensajes (no hay texto grande en pantalla).
function pintarPunto() { $("#sin-conexion").hidden = !(conectado === false || fallaRecientes); }

const htmlBloques = bs => bs.map(b => `<span class="vers${b.sigla ? " relleno" : ""}">${b.cont ? "" : `<b class="num">${esc(b.etiqueta)}</b>`}${esc(b.texto)}${b.sigla ? `<small class="de">${esc(b.sigla)}</small>` : ""}</span>`).join(" ");

// Reparte midiendo en elementos ocultos (#m-ref, #m-pie, #medida): la lámina visible no se toca hasta tener todo calculado.
// Se reparte con la referencia completa; si la de alguna parte ocupa más alto, se reparte otra vez con ese alto.
function repartirMidiendo(bloques, refBase, pie) {
  const mRef = $("#m-ref"), mPie = $("#m-pie"), med = $("#medida");
  let altoRef = 0;
  mPie.textContent = `${pie} · 10 de 10`; // con lugar para el contador de partes
  mRef.textContent = etiquetaRef(refBase);
  const base = mRef.offsetHeight;
  // ¿Caben estos bloques a este tamaño en la caja, dejando lugar para la referencia y el pie?
  const cabe = (bs, tam) => {
    // Igual que proyeccion.css: caja de 96 arriba a 84 abajo, 33 bajo la referencia; el pie ya trae su espacio de 30.
    const disponible = 1080 - 96 - 84 - Math.max(altoRef, mRef.offsetHeight) - 33 - mPie.offsetHeight;
    med.style.fontSize = tam + "px";
    med.innerHTML = htmlBloques(bs);
    return med.scrollHeight <= disponible;
  };
  let r = repartir(bloques, cabe);
  const alto = Math.max(...r.partes.map(p => { mRef.textContent = r.partes.length > 1 ? refDeParte(refBase, p) : etiquetaRef(refBase); return mRef.offsetHeight; }));
  if (alto > base) { altoRef = alto; r = repartir(bloques, cabe); }
  return r;
}

// Un punto del bosquejo reparte su versículo midiendo igual, pero con el encabezado del punto arriba y la referencia más chica.
// B_ZONA_ARRIBA y B_REF_ABAJO son el padding de .b-zona y el margen de .b-ref en proyeccion.css.
const B_ZONA_ARRIBA = 24, B_REF_ABAJO = 14;
function repartirBosq(bloques, refBase, pie, pub, p) {
  const mEnc = $("#m-enc"), mRef = $("#m-bref"), mPie = $("#m-pie"), med = $("#medida");
  mEnc.innerHTML = htmlEncabezado(pub, p);
  mRef.textContent = etiquetaRef(refBase);
  mPie.textContent = `${pie} · 10 de 10`; // con lugar para el contador de partes
  const disponible = 1080 - 96 - 84 - mEnc.offsetHeight - B_ZONA_ARRIBA - mRef.offsetHeight - B_REF_ABAJO - mPie.offsetHeight;
  const cabe = (bs, tam) => { med.style.fontSize = tam + "px"; med.innerHTML = htmlBloques(bs); return med.scrollHeight <= disponible; };
  return repartir(bloques, cabe, TAMANOS_BOSQUEJO);
}

// Vuelve a disparar el fundido suave de la lámina o de la espera.
function entrar(el) { el.classList.remove("entra"); void el.offsetWidth; el.classList.add("entra"); }
function verLamina() { $("#escenario").classList.remove("en-espera"); $("#espera").hidden = true; $("#bosq").hidden = true; $("#lamina").hidden = false; entrar($("#lamina")); }
function verBosq() { $("#escenario").classList.remove("en-espera"); $("#espera").hidden = true; $("#lamina").hidden = true; $("#bosq").hidden = false; entrar($("#bosq")); }
const hayLamina = () => !$("#lamina").hidden || !$("#bosq").hidden;
function mostrarEspera() {
  const ya = !$("#espera").hidden;
  $("#lamina").hidden = true; $("#bosq").hidden = true; $("#espera").hidden = false; $("#escenario").classList.add("en-espera");
  if (!ya) entrar($("#espera"));
  recarga.alEspera();
}
function mostrarMensaje(ref, texto) {
  verLamina();
  $("#ref").textContent = ref; $("#pie").textContent = "";
  const t = $("#texto"); t.className = "texto aviso-texto"; t.style.fontSize = ""; t.textContent = texto;
}
function dibujar() {
  if (actual.bosq) return dibujarBosq();
  const { refBase, partes, tam, parte, pie } = actual;
  verLamina();
  $("#ref").textContent = partes.length > 1 ? refDeParte(refBase, partes[parte]) : etiquetaRef(refBase);
  $("#pie").textContent = partes.length > 1 ? `${pie} · ${parte + 1} de ${partes.length}` : pie ?? "";
  const t = $("#texto"); t.className = "texto"; t.style.fontSize = tam + "px"; t.innerHTML = htmlBloques(partes[parte]);
}
// Dibuja una lámina del bosquejo en #bosq: título, punto (con su versículo o el aviso) o ¡Recuerda!.
function dibujarBosq() {
  const { bosq, refBase, partes, tam, parte, pie } = actual;
  const { pub, lam, aviso } = bosq;
  let html;
  if (lam.tipo === "titulo") html = htmlTitulo(pub);
  else if (lam.tipo === "recuerda") html = htmlRecuerda(pub);
  else if (lam.v === null) html = htmlPunto(pub, lam.p); // un punto sin versículos: solo el encabezado
  else {
    const piePartes = partes.length > 1 ? `${pie} · ${parte + 1} de ${partes.length}` : pie ?? "";
    if (!refBase) html = htmlPunto(pub, lam.p, { aviso, pie: piePartes }); // sin Biblia cargada
    else if (aviso) html = htmlPunto(pub, lam.p, { ref: etiquetaRef(refBase), aviso, pie: piePartes });
    else html = htmlPunto(pub, lam.p, { ref: partes.length > 1 ? refDeParte(refBase, partes[parte]) : etiquetaRef(refBase), cuerpo: htmlBloques(partes[parte]), tam, pie: piePartes });
  }
  $("#bosq").innerHTML = html;
  verBosq();
}
// Le cuenta a la tablet qué hay en pantalla: código (o bosquejo y lámina), partes, versión, si faltan versículos y si hubo un error.
function publicarEstado() {
  if (!actual || !canal) return;
  const { codigo, bosq, partes, parte, sigla, completo, sinTexto, error } = actual;
  if (bosq) enviarEstado({ bosquejo: bosq.pub.id, lamina: bosq.i, partes: partes.length, parte, sigla, sinTexto, error });
  else enviarEstado({ codigo, partes: partes.length, parte, sigla, completo, sinTexto, error });
}
function enviarEstado(estado) {
  canal?.publicar(msgEstado(estado)).catch(e => console.warn("No se pudo avisar a la tablet", e));
}

// Calcula todo (carga, reparto, medidas) sin tocar lo que se ve. Devuelve el estado nuevo y qué dibujar.
async function prepararPasaje(m) {
  const ref = refDeCodigo(m.codigo);
  const { actual: sigla, versiones: ms, pasaje: r } = await cargarPasaje(biblias, ref, m.sigla, m.completo);
  const base = { codigo: m.codigo, completo: m.completo, sigla: sigla ?? undefined, parte: 0, tam: 48, sinTexto: 0, error: undefined };
  if (!sigla) return { actual: { ...base, refBase: ref, partes: [[]], error: "biblia" }, aviso: ["", "Carga una Biblia (F2)"] };
  const refBase = m.completo ? { ...ref, v1: null, v2: null } : ref;
  const sinTexto = r.sinTexto.length;
  if (!r.bloques.length) return { actual: { ...base, refBase, partes: [[]], sinTexto }, aviso: [etiquetaRef(refBase), "Este pasaje no está en las Biblias cargadas"] };
  const pie = ms.find(v => v.sigla === sigla)?.nombre || sigla;
  const { tam, partes } = repartirMidiendo(r.bloques, refBase, pie);
  return { actual: { ...base, refBase, partes, tam, sinTexto, pie, parte: Math.min(m.parte, partes.length - 1) } };
}

async function mostrarPasaje(m) {
  const p = await prepararPasaje(m);
  // Recién ahora se toca lo que ve la congregación.
  if (conf.rotar && p.actual.sigla && actual?.codigo !== m.codigo) { conf = guardarConf({ ...conf, fondo: conf.fondo % N_FONDOS + 1 }); pintarFondo(); }
  actual = p.actual;
  if (p.aviso) mostrarMensaje(...p.aviso);
  else dibujar();
  publicarEstado();
}

// Calcula una lámina del bosquejo sin tocar lo que se ve (igual que prepararPasaje). Título y ¡Recuerda! no necesitan Biblia;
// un punto con versículos carga el que toca (nunca más de uno por lámina). Devuelve el estado nuevo.
async function prepararLamina(m) {
  const pub = m.bosquejo, lam = laminasDe(pub)[m.i];
  if (!lam) throw new Error(`El bosquejo no tiene la lámina ${m.i}`);
  const bosq = { pub, i: m.i, lam };
  const base = { bosq, refBase: null, partes: [[]], tam: TAMANOS_BOSQUEJO[0], parte: 0, sigla: m.sigla, sinTexto: 0, error: undefined };
  if (lam.tipo !== "punto" || lam.v === null) return { actual: base };
  const codigos = pub.puntos[lam.p].versos, ref = refDeCodigo(codigos[lam.v]);
  if (!ref) throw new Error(`Versículo inválido: ${codigos[lam.v]}`);
  const { actual: sigla, versiones: ms, pasaje: r } = await cargarPasaje(biblias, ref, m.sigla, false);
  if (!sigla) return { actual: { ...base, sigla: undefined, error: "biblia", bosq: { ...bosq, aviso: "Carga una Biblia (F2)" } } };
  const nombre = ms.find(v => v.sigla === sigla)?.nombre || sigla;
  const pie = codigos.length > 1 ? `${nombre} · versículo ${lam.v + 1} de ${codigos.length}` : nombre;
  const sinTexto = r.sinTexto.length;
  if (!r.bloques.length) return { actual: { ...base, sigla, refBase: ref, pie, sinTexto, bosq: { ...bosq, aviso: "Este versículo no está en las Biblias cargadas" } } };
  const { tam, partes } = repartirBosq(r.bloques, ref, pie, pub, lam.p);
  return { actual: { ...base, sigla, refBase: ref, partes, tam, pie, sinTexto, parte: Math.min(m.parte, partes.length - 1) } };
}

async function mostrarLamina(m) {
  const p = await prepararLamina(m);
  // Recién ahora se toca lo que ve la congregación. El fondo cambia solo cuando empieza otro bosquejo, no de lámina en lámina.
  if (conf.rotar && actual?.bosq?.pub.id !== m.bosquejo.id) { conf = guardarConf({ ...conf, fondo: conf.fondo % N_FONDOS + 1 }); pintarFondo(); }
  actual = p.actual;
  dibujar();
  publicarEstado();
}

// Si algo falla al mostrar, la lámina lo dice con sobriedad y la tablet se entera.
function falloAlMostrar(m, e) {
  console.error("No se pudo mostrar", e);
  try {
    const bosq = m.tipo === "lamina" ? { pub: m.bosquejo, i: m.i } : actual?.bosq;
    if (bosq) {
      mostrarMensaje("", "No se pudo mostrar esta lámina");
      actual = { bosq, refBase: null, partes: [[]], parte: 0, tam: 48, sigla: m.sigla ?? actual?.sigla, sinTexto: 0, error: "mostrar" };
      return publicarEstado();
    }
    const codigo = m.tipo === "pasaje" ? m.codigo : actual?.codigo;
    mostrarMensaje("", "No se pudo mostrar este pasaje");
    if (!codigo) return;
    actual = { codigo, refBase: refDeCodigo(codigo), partes: [[]], parte: 0, tam: 48, sigla: m.sigla ?? actual?.sigla, completo: m.completo ?? actual?.completo, sinTexto: 0, error: "mostrar" };
    publicarEstado();
  } catch (e2) { console.error("Tampoco se pudo avisar del fallo", e2); }
}

function irAParte(n) {
  if (!actual || n < 0 || n >= actual.partes.length || n === actual.parte) return;
  actual.parte = n; dibujar(); publicarEstado();
}

// Un mensaje rechazado por hora adelantada se cuenta y se le avisa a la tablet (como máximo cada 10 s).
function avisarReloj() {
  if (orden.ultimoRechazo !== "reloj" || Date.now() - ultimoAvisoReloj < 10000) return;
  ultimoAvisoReloj = Date.now();
  enviarEstado({ error: "reloj" });
}

async function aplicar(m) {
  if (m.de !== "tablet") return;
  if (!orden(m)) return avisarReloj();
  if (m.tipo === "pasaje") return mostrarPasaje(m);
  if (m.tipo === "lamina") return mostrarLamina(m);
  if (m.tipo === "parte") return irAParte(Math.min(m.parte, (actual?.partes.length ?? 1) - 1));
  if (m.tipo === "espera") { actual = null; mostrarEspera(); }
  if (m.tipo === "consulta") contestarConsulta();
}
// La tablet pregunta qué hay en pantalla: el pasaje actual o que está en espera.
function contestarConsulta() { if (actual) publicarEstado(); else enviarEstado({ espera: true }); }
const encolar = m => { cola = cola.then(() => aplicar(m)).catch(e => falloAlMostrar(m, e)); };

// Pide lo reciente (reintenta cada 10 s hasta lograrlo) y repite el último pasaje si no es viejo. Lo ya aplicado lo descarta `orden`.
async function cargarRecientes(mi) {
  if (cargando) return;
  cargando = true;
  const c = canal;
  try {
    const ms = await recientesHastaLograr(c, "tablet", { vigente: () => mi === gen, alFallo: f => { fallaRecientes = f; pintarPunto(); } });
    if (ms) {
      paraArrancar(ms, Date.now()).forEach(encolar);
      await cola;
      // Arrancó (o reconectó) en espera: se le avisa a la tablet, que si no seguiría diciendo "En pantalla".
      if (mi === gen && !actual) enviarEstado({ espera: true });
    }
  } finally { if (mi === gen) cargando = false; }
}

async function conectar() {
  cerrarCanal?.();
  const mi = ++gen;
  cargando = false; conectado = null; fallaRecientes = false; pintarPunto();
  canal = crearCanal(temaDe(conf.codigo));
  orden = crearOrden();
  cerrarCanal = canal.escuchar(encolar, ok => { conectado = ok; pintarPunto(); pintarPanel(); }, () => cargarRecientes(mi));
  await cargarRecientes(mi); // al abrir o recargar: el último pasaje (o espera) y los cambios de parte posteriores
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
function alternarPanel() { const p = $("#panel"); p.hidden = !p.hidden; document.body.classList.toggle("con-panel", !p.hidden); pintarPanel(); }

document.addEventListener("click", async ev => {
  const t = ev.target.closest("button");
  if (!t) return;
  if (t.dataset.accion === "cerrar") return alternarPanel();
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
    await cargarBiblia(archivo, biblias, { avisar: aviso, dispositivo: "esta PC",
      pedirSigla: () => prompt("¿Qué sigla le ponemos a esta versión? (por ejemplo TLA)"),
      confirmar: sigla => confirm(`Ya hay una versión ${sigla}. ¿Reemplazarla?`) });
  } catch (e) {
    console.error("Cargar Biblia:", e);
    aviso(e instanceof ErrorBiblia ? e.message : "No se pudo cargar la Biblia.", e?.cancelada ? 3500 : 8000);
  }
  pintarPanel();
});

document.addEventListener("keydown", ev => {
  if (ev.key === "F2") { ev.preventDefault(); return alternarPanel(); }
  if (ev.target.closest?.("input")) return;
  if (ev.key === "ArrowRight" && actual) irAParte(actual.parte + 1);
  if (ev.key === "ArrowLeft" && actual) irAParte(actual.parte - 1);
  if (ev.key === "Escape") { actual = null; mostrarEspera(); enviarEstado({ espera: true }); }
});

addEventListener("resize", escalar);
escalar();
pintarFondo();
mostrarEspera();
navigator.storage?.persist?.().catch?.(() => {});
if ("serviceWorker" in navigator) {
  // La PC de la iglesia nadie la toca: cuando llega una versión nueva, se recarga sola (si ya había una funcionando),
  // pero nunca con un pasaje en pantalla: si lo hay, espera a que pase a la lámina de espera.
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habia) recarga.nuevaVersion(hayLamina()); });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
conectar();
