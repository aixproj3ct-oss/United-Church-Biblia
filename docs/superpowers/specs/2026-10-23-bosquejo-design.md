# Bosquejo del sermón: diseño

Fecha: 2026-10-23. App: United Church (`united-church-biblia`). PWA en vanilla JS (ES modules), sin servidor propio, publicada en GitHub Pages. La tablet del pastor y la PC de la iglesia hablan por ntfy.sh.

Las decisiones marcadas **(decisión de Claude)** no las tomó el usuario. Son elecciones razonables que el usuario puede revisar.

## 1. Para qué es

El pastor prepara cada semana el "bosquejo" de su sermón, es decir, su esqueleto. Hoy lo escribe **en papel**, solo para ordenar sus ideas, y predica sin él.

Lo que el usuario quiere de verdad es que el pastor pueda **mostrar su bosquejo en las pantallas de la iglesia, como una presentación, punto por punto**, cuando sienta que quiere compartirlo. Además le sirve para escribirlo y guardarlo en la app en vez de en papel.

**Mostrarlo es opcional cada domingo.** Al predicar, el pastor puede usar solo la lista de citas del Domingo (proyectar versículos como hoy) o solo el bosquejo con sus láminas.

## 2. Partes del bosquejo (las define el usuario)

1. **Título:** atractivo y enfocado en la enseñanza central.
2. **Introducción:** un gancho, una historia o una pregunta.
3. **Puntos principales:** normalmente de 2 a 4.
4. **Subpuntos / explicación:** la interpretación de cada versículo que respalda los puntos.
5. **Ilustraciones y ejemplos.**
6. **Aplicación práctica:** "¿Y esto cómo cambia la vida diaria del creyente el lunes por la mañana?"
7. **Conclusión / llamado.**

## 3. Objetivos, lo que no se hace y lo que sería un fracaso

**Objetivos**
- Escribir el bosquejo en un formulario guiado, en la tablet o en el teléfono.
- Proyectarlo punto por punto con el estilo de las láminas actuales.
- Que sus versículos llenen solos la lista de citas del domingo, para no escribirlos dos veces.
- Que el pastor lo maneje en el púlpito con una vista propia: lámina actual, notas, lo que sigue, índice, reloj.

**Lo que no se hace**
- Sincronizar con la nube o con cuentas.
- Editar en la PC de la iglesia.
- Imprimir.
- Generar bosquejos con IA.
- Usarlo entre varias personas.

**Sería un fracaso, aunque funcione técnicamente, si:**
- En la pantalla de la iglesia aparece algo de las notas privadas: introducción, explicaciones, ilustraciones o conclusión.
- El texto bíblico viaja por la red. Hoy nunca viaja y así debe seguir: la PC lo saca de su propia Biblia.
- Se pierde un bosquejo escrito.
- El uso actual solo con el Domingo se vuelve más difícil o cambia.

## 4. Lo que ve la congregación (aprobado con maquetas)

Las maquetas aprobadas están en `.superpowers/brainstorm/2780-1792774782/content/`. Esa carpeta no está en git:
- `bosquejo-pantalla-v2.html`: lámina 1.
- `bosquejo-pantalla-v3b.html`: láminas de los puntos.
- `bosquejo-tablet.html`: vista del pastor.

**Reglas generales**
- La pantalla de la iglesia (`proyeccion.html` / `pantalla.js`) dibuja las láminas del bosquejo.
- Usa la **misma foto de fondo** que ya está elegida (F2), el mismo cambio automático de fondo si está activado, y el mismo velo, fuentes y colores que las láminas de versículos.
- Sale **una lámina a la vez**, cuando el pastor avanza desde la tablet, con el mismo fundido suave de hoy.

**Lámina 1 · Título**
- Arriba va la fecha del domingo en mayúsculas con espaciado, en el formato exacto que pidió el usuario: **"Octubre 25, 2026"** (mes con mayúscula inicial, día, coma, año).
- Debajo, el título del sermón en Playfair itálica dorada y su cita principal.
- Abajo: "UNITED CHURCH".

**Láminas de cada punto**
- Encabezado, igual en **todas** las láminas de ese punto:
  - "PUNTO 2 DE 3";
  - círculo dorado con el número;
  - la frase del punto en Montserrat negrita grande.
- **Un solo versículo por lámina**, centrado en el espacio que queda bajo el encabezado: la cita en Playfair dorada en su propia línea y el texto justificado debajo.
- Si el punto tiene varios versículos, cada uno es una lámina más, con el mismo encabezado. El pie dice "REINA-VALERA 1960 · VERSÍCULO 2 DE 3".
- Si el versículo es largo, la letra se achica, como hoy (tamaños de `partes.js`). Si aun así no entra, se parte por oraciones en "1 de 2", "2 de 2", igual que `repartir()`.
- El texto bíblico lo saca la PC de su propia Biblia, como hoy.

