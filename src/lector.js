// Lector a pantalla completa y su barra fija: partes, plan del domingo y pantalla de proyección.
// pintarLector() solo dibuja; lo único que publica después de un pintado es sincronizarProyeccion().
import { cargarPasaje, etiquetaRef, capituloVecino, versiculoVecino, refDeCodigo } from "./pasaje.js";
import { seguirTrasAtras } from "./lectura.js";
import { crearCanal } from "./proyeccion/canal.js";
import { temaDe, msgPasaje, msgParte, msgEspera, msgConsulta } from "./proyeccion/mensajes.js";
import { esc, aviso } from "./ui.js";
import { LETRAS } from "./datos.js";

const $ = s => document.querySelector(s);
const enc = o => encodeURIComponent(JSON.stringify(o));
const ic = (id, extra = "") => `<svg class="ico" ${extra}><use href="#i-${id}"/></svg>`;
const SIN_RED = "Sin conexión: no se pudo enviar a la pantalla";
const CLAVE_PROY = "uc-proy"; // sessionStorage: qué se está proyectando (solo referencias, nunca texto bíblico)
const ERRORES = {
  mostrar: "La pantalla no pudo mostrar el pasaje",
  reloj: "La hora de la tablet y la de la PC no coinciden",
  biblia: "La PC no tiene una Biblia cargada",
};
const FALTAN = "Faltan versículos en la Biblia de la PC";
const EN_ESPERA = "La pantalla de la iglesia quedó en espera";

// Lo que tiene la pantalla del templo. "seguir": los cambios del pasaje proyectado (capítulo, versión, cita del plan)
// salen solos; una cita suelta espera a "Proyectar". "fallo": clave que no se pudo enviar (no se reintenta sola).
// "confirmado": la pantalla respondió con el mismo código; "esperando": desde cuándo se espera su respuesta.
export const proy = { activo: false, seguir: false, enviado: null, codigo: null, completo: null, sigla: null, partes: 1, parte: 0,
  esperando: null, confirmado: false, error: null, sinTexto: 0, fallo: null, respuesta: null };
let canal = null, cerrar = null, almacen = null, biblias = null;
// Ganchos de la presentación del bosquejo (src/bosquejo/presentar.js): recibe los estados de la pantalla que traen `bosquejo`
// y se entera cuando se proyecta un pasaje (entonces la lámina del bosquejo ya no está en pantalla).
let enEstadoBosquejo = null, enProyectarPasaje = null;
export const alEstadoBosquejo = fn => { enEstadoBosquejo = typeof fn === "function" ? fn : null; };
export const alProyectarPasaje = fn => { enProyectarPasaje = typeof fn === "function" ? fn : null; };
let mostrada = { lectura: null, sigla: null }, principal = null, listo = Promise.resolve(), gen = 0, envioNo = 0;
// Reloj, temporizador y fábrica del canal se inyectan para probar sin esperar ni red.
let ahora = () => Date.now(), esperar = (f, ms) => setTimeout(f, ms), fabricaCanal = crearCanal;

export function iniciarLector(deps) {
  ({ almacen, biblias } = deps);
  ahora = deps.ahora ?? (() => Date.now());
  esperar = deps.esperar ?? ((f, ms) => setTimeout(f, ms));
  fabricaCanal = deps.crearCanal ?? crearCanal;
  restaurarProy();
}

// Lo último dibujado (para pruebas y para saber qué versión se ve).
export const lecturaMostrada = () => mostrada;

