// Lector a pantalla completa y su barra fija: partes, plan del domingo y pantalla de proyección.
// pintarLector() solo dibuja; lo único que publica después de un pintado es sincronizarProyeccion().
import { cargarPasaje, etiquetaRef, capituloVecino, versiculoVecino } from "./pasaje.js";
import { seguirTrasAtras } from "./lectura.js";
import { crearCanal } from "./proyeccion/canal.js";
import { temaDe, msgPasaje, msgParte, msgEspera } from "./proyeccion/mensajes.js";
import { esc, aviso } from "./ui.js";

const $ = s => document.querySelector(s);
const enc = o => encodeURIComponent(JSON.stringify(o));
const ic = (id, extra = "") => `<svg class="ico" ${extra}><use href="#i-${id}"/></svg>`;
const SIN_RED = "Sin conexión: no se pudo enviar a la pantalla";

// Lo que tiene la pantalla del templo. "seguir": los cambios del pasaje proyectado (capítulo, versión, cita del plan)
// salen solos; una cita suelta espera a "Proyectar". "fallo": clave que no se pudo enviar (no se reintenta sola).
export const proy = { activo: false, seguir: false, enviado: null, codigo: null, partes: 1, parte: 0, esperando: null, fallo: null, respuesta: null };
let canal = null, cerrar = null, almacen = null, biblias = null;
let mostrada = { lectura: null, sigla: null }, principal = null, listo = Promise.resolve();

export function iniciarLector(deps) { ({ almacen, biblias } = deps); }

export function conectarPantalla() {
  cerrar?.(); cerrar = canal = null;
  const codigo = almacen.config().pantalla;
  if (!codigo) return;
  canal = crearCanal(temaDe(codigo));
  cerrar = canal.escuchar(m => {
    if (m.de !== "pantalla" || m.tipo !== "estado") return;
    proy.respuesta = Date.now();
    if (m.codigo !== proy.codigo) return;
    Object.assign(proy, { partes: m.partes, parte: m.parte, esperando: null });
    pintarBarra();
  });
}
export const hayPantalla = () => !!canal;

const claveDe = (lectura, sigla) => `${lectura.cita.codigo}|${sigla}|${lectura.completo}`;
export const sinRespuesta = () => !!proy.fallo || !!(proy.esperando && Date.now() - proy.esperando > 5000);
export function soltarPantalla() { Object.assign(proy, { activo: false, seguir: false, enviado: null, fallo: null, esperando: null }); }

// Devuelve si se pudo publicar. La clave se calcula antes de esperar: la lectura puede cambiar mientras tanto.
export async function enviarPasaje(lectura, sigla) {
  if (!canal) return false;
  const clave = claveDe(lectura, sigla);
  const m = msgPasaje({ codigo: lectura.cita.codigo, sigla, completo: lectura.completo, parte: 0 });
  try { await canal.publicar(m); }
  catch { proy.fallo = clave; aviso(SIN_RED, 6000); pintarBarra(); return false; }
  Object.assign(proy, { activo: true, enviado: clave, codigo: m.codigo, partes: 1, parte: 0, esperando: Date.now(), fallo: null });
  setTimeout(pintarBarra, 5200);
  pintarBarra();
  return true;
}

// Reenvía lo que se ve si la pantalla lo sigue y todavía no lo tiene (ni falló ya con eso).
export async function sincronizarProyeccion() {
  const { lectura, sigla } = mostrada;
  if (!lectura || !proy.activo || !proy.seguir || !canal) return;
  const clave = claveDe(lectura, sigla);
  if (clave === proy.enviado || clave === proy.fallo) return;
  if (await enviarPasaje(lectura, sigla)) aviso(`En pantalla: ${titulo(lectura)} · ${sigla}`, 3000);
}

// "Proyectar" y "Empezar sermón": espera a que el lector termine de pintar para saber qué versión se ve.
export async function proyectarActual() {
  await listo;
  if (!mostrada.lectura) return;
  proy.seguir = true; proy.fallo = null;
  await enviarPasaje(mostrada.lectura, mostrada.sigla);
}

export async function reintentar() { proy.fallo = null; proy.esperando = null; await proyectarActual(); }

export async function cambiarParte(paso) {
  const n = proy.parte + paso;
  if (!canal || n < 0 || n >= proy.partes) return;
  try { await canal.publicar(msgParte(n)); } catch { return aviso(SIN_RED, 6000); }
  Object.assign(proy, { parte: n, esperando: Date.now() });
  setTimeout(pintarBarra, 5200);
  pintarBarra();
}

export async function quitarDePantalla() {
  if (canal) try { await canal.publicar(msgEspera()); } catch { return aviso(SIN_RED, 6000); }
  soltarPantalla(); pintarBarra();
}

// Al volver con Atrás: la pantalla sigue solo si se volvió justo al pasaje que tiene.
export function alVolver(lectura) { proy.seguir = seguirTrasAtras(proy, claveDe(lectura, lectura.sigla ?? principal)); }

const titulo = l => l.completo && l.ref.v1 ? etiquetaRef({ ...l.ref, v1: null, v2: null }) : l.cita.etiqueta;

