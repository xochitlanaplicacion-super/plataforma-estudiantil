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
- Fondo de vuelo reconstruido en cinco capas SVG: nubes, montañas lejanas,
  colinas, campos con casitas y árboles cercanos. Cada capa se desplaza a su propia
  velocidad; dos teselas idénticas se repiten sin huecos ni objetos acumulados.
  El movimiento sigue el reloj del vuelo y aumenta de forma acotada por dificultad
  y nivel. Se detiene al leer, pausar, ver explicaciones o reaccionar a un choque.
  Conserva su fase al girar y redimensionar. No tiene colisiones ni intercepta
  controles; utiliza el mismo RAF del juego sin renders React por fotograma.
  En todos los dispositivos funciona igual; si el sistema solicita reducir
  movimiento, conserva el paisaje quieto. La portada sigue siendo la original.
- Antes de comenzar, el alumno elige **Fácil, Normal o Difícil**. Se ofrece primero
  la dificultad configurada por el profesor. La elección sólo modifica la partida:
  no cambia el ejercicio guardado ni la fórmula de calificación académica.
- Se lee cada definición con el cielo detenido. Durante el vuelo permanece arriba,
  en un panel que se puede desplazar. En pantalla aparece **una tarjeta por vez**;
  las opciones omitidas vuelven a circular. Los obstáculos son más grandes y
  aparecen en oleadas limitadas por dificultad y espacio disponible, dejando
  corredores libres. Fácil ya presenta varios obstáculos; no llena la pantalla
  de golpe ni crea una lista creciente de objetos.
- Al tocar un concepto se registra una sola respuesta y, si está habilitada, se
  pausa para leer la explicación (acierto o error). Después se pasa a la siguiente
  definición. No se permite responder dos veces por una misma colisión.
- Tres segundos de protección contra obstáculos al despegar o continuar después
  de una pausa, visibles como una esfera de energía azul. Un choque no fatal muestra
  primero al gato preocupado, un tambaleo del avión y una breve sacudida del cielo;
  después aparecen los tres segundos de escudo. No se pierden vidas adicionales
  durante esa reacción. La sacudida no mueve los botones y se elimina al activar
  «reducir movimiento» en el dispositivo.
  Los obstáculos también se detienen en las pausas.
- En móviles y iPad, sólo la **palanca circular analógica** dentro del escenario,
  abajo a la izquierda por defecto, guía el avión. Permite diagonales y movimiento
  suave, con una zona muerta que evita desplazamientos accidentales. Un dedo puede
  mantener la palanca mientras otro activa un premio. Soltar, cancelar, pausar,
  cambiar de pestaña o girar libera el control sin movimientos residuales.
  Tocar o arrastrar el cielo no mueve ni teletransporta al gato. En PC se pilota
  exclusivamente con **WASD**: ni el ratón ni las teclas de flecha lo guían.
  En arenas horizontales bajas se reservan las franjas que ocupan la palanca y los
  premios; el avión y los objetos se mueven sólo en el espacio no tapado.
  Cambiar de pestaña o perder el foco pausa y libera controles presionados.
- El botón **Ajustar controles** abre un panel dentro del juego y pausa el vuelo.
  Se ajustan tamaño (pequeño/mediano/grande), lado (izquierdo/derecho), visibilidad
  y sensibilidad. Los valores se validan y recuerdan localmente en ese navegador;
  si el almacenamiento está bloqueado, se aplican durante la sesión sin fallar.
  El tamaño real se limita al espacio disponible, también al salir de fullscreen.
- El juego se monta directamente en `document.body`, fuera de los paneles con
  transformaciones o recortes. Su ancho, alto y posición siguen `VisualViewport`
  (incluidos cambios de las barras del navegador); si no existe, usa la ventana.
  Se elimina la cabecera exterior: **Música, Pausa y Cerrar** comparten la fila del
  marcador. Los controles quedan dentro de esa área visible, también en iPad.
  Sólo en teléfonos compactos se reduce el avión aproximadamente un 30%; el motor
  usa esas mismas dimensiones para las colisiones y los corredores de vuelo.
- **Pantalla completa nativa:** Comenzar y Continuar solicitan la Fullscreen API
  desde el gesto del alumno, con `navigationUI: 'hide'`. El botón ⛶ permite entrar
  o salir; Cerrar libera únicamente el fullscreen del propio juego. Se mantiene
  el mismo portal con HUD, escenario, palanca, premios y paneles. En fullscreen
  se usan las dimensiones completas y no los offsets antiguos de las barras.
  Salir mediante Escape o un gesto del navegador pausa y conserva el avance;
  salir con el botón ⛶ permite seguir jugando en el área visible del navegador.
  Hay compatibilidad con métodos WebKit prefijados; se informa de rechazo o falta
  de soporte sin bloquear la partida. No se puede obligar a un navegador sin API
  de fullscreen de elementos a esconder sus barras: no se finge un vídeo ni se
  rota la página. Safari compatible de iPad puede usar el modo nativo; un iPhone
  o navegador concreto que no lo admita conserva el área visible y muestra ayuda.