// Guarda la proyección en sessionStorage cada vez que cambia, así tras recargar la tablet sigue el botón "Quitar".
function guardarProy() {
  try {
    const { activo, enviado, codigo, partes, parte, sigla, completo, error } = proy;
    sessionStorage.setItem(CLAVE_PROY, JSON.stringify({ activo, enviado, codigo, partes, parte, sigla, completo, error, pantalla: almacen?.config().pantalla ?? null }));
  } catch { /* sin almacenamiento */ }
}
function restaurarProy() {
  try {
    const d = JSON.parse(sessionStorage.getItem(CLAVE_PROY));
    if (!d || d.activo !== true || typeof d.enviado !== "string" || !d.pantalla || d.pantalla !== almacen.config().pantalla) return;
    if (!refDeCodigo(d.codigo) || !Number.isInteger(d.partes) || d.partes < 1 || !Number.isInteger(d.parte) || d.parte < 0 || d.parte >= d.partes) return;
    // Tras recargar no se sabe qué muestra la PC ahora (pudo pasar a espera o fallar): nunca se da por confirmado.
    // La barra dice "Sin confirmar" con Reintentar y Quitar; se conserva el error que la pantalla había avisado.
    Object.assign(proy, { activo: true, enviado: d.enviado, codigo: d.codigo, partes: d.partes, parte: d.parte,
      sigla: typeof d.sigla === "string" ? d.sigla : null, completo: typeof d.completo === "boolean" ? d.completo : null,
      confirmado: false, restaurado: true, esperando: null, error: ERRORES[d.error] ? d.error : null, sinTexto: 0, fallo: null });
  } catch { /* sin almacenamiento o dato dañado */ }
}
// Cambió algo de la proyección: se guarda y se redibuja la barra.
function cambio() { guardarProy(); pintarBarra(); }

function recibirEstado(m) {
  if (m.de !== "pantalla" || m.tipo !== "estado") return;
  proy.respuesta = ahora();
  if (m.bosquejo !== undefined) return enEstadoBosquejo?.(m); // una lámina del bosquejo: la lógica del pasaje no se entera
  if (m.espera) { // la pantalla quedó en espera por su cuenta (se reinició o pulsaron Esc en la PC)
    if (!proy.activo || proy.esperando !== null) return; // si se acaba de enviar algo, manda la respuesta a ese envío
    soltarPantalla();
    aviso(EN_ESPERA, 6000);
    return pintarBarra();
  }
  if (m.codigo === undefined) { // error sin pasaje (la hora no coincide): solo importa si se está esperando respuesta
    if (proy.esperando === null) return;
    Object.assign(proy, { error: m.error, esperando: null });
    aviso(ERRORES[m.error], 6000);
    return cambio();
  }
  if (m.codigo !== proy.codigo || (m.completo !== undefined && proy.completo !== null && m.completo !== proy.completo)) return;
  Object.assign(proy, { partes: m.partes, parte: m.parte, esperando: null, confirmado: true, restaurado: false, error: m.error ?? null, sinTexto: m.sinTexto ?? 0 });
  if (m.error) aviso(ERRORES[m.error], 6000);
  else if (m.sinTexto) aviso(FALTAN, 6000);
  cambio();
}

export function conectarPantalla() {
  cerrar?.(); cerrar = canal = null;
  const codigo = almacen.config().pantalla;
  if (!codigo) return;
  canal = fabricaCanal(temaDe(codigo));
  cerrar = canal.escuchar(recibirEstado, undefined, consultarPantalla);
  consultarPantalla(); // tras recargar con algo proyectado: que la pantalla diga qué muestra
}
// Pregunta a la pantalla qué muestra (solo si la tablet cree que hay algo proyectado). La respuesta llega por recibirEstado.
export function consultarPantalla() {
  if (!canal || !proy.activo) return;
  canal.publicar(msgConsulta(ahora())).catch(() => { /* sin red: la barra ya dice "Sin confirmar" */ });
}
export const hayPantalla = () => !!canal;
// El canal de la pantalla conectada (o null): la presentación del bosquejo publica por el mismo.
export const canalPantalla = () => canal;

const claveDe = (lectura, sigla) => `${lectura.cita.codigo}|${sigla}|${lectura.completo}`;

