# ADR-001 — Escala única 0–10 y frontera de migración

- Estado: ACEPTADO para arquitectura; decisiones institucionales relacionadas se controlan en `DECISIONES_INSTITUCIONALES_OBLIGATORIAS.md`.
- Fecha: 2026-08-22.
- Alcance: todo valor que represente una calificación académica en base de datos, dominio, RPC, Server Action, interfaz, auditoría, snapshot, exportación y contexto enviado a IA.
- Decisor: propietario de la plataforma; la orden expresa previa estableció escala 0–10.

## Contexto

El sistema heredado usa simultáneamente dos unidades. Los ejercicios automáticos producen porcentajes 0–100 y los guardan en `resultados_ejercicios.calificacion`, `suma_calificaciones` e `historico_intentos[*].calificacion`. Las entregas descriptivas reciben una nota 0–10, la duplican en `calificacion_manual` y escriben `nota * 10` en `calificacion`. Varias lecturas priorizan `calificacion` y luego `calificacion_manual`; otras dividen entre diez; otras muestran `/10` sin dividir y el copiloto muestra `/100`. Este diseño permite resultados numéricamente plausibles pero semánticamente incorrectos.

## Decisión

1. La única escala de calificaciones será `0.0000–10.0000`, inclusiva.
2. El almacenamiento futuro será `numeric(6,4)` con `check (valor >= 0 and valor <= 10)`. No se usará `float` para notas ni ponderaciones.
3. Los pesos de criterios continuarán en porcentaje `0–100`; un peso no es una nota y debe nombrarse como `peso_porcentaje`.
4. Una fuente automática puede calcular un porcentaje bruto 0–100 como evidencia, pero debe normalizarlo exactamente una vez al entrar al dominio:

   `nota_10 = porcentaje_100 / 10`

5. `src/lib/academic-grading/scale.ts` es el contrato ejecutable inicial. Toda escritura posterior deberá usar `Grade10`/`assertGrade10` o una validación equivalente en PostgreSQL.
6. El valor exacto almacenado conserva cuatro decimales y no se modifica para presentación. La interfaz muestra un decimal con redondeo decimal `HALF_UP`, aplicado únicamente al final.
7. “Sin capturar”, “no entregó” y “justificado” son estados explícitos. `null` no equivale automáticamente a cero.
8. No se inferirá la unidad de un dato sólo por su valor. Por ejemplo, `8` puede ser 8/10 o 8/100. La migración usará campo de origen, versión de migración y contrato de escritura conocido.
9. El cierre de periodo generará snapshots inmutables; cambios posteriores de pesos o redondeo no recalcularán historia cerrada.

## Catálogo de campos heredados

| Ubicación | Unidad actual | Semántica | Escritura conocida | Decisión de migración |
|---|---:|---|---|---|
| `resultados_ejercicios.calificacion` | 0–100 | Promedio acumulado de intentos automáticos; para descriptivas es `manual * 10` | `saveExerciseResult`, `calificarEntregaDescriptiva` | Convertir por origen/versionado a 0–10; luego convertir la columna canónica a `numeric(6,4)` y añadir rango |
| `resultados_ejercicios.calificacion_manual` | 0–10 | Nota descriptiva ingresada por docente | `calificarEntregaDescriptiva` | Mantener durante compatibilidad, copiar a valor canónico sin multiplicar y retirar sólo tras demostrar equivalencia |
| `resultados_ejercicios.suma_calificaciones` | suma de valores 0–100 | Acumulador de intentos automáticos | `saveExerciseResult` | Convertir cada contribución conocida; sustituir por eventos/fuente explicable, no por heurística global |
| `resultados_ejercicios.historico_intentos[*].calificacion` | 0–100 | Porcentaje de cada intento | `saveExerciseResult` | Conservar porcentaje bruto como evidencia con nombre/unidad explícita y guardar nota normalizada aparte |
| `aciertos / total_preguntas` | ratio | Evidencia primaria del intento | jugador de ejercicios | Recalcular `ratio * 10` cuando los datos sean válidos; no tratarlo como ponderación |
| `acreditaciones.calificacion_numerica` | contrato diferente | Evaluación de acreditación externa a la libreta | módulo de acreditaciones | Fuera de este plan; no migrar ni mezclar con la libreta escolar |

## Fórmulas canónicas

- Nota automática: si `total_preguntas > 0`, `nota = (aciertos / total_preguntas) * 10`.
- Promedio simple provisional: `sum(notas incluidas) / count(notas incluidas)`, antes de que el motor ponderado del Paso 7 sea la única fuente.
- Nota ponderada: `nota * (peso_porcentaje / 100)`.
- Participación: `ratio_0_1 * 10` antes de aplicar su peso.
- Resultado final: suma de aportes ponderados; nunca se divide o multiplica por 10 después del límite de normalización.

## Matriz resumida rol × operación

| Operación | Superuser tenant | Admin tenant | Profesor asignado y vigente | Alumno matriculado | Platform admin |
|---|---:|---:|---:|---:|---:|
| Configurar ciclos, periodos y esquemas | Sí | Sí | No | No | No por defecto |
| Leer libreta del tenant | Sí | Sí | Sólo su asignación exacta | Sólo resultado propio | Sólo metadatos agregados |
| Capturar/corregir notas | Sí, auditado | Sí, auditado | Sólo su asignación y periodo editable | No | No |
| Cerrar periodo | Sí, auditado | Sólo con capacidad explícita y auditoría | No | No | No |
| Reabrir periodo | Sí, con motivo obligatorio | Sólo con capacidad explícita y motivo obligatorio | No | No | No |
| Consultar snapshot cerrado | Sí | Sí | Sólo su asignación histórica | Sólo propio | No salvo soporte autorizado/auditado |

La matriz normativa completa y los casos negativos están en `MATRIZ_AUTORIZACION_ACADEMICA.md`. La autorización requiere simultáneamente identidad válida, tenant coincidente, rol/capacidad, usuario y tenant activos, asignación o matrícula exacta, ciclo/periodo válidos y estado compatible.

## Consecuencias

- Se elimina la ambigüedad de unidad y las fórmulas duplicadas.
- La transición requiere backfill idempotente, doble lectura temporal controlada y pruebas de equivalencia antes de retirar campos.
- Interfaces antiguas que muestran `%`, `/100`, dividen entre 10 o usan umbrales 70/50 están catalogadas y deben migrarse en los pasos 12–14.
- La conversión no se ejecuta en este Paso 1; la base remota permanece intacta.

## Alternativas rechazadas

- Conservar 0–100 internamente y mostrar 0–10: mantiene el error de doble interpretación.
- Inferir unidad por `valor <= 10`: corrompe notas válidas bajas en base 100.
- Mantener `calificacion` y `calificacion_manual` indefinidamente: perpetúa dos fuentes de verdad.
- Usar `float`: introduce errores de representación en ponderaciones, cierres y auditoría.

## Verificación obligatoria futura

Antes del corte final deberá cumplirse: cero notas fuera de 0–10; cero textos `/100` asociados a calificaciones; equivalencia documentada de los datos existentes; pruebas de reintento idempotente; snapshot estable; y cruce tenant/profesor/alumno denegado en RLS y servidor.
