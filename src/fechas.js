// Fechas para el plan del domingo.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// El domingo vigente: hoy si es domingo; si no, el próximo.
export function proximoDomingo(hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return iso(d);
}

export const fechaLarga = f => new Date(f + "T12:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
export const fechaCorta = f => new Date(f + "T12:00").toLocaleDateString("es", { day: "numeric", month: "long" });

// Fecha AAAA-MM-DD que existe de verdad (no 2026-13-45 ni 2026-02-30).
export const fechaReal = f => {
  if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const [a, m, d] = f.split("-").map(Number);
  const dias = [31, a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return a >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= dias[m - 1];
};