**Lámina "¡Recuerda!"**
- Etiqueta "¡RECUERDA!", con el signo de apertura.
- La frase corta de aplicación en grande.
- En el pie, el título del sermón.

**Nunca salen en la pantalla:** la introducción, las explicaciones, las ilustraciones ni la conclusión.

## 5. La vista del pastor mientras presenta (aprobada con maqueta)

Es una pantalla de la tablet a pantalla completa, como el lector. Lleva:
- Arriba:
  - Volver;
  - Inicio, que funciona igual que el botón Inicio del lector;
  - el título del sermón;
  - A− / A+;
  - el reloj con la hora y "predicando hace N min", contando desde la primera lámina mostrada **(decisión de Claude)**.
- A la izquierda:
  - "● En pantalla ahora" con una vista de la lámina que ve la iglesia;
  - debajo, "Sigue": una vista chica de la próxima lámina con una línea de texto.
- A la derecha: las notas del punto actual, es decir, su explicación y su ilustración. En la lámina del título se ve la introducción y en "¡Recuerda!" se ve la conclusión **(decisión de Claude)**.
- Abajo:
  - "‹ Anterior" y "Siguiente ›" grandes;
  - el **índice** "Título · 1 · 2 · 3 · ¡Recuerda!", que permite tocar uno para saltar a él;
  - el **estado** de la pantalla ("En pantalla", "Enviando…", "Sin respuesta"), con la misma lógica honesta de `estadoEnvio()`;
  - el botón **Quitar**, que deja la pantalla en espera.
- "Siguiente" recorre todo en orden: las partes de un versículo largo, luego los versículos del punto y después el siguiente punto.

## 6. Escribir el bosquejo

**Dónde está:** una pestaña nueva **"Bosquejo"** en el menú lateral, **entre "Biblia" y "Guardados"** (lo pidió el usuario). Muestra la lista de bosquejos, con el más reciente arriba, y un botón "Nuevo bosquejo".

**El formulario guiado, en el orden que confirmó el usuario:**
1. Título, fecha del domingo y **cita principal** opcional para la lámina 1 **(decisión de Claude: campo nuevo)**.
2. Introducción.
3. Puntos, con el botón **"Agregar punto"**. Cada punto tiene:
   - su frase;
   - sus versículos, uno por línea, con el mismo formato y la misma revisión ✓/✗ que el editor del Domingo (`parseCita`);
   - su explicación;
   - su ilustración.
4. Aplicación, con un campo aparte para la **frase corta de "¡Recuerda!"**. Si queda vacía, no hay lámina "¡Recuerda!" **(decisión de Claude)**.
5. Conclusión / llamado.

**Detalles**
- Cada parte indica si **se proyecta** (título, frase de cada punto, versículos, "¡Recuerda!") o si es **solo para el pastor** (introducción, explicaciones, ilustraciones, conclusión).
- Lo escrito se guarda solo mientras se escribe, como borrador, para que no se pierda si se cierra la app. Puede ser con el mismo patrón que el borrador del editor de Domingo **(decisión de Claude)**.
- Límite de puntos: de 1 a 6 **(decisión de Claude)**.

**Unión con el Domingo**
- El bosquejo está unido a un domingo por su fecha.
- Al guardar, ese domingo se crea o se actualiza: su título pasa a ser el del bosquejo y sus citas pasan a ser los versículos del bosquejo, en orden.
- Si el domingo ya tenía citas escritas a mano que no salieron del bosquejo, se pregunta antes de reemplazarlas **(decisión de Claude)**.
- En la vista Domingo, si ese domingo tiene bosquejo, aparece un botón **"Presentar bosquejo"** junto a "Empezar sermón" / "Seguir sermón". También se puede presentar desde la pestaña Bosquejo **(decisión de Claude)**.

**Copia de respaldo:** los bosquejos entran en la copia (`exportar` / `importar` de `datos.js`), con la misma validación y el mismo trato de "elementos dañados" que los domingos.

## 7. Escribir en el teléfono y enviar a la tablet (lo eligió el usuario)

- La misma app web se abre en el teléfono. Ahí se escribe el bosquejo con el mismo formulario. No hace falta tener Biblias cargadas en el teléfono para escribirlo.
- El teléfono y la tablet se conectan **una sola vez con un código**, como hoy la tablet con la pantalla. Por ejemplo: la tablet muestra el código en Configuración y el teléfono lo escribe.
- **"Enviar a la tablet"** lo manda por ntfy.sh, **cifrado con una clave sacada de ese código**. Puede ser WebCrypto: PBKDF2 para sacar la clave y AES-GCM para cifrar. Nadie que vea el tema de ntfy puede leer el bosquejo.
- En la tablet aparece en la lista. Si ya existía, lo nuevo reemplaza a lo viejo y se avisa **(decisión de Claude)**.
- Sin internet en ese momento, el envío falla y se dice claramente. No queda nada a medias.
- También se puede escribir directamente en la tablet.