export function vistaLector(lectura) {
  return `<section class="lector"><header class="l-cab"><button class="ib" data-volver aria-label="Volver">${ic("izq")}</button>
    <h1 class="ref">${esc(titulo(lectura))}</h1>
    <button class="ib" data-buscar aria-label="Buscar">${ic("bus")}</button><span class="versiones" id="l-versiones"></span></header>
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
  const cuerpo = $("#l-cuerpo");
  const { actual, versiones, pasaje: r } = await cargarPasaje(biblias, lectura.ref, lectura.sigla, lectura.completo);
  principal = await biblias.principal();
  if (!cuerpo?.isConnected) return;
  if (!actual) {
    mostrada = { lectura: null, sigla: null };
    $("#l-cap").innerHTML = "";
    cuerpo.innerHTML = `<div class="card form"><h2>Todavía no hay una Biblia cargada</h2><p class="meta">Carga una Biblia en Configuración → Versiones de la Biblia.</p>
      <div><button class="btn pri" data-ir="config">Ir a Configuración</button></div></div>`;
    return pintarBarra();
  }
  mostrada = { lectura, sigla: actual };
  const { codigo, cap, v1 } = lectura.ref;
  $("#l-versiones").innerHTML = versiones.map(m => `<button class="${m.sigla === actual ? "on" : ""}" data-version="${esc(m.sigla)}">${esc(m.sigla)}</button>`).join("");
  const antes = capituloVecino(codigo, cap, -1), despues = capituloVecino(codigo, cap, 1);
  // Versículo anterior/siguiente: solo cuando se lee un pasaje (no el capítulo completo).
  const leer = (c, k) => biblias.capitulo(actual, c, k);
  const [vAnt, vSig] = lectura.completo ? [null, null] : await Promise.all([versiculoVecino(lectura.ref, -1, leer), versiculoVecino(lectura.ref, 1, leer)]);
  if (!cuerpo.isConnected) return;
  const texto = r.bloques.map(b => `<span class="vers${b.sigla ? " relleno" : ""}"><b class="num">${esc(b.etiqueta)}</b>${esc(b.texto)}${b.sigla ? ` <small class="de">${esc(b.sigla)}</small>` : ""}</span>`).join(" ");
  const relleno = r.rellenoDe.length ? `<p class="aviso-relleno">Este pasaje no está en tu archivo ${esc(actual)}; se muestra en ${esc(r.rellenoDe.join(" y "))}</p>` : "";
  const falta = r.vacio ? `<p class="meta">Este capítulo no está en las Biblias cargadas.</p>`
    : r.sinTexto.length ? `<p class="meta">${r.bloques.length ? `Versículo${r.sinTexto.length > 1 ? "s" : ""} ${esc(r.sinTexto.join(", "))}: ` : ""}Este versículo no está en las Biblias cargadas.</p>` : "";
  cuerpo.innerHTML = `<div class="l-texto">${relleno}<p class="texto-biblia" lang="es">${texto}</p>${falta}</div>`;
  const vers = !lectura.completo;
  $("#l-cap").innerHTML = `<button class="cap" ${antes ? `data-capitulo="${enc(antes)}"` : "disabled"}>‹ Capítulo</button>
    ${vers ? `<button class="vers-b" ${vAnt ? `data-versiculo="${enc(vAnt)}"` : "disabled"}>‹ Versículo anterior</button>` : ""}
    ${v1 ? `<button data-completo>${lectura.completo ? "Ver solo el pasaje" : "Ver capítulo completo"}</button>` : ""}
    ${vers ? `<button class="vers-b" ${vSig ? `data-versiculo="${enc(vSig)}"` : "disabled"}>Versículo siguiente ›</button>` : ""}
    <button class="cap" ${despues ? `data-capitulo="${enc(despues)}"` : "disabled"}>Capítulo ›</button>
    <button class="estrella" data-fav="${enc(lectura.cita)}" aria-label="Guardar en favoritos">${ic("est")}</button>`;
  pintarBarra();
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
  const partes = enEsta && proy.partes > 1 ?`<div class="grupo partes">
      <button class="btn" data-parte="-1" ${proy.parte <= 0 ? "disabled" : ""} aria-label="Texto anterior">${ic("izq")}</button>
      <span class="cnt">${proy.parte + 1}/${proy.partes}</span>
      <button class="btn ${quedan ? "hay-mas" : ""}" data-parte="1" ${quedan ? "" : "disabled"}>Más texto${ic("der")}</button></div>` : "";
  let planHTML = "";
  if (plan) {
    const { d, i } = plan, n = d.citas.length, sig = d.citas[i + 1];
    planHTML = `<div class="grupo plan-g">${i > 0 ? `<button class="btn" data-dom-paso="-1" aria-label="Cita anterior">${ic("izq")}</button>` : ""}
      <span class="plan"><b>Cita ${i + 1} de ${n}</b><br>${sig ? `sigue ${esc(sig.etiqueta)}` : "última del plan"}</span>
      ${sig ? `<button class="btn ${quedan ? "" : "hay-mas"}" data-dom-paso="1">Siguiente cita${ic("der")}</button>` : ""}</div>`;
  }
  // "En pantalla" solo si lo que se lee es lo proyectado; con otra cita abierta se ofrece Proyectar (y Quitar).
  let der = "";
  if (proy.fallo || enEsta) {
    const mal = sinRespuesta();
    der = `<div class="der"><span class="estado ${mal ? "mal" : ""}"><i></i>${mal ? "Sin respuesta" : "En pantalla"}</span>
      ${mal ? `<button class="btn" data-reintentar>Reintentar</button>` : ""}
      ${proy.activo ? `<button class="btn peli quitar" data-quitar-pantalla>Quitar</button>` : ""}</div>`;
  } else if (canal && lectura) der = `<div class="der"><button class="btn pri" data-proyectar>${ic("pant")}Proyectar</button>
    ${proy.activo ? `<button class="btn peli quitar" data-quitar-pantalla>Quitar</button>` : ""}</div>`;
  b.hidden = !(partes || planHTML || der);
  b.innerHTML = partes + planHTML + der;
}
