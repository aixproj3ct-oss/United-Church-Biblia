// Vistas del bosquejo (la lista y el formulario guiado): reciben datos y devuelven texto HTML. Sin pantalla ni almacenamiento.
// El formulario se maneja con "crudo": lo que hay escrito en los campos, todo como texto (la cita principal y los
// versículos todavía sin leer). De ahí sale el bosquejo con revisarCrudo(); así un error de escritura no se pierde.
import { parseCita } from "../citas.js";
import { esc } from "../ui.js";
import { fechaLarga, proximoDomingo } from "../fechas.js";
import { MAX, MAX_PUNTOS, MAX_VERSOS } from "./modelo.js";

const texto = t => (typeof t === "string" ? t : "");
const puntoVacio = () => ({ frase: "", versos: "", explicacion: "", ilustracion: "" });

// Lo escrito en el formulario con forma segura: todo texto, de 1 a maxPuntos puntos (un borrador viejo o raro no rompe nada).
function normalizarCrudo(c, maxPuntos = MAX_PUNTOS) {
  const puntos = (Array.isArray(c?.puntos) ? c.puntos : []).slice(0, maxPuntos).map(p => ({
    frase: texto(p?.frase), versos: texto(p?.versos), explicacion: texto(p?.explicacion), ilustracion: texto(p?.ilustracion) }));
  if (!puntos.length) puntos.push(puntoVacio());
  return { fecha: typeof c?.fecha === "string" ? c.fecha : proximoDomingo(new Date()), titulo: texto(c?.titulo), cita: texto(c?.cita),
    intro: texto(c?.intro), puntos, aplicacion: texto(c?.aplicacion), recuerda: texto(c?.recuerda), conclusion: texto(c?.conclusion) };
}

// Un bosquejo (o null = nuevo) pasado a lo que se escribe en los campos: las citas vuelven a ser su etiqueta, una por línea.
export function bosquejoACrudo(b) {
  if (!b) return normalizarCrudo(null);
  return normalizarCrudo({ fecha: b.fecha, titulo: b.titulo, cita: b.cita?.etiqueta ?? "", intro: b.intro, aplicacion: b.aplicacion,
    recuerda: b.recuerda, conclusion: b.conclusion,
    puntos: (b.puntos ?? []).map(p => ({ frase: p.frase, versos: (p.versos ?? []).map(c => c.etiqueta).join("\n"),
      explicacion: p.explicacion, ilustracion: p.ilustracion })) }, Infinity);
}

const lineasDe = txt => txt.split("\n").map(l => l.trim()).filter(Boolean);
const okLi = etiqueta => `<li class="ok">✓ ${esc(etiqueta)}</li>`;
const malLi = (linea, error) => `<li class="mal">✗ “${esc(linea)}”: ${esc(error)}</li>`;

// ✗ de lo obligatorio: el título y la frase de cada punto (solo espacios cuenta como vacío).
const faltaLi = msg => `<li class="mal">✗ ${esc(msg)}</li>`;
const previstaTitulo = t => (t.trim() ? { html: "", malo: false } : { html: faltaLi("Escribe el título"), malo: true });
const previstaFrase = t => (t.trim() ? { html: "", malo: false } : { html: faltaLi("Escribe la frase del punto"), malo: true });

// ✓/✗ de la cita principal (una sola línea; vacía es válida).
function previstaCita(txt) {
  const t = txt.trim();
  if (!t) return { html: "", malo: false, cita: null };
  const r = parseCita(t);
  return r.ok ? { html: okLi(r.etiqueta), malo: false, cita: { codigo: r.codigoRef, etiqueta: r.etiqueta } }
    : { html: malLi(t, r.error), malo: true, cita: null };
}

// ✓/✗ de los versículos de un punto (uno por línea). Del séptimo en adelante se marcan: el modelo solo admite 6 por punto.
function previstaVersos(txt) {
  const citas = [];
  let malo = false;
  const html = lineasDe(txt).map((l, i) => {
    const r = parseCita(l);
    if (!r.ok) { malo = true; return malLi(l, r.error); }
    if (i >= MAX_VERSOS) { malo = true; return malLi(l, `Máximo ${MAX_VERSOS} versículos por punto`); }
    citas.push({ codigo: r.codigoRef, etiqueta: r.etiqueta });
    return okLi(r.etiqueta);
  }).join("");
  return { html, malo, citas };
}

