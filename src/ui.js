// Utilidades de pantalla compartidas por la app y la pantalla de proyección.
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function aviso(msg, ms = 3500) {
  const a = document.querySelector("#aviso");
  a.textContent = msg; a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), ms);
}
