# Controles táctiles de juegos individuales

`touch-controls.ts` conecta botones y movimiento de cámara con los manejadores
existentes de cada juego. No altera preguntas, resultados ni permisos del tenant.

- Se habilita en dispositivos con `navigator.maxTouchPoints > 0`.
- Movimiento, cámara y acciones admiten punteros independientes.
- Desde pausa se ajustan tamaño, opacidad y posiciones arrastrando los botones.
- Las preferencias son locales al navegador y al juego (`game-touch-v1:<id>`).
  No se sincronizan entre dispositivos. Si el almacenamiento está bloqueado,
  los controles funcionan pero los ajustes pueden perderse al cerrar.
- Al perder el foco se liberan las teclas y se pausa la partida táctil.

## Verificación

Prueba automatizada: `npx vitest run tests/unit/game-touch-controls.test.ts`.
Los dos proyectos tienen su propia comprobación TypeScript y compilación Vite.
Tras modificar el módulo compartido se deben recompilar **ambos** juegos para
actualizar `public/games/parkour-race` y `public/games/backrooms-scape`.

Antes de publicar, probar ambos juegos en Safari y Chrome de iPad y en Android:

1. Moverse, girar y saltar con varios dedos simultáneamente.
2. Abrir pausa; cambiar tamaño/opacidad y arrastrar controles.
3. Girar el dispositivo y comprobar que los controles quedan accesibles.
4. Recargar y comprobar las preferencias; no se promete conservar la partida.
5. Cambiar de aplicación y regresar sin acciones que queden presionadas.
6. Responder preguntas y finalizar la actividad en modo alumno y previsualización.
7. Verificar teclado y ratón en PC sin pantalla táctil.

La resolución interna puede ajustarse al rendimiento; no se eliminan los
efectos o elementos del escenario. Las pruebas emuladas de controles no miden
el rendimiento 3D real de una tableta ni garantizan una tasa de cuadros fija.
