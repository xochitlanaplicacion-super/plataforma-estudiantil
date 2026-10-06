# Batalla Naval: aula local

Acceso: **Profesor → Actividades en clase → Repertorio de juegos → Preparar Batalla Naval**.
No aparece en el perfil de alumnos, no requiere una sala en línea, no almacena flotas ni resultados en la base de datos y no modifica calificaciones. El duelo Bet Win Lose existente permanece separado y conserva su funcionamiento en línea.

## Configuración y privacidad

- 2–10 equipos o personas, con nombres diferentes.
- Mapas de 10×10, 12×12 y 14×14, con el mismo terreno público para todos los equipos. Islas de 1–6 celdas y abundante mar.
- Cada flota tiene submarino nuclear (4 celdas), seminuclear (3), portaaviones (5, huella escalonada 3+2), suministros (3, huella triangular/L), destructor (2), buque hospital (3, L) y tropas (1, exclusivamente en una isla).
- Rotaciones alineadas con celdas; las unidades lineales admiten diagonales. No se permiten superposiciones, colocar naves en tierra ni tropas en el mar. Una recolocación sustituye sólo esa unidad.
- Durante la colocación se debe **ocultar la proyección** y entregar el dispositivo a cada equipo. La pantalla de relevo no renderiza la flota anterior. Durante los ataques las naves enemigas vivas no se insertan completas en el DOM; los restos hundidos sí son públicos.
- Turnos secuenciales o ruleta aleatoria, y contrincantes secuenciales, aleatorios o elegidos. Los dos sorteos son independientes. Fisher–Yates fresco en cada turno permite que el mismo equipo repita. Se excluyen las flotas eliminadas.
- Recargar o cerrar elimina la partida en memoria; no hay recuperación de partidas ni almacenamiento local de posiciones secretas.

## Preguntas y debate

Sin preguntas no se llama a la IA. Con IA se eligen verdadero/falso, opción múltiple (2–6 opciones) o ambas, tema, grado y dificultad. El profesor genera, revisa, descarta y aprueba el banco inicial antes de empezar.

La reserva contiene hasta 16 preguntas. Se solicitan lotes de 10, con una sola petición pendiente; durante la partida se repone al bajar a 3. Se conserva un registro normalizado de todos los enunciados preparados, usados o descartados, y se excluyen los 80 más recientes en cada petición. Una variante de texto literalmente equivalente no se reutiliza; esto no es una garantía de deduplicación semántica de todos los conceptos. Las opciones múltiples se mezclan preservando la respuesta correcta. Verdadero/falso conserva su orden legible.

El modo IA requiere internet y el servicio IA de la institución; utiliza sus claves de servidor y registro de consumo existentes. La ruta sólo admite sesiones de profesor con escuela activa. La escuela y el usuario provienen de la sesión, nunca del cuerpo enviado. No hay migración nueva. La generación valida esquema, número de opciones, explicación y duplicados; hace como máximo un segundo intento de reparación, con un límite total de tiempo. Cerrar aborta la petición. Si falla o se agota la reserva, la partida espera un reintento explícito, no recicla preguntas ni cambia de modalidad. La aprobación inicial autoriza tema/nivel para la reposición; el profesor puede pausar y revisar las siguientes preguntas.

Hay dos relojes independientes configurables de 30 o 45 segundos: respuesta y coordenada. Una respuesta incorrecta, tiempo de respuesta agotado o tiempo de disparo agotado hace perder el disparo. Pausa, revisión, confirmación de cierre, radar y cinemáticas detienen los relojes que corresponden. Ocultar la pestaña o salir de pantalla completa pausa la partida.

## Poderes y balance

Responder correctamente suma 25 XP. Desde la tercera respuesta consecutiva correcta, Fiebre/Overdrive aumenta el premio a 50 XP por respuesta hasta fallar o agotarse el reloj de respuesta. La racha es individual por equipo, no entre equipos; el reto defensor no altera rachas ni XP. Sin preguntas, acertar a una unidad suma 25 XP por salva, no por celda. Suministros aporta 20 XP al comenzar cada turno propio mientras permanezca totalmente intacto. El medidor llega a 100 XP y muestra niveles 35/70/100. Un solo impacto sella el poder de la unidad; reparar su último impacto permite rehabilitarlo si aún conserva su uso.

