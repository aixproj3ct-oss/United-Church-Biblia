// Decide qué abre el lector y cómo se registra en el historial del navegador.
// Una cita nueva abre en la versión principal y agrega una entrada (Atrás vuelve a donde estaba el pastor).
// Capítulo anterior/siguiente conserva la versión elegida y reemplaza la entrada, así Atrás cierra el lector.
// `domingo` ({id, i}) recuerda el lugar en la lista del domingo; navegar capítulos lo conserva.
export function nuevaLectura(actual, cita, ref, { completo = false, navegando = false, domingo = null } = {}) {
  return {
    lectura: { ref, cita, completo: completo || !ref.v1, sigla: navegando ? actual?.sigla ?? null : null,
      domingo: domingo ?? (navegando ? actual?.domingo ?? null : null) },
    reemplazar: navegando && !!actual,
  };
}

// ¿Lo que se abre ahora sale solo en la pantalla? Sí, si ya se está proyectando y es otra cita del plan
// del domingo, o un cambio de capítulo del pasaje proyectado. Una cita suelta espera a "Proyectar".
export function seguirProyeccion(proy, { navegando = false, domingo = null } = {}) {
  if (!proy.activo) return false;
  if (domingo) return true;
  return navegando ? proy.seguir : false;
}