// Tres estados honestos: "Enviando…" hasta que la pantalla confirma, "En pantalla" solo tras su confirmación,
// "Sin respuesta" si no contesta en 5 s o si publicar falló. Si la pantalla contesta con un error, se dice cuál.
export function estadoEnvio() {
  if (proy.error) return { tipo: "error", texto: ERRORES[proy.error] ?? ERRORES.mostrar };
  const tarde = proy.esperando !== null && ahora() - proy.esperando > 5000;
  if (proy.restaurado && !proy.confirmado && proy.esperando === null && !proy.fallo) return { tipo: "sin", texto: "Sin confirmar" };
  if (proy.fallo || tarde || (!proy.confirmado && proy.esperando === null)) return { tipo: "sin", texto: "Sin respuesta" };
  if (proy.esperando !== null) return { tipo: "enviando", texto: "Enviando…" };
  return { tipo: "ok", texto: proy.sinTexto ? "En pantalla · faltan versículos" : "En pantalla" };
}
export const sinRespuesta = () => estadoEnvio().tipo === "sin";
export function soltarPantalla() {
  Object.assign(proy, { activo: false, seguir: false, enviado: null, fallo: null, esperando: null, confirmado: false, restaurado: false, error: null, sinTexto: 0 });
  guardarProy();
}

// Aviso según por qué falló publicar: ntfy rechazó (con su código) o no hubo red.
export const textoFallo = e => e?.tipo === "rechazo" ? `El servicio de mensajes rechazó el envío (código ${e.codigo})` : SIN_RED;

// Devuelve si se pudo publicar. La clave se calcula antes de esperar: la lectura puede cambiar mientras tanto.
// El estado pasa a "Enviando…" al tocar; si publicar falla se deja como estaba y queda "Sin respuesta".
export async function enviarPasaje(lectura, sigla) {
  if (!canal) return false;
  const clave = claveDe(lectura, sigla);
  const m = msgPasaje({ codigo: lectura.cita.codigo, sigla, completo: lectura.completo, parte: 0 }, ahora());
  const previo = { ...proy }, mio = ++envioNo;
  Object.assign(proy, { activo: true, enviado: clave, codigo: m.codigo, completo: lectura.completo, sigla, partes: 1, parte: 0,
    esperando: ahora(), confirmado: false, error: null, sinTexto: 0, fallo: null });
  cambio();
  try { await canal.publicar(m); }
  catch (e) {
    if (mio === envioNo) {
      const { activo, enviado, codigo, completo, sigla: s, partes, parte, esperando, confirmado, error, sinTexto } = previo;
      Object.assign(proy, { activo, enviado, codigo, completo, sigla: s, partes, parte, esperando, confirmado, error, sinTexto, fallo: clave });
    }
    aviso(textoFallo(e), 6000); cambio(); return false;
  }
  esperar(pintarBarra, 5200);
  enProyectarPasaje?.(); // ya se publicó el pasaje: una presentación del bosquejo en curso se suelta
  return true;
}

// Reenvía lo que se ve si la pantalla lo sigue y todavía no lo tiene (ni falló ya con eso).
export async function sincronizarProyeccion() {
  const { lectura, sigla } = mostrada;
  if (!lectura || !proy.activo || !proy.seguir || !canal) return;
  const clave = claveDe(lectura, sigla);
  if (clave === proy.enviado || clave === proy.fallo) return;
  if (await enviarPasaje(lectura, sigla)) aviso(`Enviando a la pantalla: ${titulo(lectura)} · ${sigla}`, 3000);
}

// "Proyectar" y "Empezar sermón": espera a que el lector termine de pintar para saber qué versión se ve.
export async function proyectarActual() {
  await listo;
  if (!mostrada.lectura) return;
  proy.seguir = true; proy.fallo = null;
  await enviarPasaje(mostrada.lectura, mostrada.sigla);
}

export async function reintentar() { proy.fallo = null; proy.esperando = null; proy.error = null; await proyectarActual(); }

export async function cambiarParte(paso) {
  const n = proy.parte + paso;
  if (!canal || n < 0 || n >= proy.partes) return;
  const previo = { parte: proy.parte, esperando: proy.esperando }, mio = ++envioNo;
  Object.assign(proy, { parte: n, esperando: ahora() });
  try { await canal.publicar(msgParte(n, ahora())); }
  catch (e) {
    if (mio === envioNo) Object.assign(proy, previo);
    aviso(textoFallo(e), 6000); return cambio();
  }
  esperar(pintarBarra, 5200);
  cambio();
}