| Poder | Unidad intacta | Costo | Huella | Usos |
|---|---|---:|---|---|
| Big Boy | Nuclear | 35 XP | Centro + vecino horizontal/vertical aleatorio | Reutilizable |
| Bengala costera | Tropas | 35 XP | Centro y cuatro vecinos revelados por 2 segundos; conserva disparo normal | Reutilizable |
| Night of Fire | Destructor | 70 XP | Tres casillas en dirección aleatoria, incluida diagonal | Una vez |
| Fat Boy | Seminuclear | 70 XP | Centro y cuatro vecinos en cruz | Una vez |
| Bomba nuclear | Nuclear | 100 XP | Área 3×3 | Una vez |
| Radar Vision | Portaaviones | 100 XP | Revela sólo área 3×3 durante 3 segundos, sin daño; conserva disparo normal | Una vez |
| Reparación de emergencia | Buque hospital | 100 XP | Quita un impacto de una nave propia no hundida; conserva disparo normal | Una vez |

Máximo un poder por turno; se descuenta su costo y se conserva XP sobrante de un poder menor. Se recortan al mapa las zonas de borde. No se vuelve a dañar una celda ya impactada; el centro del disparo debe ser nuevo, salvo radar y bengala que no disparan. La reparación quita un único impacto y libera esa coordenada para que vuelva a poder atacarse: no crea una casilla inmune. No revive naves hundidas ni restaura usos de un poder ya gastado. La interfaz de reparación muestra únicamente nombres e impactos conocidos, no las posiciones intactas de la flota propia.

### Tropas y defensa costera

Mientras las tropas estén con vida, el Flak costero cubre las casillas a distancia Chebyshev de hasta 2 respecto de cualquier celda de la isla conectada que ocupan. Las bombas nuclear, Big Boy y Fat Boy se consideran aéreas para esta mecánica: se desvían una casilla hacia un vecino válido elegido aleatoriamente. Night of Fire es fuego naval y no se desvía. Si todos los vecinos ya recibieron disparos, conserva el centro original en lugar de desperdiciar la acción. Radar Vision recibe interferencia dentro de esa zona: se muestra ruido visual uniforme y no se revelan posiciones. Las bengalas son observación óptica y no reciben interferencia. Destruir las tropas desactiva ambas funciones; una unidad terrestre hundida no puede repararse.

### Reto defensor / Humo táctico

Es opcional, configurable antes de empezar y exclusivo del modo con preguntas. Antes de ejecutar una bomba nuclear, el profesor puede activar una pregunta ya preparada del banco para el equipo defensor, con reloj de 10 segundos. Un acierto reduce la huella a una cruz de 5 celdas; fallo, tiempo agotado o continuar sin reto conserva 3×3. La defensa no revierte el disparo seleccionado ni regala XP; el Flak pasivo aún puede desviar su centro. El modo libre nunca activa IA ni retos con preguntas. Durante el debate de defensa el reloj de disparo queda detenido.

La barra llena activa un destello y las cartas disponibles se iluminan. Los poderes sellados indican daño; los de un uso indican si ya se gastaron. Una sirena breve silenciable y un corte 2D de un segundo preceden al poder. Rojo indica impactos, blanco agua; restos y fuego permanecen. Océano/palmeras animados, partículas limitadas a un único ciclo corto y preferencia de movimiento reducido. La pantalla completa depende de la API del navegador, con aviso cuando no está disponible.

## Verificación local

Los tests de motor, validación/IA, autenticación de API, cola, reloj, tablero y flujo UI no envían datos ni peticiones pagadas. El script `scripts/games/test-naval-battle-ui.mjs` usa una página compilada aislada y respuestas IA simuladas; no inicia sesión ni altera Supabase. La emulación de iPad en Chromium no sustituye una prueba en Safari/iPad real.

Si no se descargó el navegador de Playwright, se puede utilizar Chrome instalado: `NAVAL_BROWSER_PATH=/usr/bin/google-chrome node scripts/games/test-naval-battle-ui.mjs`.
