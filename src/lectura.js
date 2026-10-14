// Decide qué abre el lector y cómo se registra en el historial del navegador.
// Una cita nueva abre en la versión principal y agrega una entrada (Atrás vuelve a donde estaba el pastor).
// Capítulo anterior/siguiente conserva la versión elegida y reemplaza la entrada, así Atrás cierra el lector.
export function nuevaLectura(actual, cita, ref, { completo = false, navegando = false } = {}) {
  return {
    lectura: { ref, cita, completo: completo || !ref.v1, sigla: navegando ? actual?.sigla ?? null : null },
    reemplazar: navegando && !!actual,
  };
}