// Lee el crudo: devuelve el bosquejo armado (sin sanear: sin id, y las líneas con ✗ quedan fuera), la revisión ✓/✗ de la
// cita principal y de cada punto, y `malo` = hay algo con ✗ que impide guardar.
export function revisarCrudo(crudo) {
  const c = normalizarCrudo(crudo, Infinity);
  const titulo = previstaTitulo(c.titulo);
  const cita = previstaCita(c.cita);
  const frases = c.puntos.map(p => previstaFrase(p.frase));
  const puntos = c.puntos.map((p, i) => {
    const v = previstaVersos(p.versos);
    return { ...v, html: frases[i].html + v.html, malo: v.malo || frases[i].malo };
  });
  const b = { id: "", domingoId: null, fecha: c.fecha, titulo: c.titulo, cita: cita.cita, intro: c.intro,
    puntos: c.puntos.map((p, i) => ({ frase: p.frase, versos: puntos[i].citas, explicacion: p.explicacion, ilustracion: p.ilustracion })),
    aplicacion: c.aplicacion, recuerda: c.recuerda, conclusion: c.conclusion, actualizado: "" };
  return { b, malo: titulo.malo || cita.malo || puntos.some(p => p.malo), titulo, cita: { html: cita.html, malo: cita.malo },
    puntos: puntos.map(p => ({ html: p.html, malo: p.malo })) };
}

const ICO_DER = `<svg class="ico"><use href="#i-der"/></svg>`;

// La lista: el botón para escribir uno nuevo y una tarjeta por bosquejo (ya vienen del más reciente al más viejo).
export function vistaListaBosquejos(bosquejos) {
  const nuevo = `<div class="acciones"><button type="button" class="btn pri" data-bq-abrir="">＋ Nuevo bosquejo</button></div>`;
  if (!bosquejos.length) {
    return `<h1>Bosquejo</h1>${nuevo}<p class="vacio">Todavía no hay bosquejos. Toca «Nuevo bosquejo» para escribir el primero.</p>`;
  }
  return `<h1>Bosquejo</h1>${nuevo}<ol class="citas">${bosquejos.map(b => {
    const n = b.puntos.length;
    return `<li><button type="button" class="cita" data-bq-abrir="${esc(b.id)}"><span class="num-c">${n}</span>
      <span><b>${esc(b.titulo || "Sin título")}</b><small>${esc(fechaLarga(b.fecha))} · ${n} ${n === 1 ? "punto" : "puntos"}</small></span>${ICO_DER}</button></li>`;
  }).join("")}</ol>`;
}

// Marca de cada campo: lo que se ve en la pantalla de la iglesia o lo que es solo para el pastor.
const marca = proy => proy ? `<span class="marca-p proy">Se proyecta</span>` : `<span class="marca-p priv">Solo para ti</span>`;
const campo = (id, nombre, proy, control) => `<label for="${id}"><span class="rot">${nombre}${marca(proy)}</span>${control}</label>`;
const entrada = (id, max, valor, extra = "") => `<input id="${id}" maxlength="${max}" value="${esc(valor)}" ${extra}>`;
const area = (id, max, valor, extra = "") => `<textarea id="${id}" maxlength="${max}" ${extra}>${esc(valor)}</textarea>`;

function htmlPunto(p, i, rev, quitar) {
  return `<fieldset class="punto" data-punto="${i}"><legend>Punto ${i + 1}</legend>
    ${campo(`p${i}-frase`, "Frase del punto", true, entrada(`p${i}-frase`, MAX.frase, p.frase, `class="p-frase" aria-describedby="p${i}-prevista"`))}
    ${campo(`p${i}-versos`, "Versículos (uno por línea. Ejemplo: ef 2 8-9)", true,
      `<textarea id="p${i}-versos" class="p-versos" rows="3" spellcheck="false" autocorrect="off" autocapitalize="off" aria-describedby="p${i}-prevista">${esc(p.versos)}</textarea>`)}
    <ul id="p${i}-prevista" class="prevista" aria-live="polite">${rev.html}</ul>
    ${campo(`p${i}-expl`, "Explicación", false, area(`p${i}-expl`, MAX.nota, p.explicacion, 'class="p-expl" rows="4"'))}
    ${campo(`p${i}-ilus`, "Ilustración", false, area(`p${i}-ilus`, MAX.nota, p.ilustracion, 'class="p-ilus" rows="4"'))}
    ${quitar ? `<div><button type="button" class="btn peq peli" data-bq-quitar="${i}">Quitar punto</button></div>` : ""}</fieldset>`;
}