export async function quitarDePantalla() {
  if (canal) try { await canal.publicar(msgEspera(ahora())); } catch (e) { return aviso(textoFallo(e), 6000); }
  soltarPantalla(); pintarBarra();
}

// ---------- Pantalla encendida mientras se lee ----------
// Wake Lock: la tablet no se apaga con el lector abierto. El navegador lo suelta solo al ocultarse la app.
let luz = null, luzQuiere = false, luzPidiendo = false;
async function pedirLuz() {
  if (!luzQuiere || luz || luzPidiendo || globalThis.document?.visibilityState === "hidden") return;
  luzPidiendo = true;
  try {
    const l = await globalThis.navigator?.wakeLock?.request?.("screen");
    if (!l) return;
    if (!luzQuiere) return void l.release?.().catch?.(() => {}); // se salió del lector mientras se pedía
    luz = l;
    l.addEventListener?.("release", () => { if (luz === l) luz = null; });
  } catch { /* sin permiso o sin soporte: no pasa nada */ }
  finally { luzPidiendo = false; }
}
// activa=true en el lector, false al salir. Se puede llamar en cada pintado: no pide dos veces.
export function luzDelLector(activa) {
  luzQuiere = !!activa;
  if (luzQuiere) return pedirLuz();
  const l = luz; luz = null;
  try { return Promise.resolve(l?.release?.()).catch(() => {}); } catch { return Promise.resolve(); }
}
// Al volver a la app (visibilitychange): si sigue en el lector, se vuelve a pedir.
export const luzAlVolver = () => (luzQuiere ? pedirLuz() : undefined);

// Al volver con Atrás: la pantalla sigue solo si se volvió justo al pasaje que tiene.
export function alVolver(lectura) { proy.seguir = seguirTrasAtras(proy, claveDe(lectura, lectura.sigla ?? principal)); }

const titulo = l => l.completo && l.ref.v1 ? etiquetaRef({ ...l.ref, v1: null, v2: null }) : l.cita.etiqueta;

export function vistaLector(lectura) {
  return `<section class="lector"><header class="l-cab"><button class="ib" data-volver aria-label="Volver">${ic("izq")}</button>
    <button class="btn-ini" data-inicio>${ic("casa")}Inicio</button>
    <h1 class="l-ref">${esc(titulo(lectura))}</h1>
    <button class="ib" data-buscar aria-label="Buscar">${ic("bus")}</button>
    <div class="l-herr"><span class="letra-g" role="group" aria-label="Tamaño de letra"><button data-letra-paso="-1" aria-label="Letra más chica">A−</button><button data-letra-paso="1" aria-label="Letra más grande">A+</button></span>
      <button class="ib" data-tema-cambiar id="l-tema"></button>
      <span class="versiones" id="l-versiones" role="group" aria-label="Versión"></span></div></header>
    <div class="l-cuerpo" id="l-cuerpo"><p class="meta">Abriendo…</p></div>
    <nav class="l-cap" id="l-cap"></nav>
    <footer class="barra" id="l-barra" hidden></footer></section>`;
}

// Dibuja el pasaje (sin publicar nada) y deja anotado qué versión se ve.
export function pintarLector(lectura) {
  listo = dibujar(lectura);
  return listo;
}