## 8. Lo que ya existe y hay que respetar

- **Datos:** `src/datos.js`, en localStorage con la clave `uc-biblia-v1`. Los domingos tienen la forma `{id, fecha, titulo, citas:[{codigo, etiqueta, titulo?}]}`. Todo pasa por `sanearConfig` y validadores, y los elementos dañados se apartan sin romper nada.
- **Proyección:**
  - `src/proyeccion/mensajes.js` define los mensajes `pasaje`, `parte`, `espera`, `consulta` y `estado`, con su orden por tiempo (`crearOrden`) y el arranque (`paraArrancar`).
  - `src/proyeccion/canal.js` maneja la reconexión y el tiempo límite de envío.
  - `src/lector.js` mantiene el estado `proy` y la barra de abajo.
  - El bosquejo necesita mensajes nuevos, por ejemplo para mostrar la lámina N del bosquejo X. La PC también debe poder contestar qué está mostrando del bosquejo y sobrevivir a recargas, como hoy con los pasajes.
- **Privacidad de la red:**
  - El tema de la pantalla no está cifrado. Por ahí solo pueden viajar los textos que **de todos modos se proyectan**: título, frase de cada punto, referencias y "¡Recuerda!". Nunca las notas privadas ni el texto bíblico.
  - Los mensajes de ntfy tienen un límite de tamaño (unos 4 KB). Un bosquejo completo cifrado puede pasarlo. Cómo partirlo o enviarlo lo decide quien lo construya.
- **Estilo:** `proyeccion.css` (lámina de 1920×1080 escalada; caja de 96 arriba, 84 abajo, 1170 de ancho) y `styles.css` (tokens, modo claro y oscuro, tamaño de letra).
- **Service worker:** subir `VERSION` y agregar los módulos nuevos a `ARCHIVOS`. Hay una prueba que lo verifica.
- **Pruebas:** `npm test` (`node --test`), hoy 261 pruebas.
- **Publicar:** solo con el visto bueno del usuario. Después hay que actualizar la tablet de laboratorio (R83W700HPLM) por ADB y DevTools.

## 9. Decisiones tras la revisión del documento (todas son decisiones de Claude)

1. **Tablet cerrada al enviar desde el teléfono:**
   - Funciona igual. ntfy.sh guarda los mensajes unas 12 horas.
   - Al abrir la app, la tablet busca lo que le llegó (`recientes` o `since`) y lo agrega. Después confirma la recepción con un mensaje cifrado de vuelta.
   - El teléfono dice "Enviado a la tablet" cuando llega esa confirmación. Si no llega, dice "Enviado: aparecerá cuando abras la app en la tablet (dentro de 12 horas)".
2. **Versión de la Biblia:**
   - Se usa la misma que en el lector: la principal de la tablet, y en la vista del pastor se puede cambiar con los mismos botones de versión.
   - Cada lámina de versículo lleva la sigla, como hoy `msgPasaje`.
   - La vista "En pantalla ahora" y los contadores ("1 de 2") siguen lo que **la PC informa** en su respuesta de estado, no un cálculo propio de la tablet. Así nunca dicen algo distinto de lo que se ve.
3. **Varios domingos con la misma fecha:**
   - El bosquejo guarda el **id** de su domingo, no solo la fecha.
   - Al crear un bosquejo, si ya hay un domingo con esa fecha se une al más reciente de ellos; si no hay, se crea uno.
4. **Cambiar la fecha o borrar un bosquejo:**
   - Si cambia la fecha, el bosquejo se une al domingo de la fecha nueva, buscándolo o creándolo como en el punto 3. El domingo anterior conserva sus citas tal como estaban.
   - Borrar un bosquejo no borra su domingo.
   - Las citas del domingo se pueden seguir editando a mano. Si, al volver a guardar el bosquejo, las citas del domingo son distintas de las del bosquejo, se pregunta antes de reemplazarlas.

## 10. Lo que queda a criterio de quien lo construya

- Los nombres y la forma de los mensajes nuevos, y cómo partir el envío cifrado si pasa del límite de ntfy.
- La estructura interna del bosquejo en `datos.js`, siempre que la copia de respaldo vieja siga cargando.
- La forma exacta del código de conexión del teléfono y dónde se muestra en Configuración.
- La forma en que el formulario queda cómodo en el teléfono (pantalla angosta).
- El orden de construcción y qué pruebas escribir.
