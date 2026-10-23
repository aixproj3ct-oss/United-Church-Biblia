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