async function dibujar(lectura) {
  // Cada dibujo toma un número: si mientras espera llega otro más nuevo, este se descarta y nunca pisa al nuevo.
  const mi = ++gen, cuerpo = $("#l-cuerpo");
  const { actual, versiones, pasaje: r } = await cargarPasaje(biblias, lectura.ref, lectura.sigla, lectura.completo);
  if (mi !== gen) return;
  const princ = await biblias.principal();
  if (mi !== gen || !cuerpo?.isConnected) return;
  principal = princ;
  if (!actual) {
    mostrada = { lectura: null, sigla: null };
    $("#l-cap").innerHTML = "";
    cuerpo.innerHTML = `<div class="card form"><h2>Todavía no hay una Biblia cargada</h2><p class="meta">Carga una Biblia en Configuración → Versiones de la Biblia.</p>
      <div><button class="btn pri" data-ir="config">Ir a Configuración</button></div></div>`;
    return pintarBarra();
  }
  const { codigo, cap, v1 } = lectura.ref;
  const antes = capituloVecino(codigo, cap, -1), despues = capituloVecino(codigo, cap, 1);
  // Versículo anterior/siguiente: solo cuando se lee un pasaje (no el capítulo completo).
  const leer = (c, k) => biblias.capitulo(actual, c, k);
  const [vAnt, vSig] = lectura.completo ? [null, null] : await Promise.all([versiculoVecino(lectura.ref, -1, leer), versiculoVecino(lectura.ref, 1, leer)]);
  if (mi !== gen || !cuerpo.isConnected) return;
  // Todo lo que hacía falta ya está calculado: recién ahora se anota qué versión se ve y se toca la pantalla.
  mostrada = { lectura, sigla: actual };
  $("#l-versiones").innerHTML = versiones.map(m => `<button class="${m.sigla === actual ? "on" : ""}" aria-pressed="${m.sigla === actual}" data-version="${esc(m.sigla)}">${esc(m.sigla)}</button>`).join("");
  pintarHerramientas();
  const texto = r.bloques.map(b => `<span class="vers${b.sigla ? " relleno" : ""}"><b class="num">${esc(b.etiqueta)}</b>${esc(b.texto)}${b.sigla ? ` <small class="de">${esc(b.sigla)}</small>` : ""}</span>`).join(" ");
  const relleno = r.rellenoDe.length ? `<p class="aviso-relleno">Este pasaje no está en tu archivo ${esc(actual)}; se muestra en ${esc(r.rellenoDe.join(" y "))}</p>` : "";
  const falta = r.vacio ? `<p class="meta">Este capítulo no está en las Biblias cargadas.</p>`
    : r.sinTexto.length ? `<p class="meta">${r.bloques.length ? `Versículo${r.sinTexto.length > 1 ? "s" : ""} ${esc(r.sinTexto.join(", "))}: ` : ""}Este versículo no está en las Biblias cargadas.</p>` : "";
  cuerpo.innerHTML = `<div class="l-texto">${relleno}<p class="texto-biblia" lang="es">${texto}</p>${falta}</div>`;
  const vers = !lectura.completo;
  // Izquierda: versículo anterior, capítulo completo y siguiente. Derecha: capítulo ‹ › y favoritos.
  const izq = [
    vers && `<button ${vAnt ? `data-versiculo="${enc(vAnt)}"` : "disabled"}>‹ Versículo anterior</button>`,
    v1 && `<button data-completo>${lectura.completo ? "Ver solo el pasaje" : "Ver capítulo completo"}</button>`,
    vers && `<button ${vSig ? `data-versiculo="${enc(vSig)}"` : "disabled"}>Versículo siguiente ›</button>`,
  ].filter(Boolean).join("");
  $("#l-cap").innerHTML = `<div class="l-vers">${izq}</div><div class="l-capg"><span class="eti-cap">Capítulo</span>
    <button class="ib" ${antes ? `data-capitulo="${enc(antes)}"` : "disabled"} aria-label="Capítulo anterior">${ic("izq")}</button>
    <button class="ib" ${despues ? `data-capitulo="${enc(despues)}"` : "disabled"} aria-label="Capítulo siguiente">${ic("der")}</button>
    <button class="ib estrella" data-fav="${enc(lectura.cita)}" aria-label="Guardar en favoritos">${ic("est")}</button></div>`;
  pintarBarra();
}

// A− / A+ y el botón de tema del encabezado, según Configuración (se repinta sin volver a dibujar el texto).
export function pintarHerramientas() {
  const c = almacen?.config(), i = LETRAS.indexOf(c?.letra), tema = $("#l-tema");
  const [menos, mas] = document.querySelectorAll?.("[data-letra-paso]") ?? [];
  if (menos) menos.disabled = i <= 0;
  if (mas) mas.disabled = i >= LETRAS.length - 1;
  if (!tema) return;
  const oscuro = c?.tema === "oscuro";
  tema.setAttribute?.("aria-label", oscuro ? "Modo claro" : "Modo oscuro");
  tema.innerHTML = ic(oscuro ? "sol" : "luna");
}

