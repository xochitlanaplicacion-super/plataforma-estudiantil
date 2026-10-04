# Flying Cat / Pilot Cat

En **Mis asignaturas → Unidad → Tema → Nueva actividad**, elegir **Flying Cat**.
Puede crearse manualmente, con el botón de IA o importando un JSON desde el editor.
El prototipo de `CARPETA DE JUEGOS NUEVOS/watercolor-cat-plane-quiz-game` se conserva
intacto como referencia; la versión integrada vive en `src/components/activities/flying-cat`.

## Contenido

De 1 a 20 definiciones, descripciones o casos de uso (5–1600 caracteres). Cada
reactivo lleva entre 2 y 4 conceptos distintos, de **máximo dos palabras y 24
caracteres**, una respuesta correcta y explicación opcional (hasta 2000 caracteres).
La captura manual admite frases simples y explicaciones vacías u omitidas: se
muestra el concepto correcto sin inventar una explicación. Las actividades
generadas con IA sí deben traer una explicación educativa por reactivo.
No se truncan opciones al importar ni se cambia una respuesta correcta inválida
por otra: el profesor debe corregir el contenido antes de guardarlo.

```json
{
  "version": 1,
  "instructions": "Lee la definición, pilota al concepto correcto y evita obstáculos.",
  "showFeedback": true,
  "settings": { "difficulty": "normal" },
  "items": [
    {
      "id": "profesiones-1",
      "prompt": "Profesional capacitado para conducir aeronaves, transportar viajeros y comunicarse con la torre de control. Antes de despegar revisa los instrumentos y las condiciones del tiempo. Identifica la profesión descrita.",
      "options": ["Piloto", "Médico", "Docente", "Agricultor"],
      "correctIndex": 0,
      "feedback": "El piloto conduce aeronaves. Las otras profesiones se dedican a la salud, la enseñanza y el cultivo, respectivamente."
    }
  ]
}
```

`correctIndex` empieza en cero. Dificultades: `easy`, `normal`, `hard`.
La IA recibe indicaciones para distribuir las opciones y el servidor vuelve a
barajarlas, conservando la identidad de la correcta. En cada partida se barajan
también las opciones y definiciones con aleatoriedad del navegador. La explicación
no debe mencionar «opción A» ni una posición: éstas cambian al barajar.

El profesor puede dar instrucciones normales, sin JSON ni restricciones técnicas:
por ejemplo, «profesiones, descripciones en español y conceptos en inglés». El
prompt interno separa los idiomas por campo, admite faltas de escritura y adapta
el texto a tarjetas cortas. Las definiciones IA son detalladas por defecto, pero
se pueden pedir simples. El número del formulario define la cantidad exacta.
La generación usa JSON Schema estructurado y validación local; si la respuesta
incumple límites, cantidad, índice o explicaciones, se hace una sola petición
correctiva, dentro de un plazo total acotado. No se recortan conceptos ni se
adivina una respuesta correcta. Si tampoco se logra corregir, se conservan las
preguntas anteriores. Cancelar o cerrar el editor invalida la petición pendiente;
el doble clic no genera dos solicitudes.

## Vuelo y calificación

- Portada original de acuarela antes de empezar; fallback SVG si falla la imagen.
- Se lee cada definición con el cielo detenido. Durante el vuelo permanece arriba,
  en un panel que se puede desplazar. En pantalla aparece **una tarjeta por vez**;
  las opciones omitidas vuelven a circular. Dos obstáculos como máximo en pantallas
  estrechas y tres en las amplias.
- Al tocar un concepto se registra una sola respuesta y, si está habilitada, se
  pausa para leer la explicación (acierto o error). Después se pasa a la siguiente
  definición. No se permite responder dos veces por una misma colisión.
- Tres segundos de protección contra obstáculos al despegar, continuar después
  de una pausa o recibir un golpe, visibles como una esfera de energía azul.
  Los obstáculos también se detienen en las pausas.
- Flechas táctiles y arrastre sólo como guía móvil; instrucciones WASD/flechas en PC.
  Cambiar de pestaña o perder el foco pausa y libera controles presionados.
- Cada dos definiciones aumenta el nivel y, de forma acotada, la velocidad. Tres
  choques agotan las vidas. Se muestra el avión rompiéndose y el gato cayendo durante
  2.4 segundos, sin nuevas respuestas; después se presenta el resumen. El resultado usa el total original de preguntas: las
  no respondidas nunca inflan la nota. Los obstáculos afectan puntos/vidas, no
  convierten una respuesta académica correcta en incorrecta.
- Calificación académica: `aciertos / total × 10`. Los puntos del vuelo son otra
  métrica. Las respuestas, aciertos, errores, tiempo y puntos viajan por el guardado
  automático existente y se muestran en el historial/CSV de entregas.
- Si falla el guardado, el resultado permanece en pantalla con **Reintentar guardar**.
  Se conserva el identificador de la partida y su versión original para que una
  respuesta perdida después de guardar no genere un segundo intento.
  Una actividad vencida o con nota bloqueada se identifica como práctica, sin
  afirmar que se guardó otro intento.

No se introduce un esquema ni RPC nuevo: `ejercicios.tipo` y el flujo de resultados
automáticos existente admiten el tipo `flying_cat`. Los avisos a KIBO utilizan ese
flujo genérico, también para actividades sin peso en un criterio. La prueba de
entrega real de push requiere una actividad guardada y un teléfono registrado;
las pruebas aisladas no envían avisos ni escriben notas de alumnos.

## Comprobación local

Pruebas Vitest: `flying-cat*.test.*`, `game-attempt-details.test.ts` y regresiones
de historial/CSV y juegos anteriores. `npm run typecheck` revisa los contratos.

```sh
node scripts/games/test-flying-cat-ui.mjs
```

El smoke test compila una página temporal y usa Chromium de Playwright; se puede
usar un navegador ya instalado con `FLYING_CAT_BROWSER_PATH=/usr/bin/google-chrome`.
Comprueba 390×844, 320×568, 844×390 y 1280×800; portada, definición y explicación
largas, controles, avance de dos preguntas, escudo, guardado único y reintento de
conexión. Conserva capturas en la carpeta temporal que imprime al terminar.

Prueba opcional con el proveedor real (consume tokens con la clave local existente,
sin imprimirla ni escribir actividades o notas en Supabase):

```sh
node scripts/games/test-flying-cat-ai.mjs
```