// El formulario guiado. `b` es el bosquejo que se edita (null = nuevo); `crudo`, si viene, manda sobre `b`
// (para volver a dibujarlo sin perder lo escrito). Los ✓/✗ ya vienen puestos; la app los actualiza al escribir.
// `presentar`: HTML del botón "Presentar bosquejo" (lo arma la app, que sabe si hay pantalla); va bajo el título.
// `enviar`: HTML del botón "Enviar a la tablet" (lo arma la app, que sabe el estado del envío); va junto al anterior.
export function vistaFormBosquejo(b, { maxPuntos = MAX_PUNTOS, crudo = null, presentar = "", enviar = "" } = {}) {
  const c = crudo ? normalizarCrudo(crudo, maxPuntos) : bosquejoACrudo(b);
  const rev = revisarCrudo(c);
  const n = c.puntos.length;
  return `<button type="button" class="enlace" data-bq-volver>‹ Volver a los bosquejos</button><h1>${b ? "Editar bosquejo" : "Nuevo bosquejo"}</h1>${presentar}${enviar}
    <form id="f-bosquejo" class="card form bq-form" novalidate>
      <section class="parte"><h2>1 · Título, fecha y cita principal</h2>
        ${campo("b-titulo", "Título del sermón", true,
          entrada("b-titulo", MAX.titulo, c.titulo, 'aria-describedby="b-titulo-prevista"'))}
        <ul id="b-titulo-prevista" class="prevista" aria-live="polite">${rev.titulo.html}</ul>
        ${campo("b-fecha", "Fecha del domingo", true, `<input type="date" id="b-fecha" required value="${esc(c.fecha)}">`)}
        ${campo("b-cita", "Cita principal (opcional. Ejemplo: ef 2 8-9)", true,
          entrada("b-cita", 80, c.cita, 'spellcheck="false" autocorrect="off" autocapitalize="off" aria-describedby="b-cita-prevista"'))}
        <ul id="b-cita-prevista" class="prevista" aria-live="polite">${rev.cita.html}</ul></section>
      <section class="parte"><h2>2 · Introducción</h2>
        ${campo("b-intro", "Introducción", false, area("b-intro", MAX.nota, c.intro, "rows=\"5\""))}</section>
      <section class="parte"><h2>3 · Puntos</h2>
        ${c.puntos.map((p, i) => htmlPunto(p, i, rev.puntos[i], n > 1)).join("")}
        ${n < maxPuntos ? `<div><button type="button" class="btn" data-bq-agregar>＋ Agregar punto</button></div>` : `<p class="meta">Llegaste al máximo de ${maxPuntos} puntos.</p>`}</section>
      <section class="parte"><h2>4 · Aplicación y ¡Recuerda!</h2>
        ${campo("b-aplicacion", "Aplicación", false, area("b-aplicacion", MAX.nota, c.aplicacion, "rows=\"5\""))}
        ${campo("b-recuerda", "¡Recuerda! (una frase corta; si la dejas vacía, no hay lámina final)", true, entrada("b-recuerda", MAX.recuerda, c.recuerda))}</section>
      <section class="parte"><h2>5 · Conclusión</h2>
        ${campo("b-conclusion", "Conclusión / llamado", false, area("b-conclusion", MAX.nota, c.conclusion, "rows=\"5\""))}</section>
      <div class="acciones">${b ? `<button type="button" class="btn peli" id="b-borrar">Borrar bosquejo</button>` : ""}<button type="submit" class="btn pri" id="b-guardar" aria-describedby="b-ayuda"${rev.malo ? " disabled" : ""}>Guardar bosquejo</button></div>
      <p id="b-ayuda" class="meta"${rev.malo ? "" : " hidden"}>Corrige las líneas marcadas con ✗</p>
    </form>`;
}