// Lo que tiene la pantalla de la iglesia, en una línea: "Juan 3:16-17 · RVR 1960".
function lineaPantalla() {
  const r = refDeCodigo(proy.codigo);
  if (!r) return "";
  return `${etiquetaRef(proy.completo ? { ...r, v1: null, v2: null } : r)}${proy.sigla ? ` · ${proy.sigla}` : ""}`;
}

function planDe(lectura) {
  const dom = lectura?.domingo;
  const d = dom && almacen.domingos().find(x => x.id === dom.id);
  return d?.citas[dom.i] ? { d, i: dom.i } : null;
}

export function pintarBarra() {
  const b = $("#l-barra");
  if (!b) return;
  const lectura = mostrada.lectura, plan = planDe(lectura);
  const enEsta = proy.activo && lectura && claveDe(lectura, mostrada.sigla) === proy.enviado;
  const quedan = enEsta && proy.parte < proy.partes - 1;
  // Tres zonas: el texto que está en pantalla (partes), el plan del domingo y qué tiene la pantalla de la iglesia.
  const partes = enEsta && proy.partes > 1 ? `<div class="zona partes"><span class="z-eti">Texto en pantalla</span><div class="z-fila">
      <button class="btn" data-parte="-1" ${proy.parte <= 0 ? "disabled" : ""} aria-label="Texto anterior">${ic("izq")}</button>
      <span class="cnt">${proy.parte + 1} de ${proy.partes}</span>
      <button class="btn ${quedan ? "hay-mas" : ""}" data-parte="1" ${quedan ? "" : "disabled"}>Más texto${ic("der")}</button></div></div>` : "";
  let planHTML = "";
  if (plan) {
    const { d, i } = plan, n = d.citas.length, sig = d.citas[i + 1];
    planHTML = `<div class="zona plan-g">${i > 0 ? `<button class="btn" data-dom-paso="-1">${ic("izq")}Cita ${i}</button>` : ""}
      <span class="plan"><b>Cita ${i + 1} de ${n}</b><small>${sig ? `sigue ${esc(sig.etiqueta)}` : "última del plan"}</small></span>
      ${sig ? `<button class="btn ${quedan ? "marino" : "hay-mas"}" data-dom-paso="1">Siguiente cita${ic("der")}</button>` : ""}</div>`;
  }
  const quitar = proy.activo ? `<button class="btn peli quitar" data-quitar-pantalla>Quitar</button>` : "";
  const enPantalla = proy.activo ? `<span class="que">${esc(lineaPantalla())}</span>` : "";
  // "En pantalla" solo si lo que se lee es lo proyectado; con otra cita abierta se dice qué hay y se ofrece Proyectar (y Quitar).
  let der = "";
  if (proy.fallo || enEsta) {
    const e = estadoEnvio(), mal = e.tipo === "sin" || e.tipo === "error";
    const texto = e.tipo === "ok" && !proy.sinTexto ? "En pantalla ahora" : e.texto;
    der = `<div class="zona der"><span class="estado-z"><span class="estado ${mal ? "mal" : e.tipo === "enviando" ? "envio" : ""}"><i></i>${esc(texto)}</span>${enPantalla}</span>
      ${mal ? `<button class="btn" data-reintentar>Reintentar</button>` : ""}${quitar}</div>`;
  } else if (canal && lectura) der = `<div class="zona der">${proy.activo ? `<span class="estado-z"><span class="estado otra"><i></i>${proy.confirmado ? "En pantalla ahora" : "Enviado a la pantalla"}</span>${enPantalla}</span>` : ""}
    <button class="btn pri" data-proyectar>${ic("pant")}Proyectar</button>${quitar}</div>`;
  b.hidden = !(partes || planHTML || der);
  b.innerHTML = partes + planHTML + der;
}