- **Premios:** cada acierto concede uno aleatorio si queda un hueco, con máximo
  dos espacios fijos. En PC se activan con **E/R** (sin autorrepetición); en táctil,
  tocando sus botones a la derecha. Sólo se usan durante el vuelo, fuera del choque.
  No se reemplazan premios guardados cuando ambos espacios están ocupados.
  - Vida extra: recupera una, hasta cinco; si ya hay cinco no consume el premio.
  - Cámara lenta: ocho segundos activos al 55% de velocidad del mundo, incluidos
    conceptos, obstáculos existentes/nuevos y parallax, sin frenar el avión.
  - Puntos ×2/×3: multiplican los puntos del próximo acierto, no la nota; otro
    multiplicador sustituye el anterior y no se acumula. Un error no lo consume.
  - Rayo: retira obstáculos de las colisiones y muestra hasta ocho fragmentos
    cayendo/girando durante 0.9 segundos. Retira la tarjeta falsa sin responder;
    sólo circula el concepto correcto de esa definición hasta contestar.
  - Señalar respuesta: resalta la tarjeta correcta cuando aparece, sin contestar
    automáticamente. El alumno todavía debe pilotar hacia ella.
  Los temporizadores, fragmentos y destello usan el reloj del juego y se congelan
  al pausar, leer, ver explicaciones o reaccionar al choque. La portada explica
  cada premio y los controles correspondientes al dispositivo. La fórmula
  académica y la evidencia de respuestas permanecen independientes de los puntos.
- Música: `Paper_Wings_and_Sunday_Naps.mp3`, provista por el propietario del
  proyecto y copiada sin modificar a `public/games/flying-cat/audio`.
  Se carga al pulsar **Comenzar**, en bucle y con volumen moderado. El botón del
  altavoz permite silenciar/activar y recuerda la preferencia en este navegador.
  Pausar, cambiar de pestaña, girar a vertical, terminar o salir detiene el audio;
  continuar reanuda la misma pista. Si el navegador bloquea el sonido o falla el
  archivo, se puede activar de nuevo sin bloquear el juego. No hay autoplay al
  abrir la portada ni dependencias de servicios externos de audio.
- En teléfonos compactos se exige orientación horizontal. En vertical se muestra
  «Gira tu teléfono para jugar», con instrucciones sobre el bloqueo de orientación.
  No se rota la página por CSS ni se fuerza una API de orientación que Safari no
  admita: se detectan las dimensiones reales del navegador. Volver a vertical
  pausa y conserva la partida; al girar de nuevo se pide continuar. Los iPad
  amplios admiten ambas orientaciones. El resumen final sí se puede leer en vertical.
- Cada dos definiciones aumenta el nivel y, de forma acotada, la velocidad. Se
  empieza con tres vidas; los premios permiten llegar a cinco. Al agotarlas se
  muestra el avión rompiéndose y el gato cayendo durante
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
Comprueba 390×844, 320×568, 844×390, iPad 768×1024 y 1024×768, y PC 1280×800:
portada y selección de dificultad, definición persistente y explicación largas,
palanca circular dentro del escenario y WASD exclusivos, avance de dos preguntas,
reacción al choque, escudo, guardado único y reintento de conexión.
También simula un dashboard con transformaciones/recortes, un área visible de iPad
menor que la ventana y sus cambios, y verifica música, mute y salida sin scroll bloqueado.
Mide el desplazamiento de las cinco capas, sus velocidades distintas y la pausa
del paisaje al leer o ver explicaciones. Comprueba continuidad al girar o cambiar
el área visible y al activar/desactivar la preferencia de movimiento reducido.
Las pruebas del componente cubren además bucles largos con DOM constante,
limpieza de eventos y renderizado seguro en servidor.
Comprueba también fullscreen nativo y su limpieza al salir, ambos espacios de
premios y ajustes de control persistidos. Las pruebas de motor/UI cubren los
seis premios, aciertos/errores, límites, doble activación, E/R, multitáctil,
caída de obstáculos, señal de respuesta y calificación académica sin multiplicar.
Conserva capturas en la carpeta temporal que imprime al terminar. No escribe en Supabase ni envía
notificaciones reales.

Prueba opcional con el proveedor real (consume tokens con la clave local existente,
sin imprimirla ni escribir actividades o notas en Supabase):

```sh
node scripts/games/test-flying-cat-ai.mjs
```
