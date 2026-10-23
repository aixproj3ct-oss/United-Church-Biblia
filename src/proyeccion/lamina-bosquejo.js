// HTML puro de las láminas del bosquejo (sin DOM): título, punto con su versículo y ¡Recuerda!.
// Recibe el bosquejo público (publicoDe), que no lleva notas privadas. Todo lo que escribió el pastor pasa por esc().
import { esc } from "../ui.js";
import { refDeCodigo, etiquetaRef } from "../pasaje.js";
import { fechaLamina } from "../bosquejo/modelo.js";

// Tamaños de letra del versículo en un punto: del más grande al más chico; si ni al último cabe, se parte por oraciones.
export const TAMANOS_BOSQUEJO = [58, 52, 47, 41];

// Lámina 1: fecha del domingo, título y cita principal (si la hay); "United Church" en el pie.
export function htmlTitulo(pub) {
  const ref = pub.cita ? refDeCodigo(pub.cita) : null;
  return `<div class="b-centro"><div class="b-fecha">${esc(fechaLamina(pub.fecha))}</div>`
    + `<div class="b-titulo">${esc(pub.titulo)}</div>`
    + (ref ? `<div class="b-cita">${esc(etiquetaRef(ref))}</div>` : "")
    + `</div><div class="pie">United Church</div>`;
}

// Encabezado de un punto (p empieza en 0): "Punto 2 de 3", el círculo con el número y la frase.
export const htmlEncabezado = (pub, p) =>
  `<div class="b-eti">Punto ${p + 1} de ${pub.puntos.length}</div>`
  + `<div class="b-punto"><span class="b-num">${p + 1}</span><span>${esc(pub.puntos[p].frase)}</span></div>`;

// Lámina de un punto: encabezado fijo arriba, el versículo centrado en el espacio que queda y el pie abajo.
// `cuerpo` es HTML ya escapado de los versículos (htmlBloques); `aviso` es texto plano (se escapa aquí) y lo reemplaza.
// Sin `ref` ni `cuerpo` ni `aviso` (un punto sin versículos) queda solo el encabezado.
export function htmlPunto(pub, p, { ref = "", cuerpo = "", aviso = "", tam = TAMANOS_BOSQUEJO[0], pie = "" } = {}) {
  const verso = ref || cuerpo || aviso
    ? `<div class="b-zona"><div class="b-vers">`
      + (ref ? `<div class="b-ref">${esc(ref)}</div>` : "")
      + (aviso ? `<p class="texto b-texto aviso-texto">${esc(aviso)}</p>`
        : cuerpo ? `<p class="texto b-texto" lang="es" style="font-size:${Number(tam) || TAMANOS_BOSQUEJO[0]}px">${cuerpo}</p>` : "")
      + `</div></div>`
    : `<div class="b-zona"></div>`;
  return `<div class="b-enc">${htmlEncabezado(pub, p)}</div>${verso}` + (pie ? `<div class="pie">${esc(pie)}</div>` : "");
}

// Lámina final: "¡Recuerda!", la frase y el título del bosquejo en el pie.
export const htmlRecuerda = pub =>
  `<div class="b-centro"><div class="b-eti">¡Recuerda!</div><div class="b-frase">${esc(pub.recuerda)}</div></div>`
  + `<div class="pie">${esc(pub.titulo)}</div>`;
