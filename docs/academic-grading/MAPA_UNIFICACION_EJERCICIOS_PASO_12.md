# Mapa de unificación de ejercicios — Paso 12

## Autoridad y escala

- La calificación persistida en `resultados_ejercicios.calificacion` siempre está en 0–10.
- El porcentaje 0–100 existe únicamente como entrada/evidencia de un intento automático.
- `calificacion_manual` permanece sólo como sombra de rollback en el esquema; ningún consumidor de aplicación la lee o escribe.
- La identidad del actor y el tenant se derivan de `auth.uid()` y de la membresía activa. No son parámetros confiados del cliente.

## Flujo automático

`ClientStudentPlayer` → `saveExerciseResult` → validación hits/total/% → lectura de `row_version` con sesión → `guardar_resultado_ejercicio_academico(automatic_attempt)` → bloqueo/versión/idempotencia/auditoría dentro de PostgreSQL.

La RPC recalcula el porcentaje desde aciertos/total, lo compara con la entrada, divide una sola vez entre diez, agrega el histórico explícito (`porcentaje_bruto`, `calificacion_10`, `scaleVersion`) y promedia intentos en 0–10. Un intento perfecto deja el resultado bloqueado.

## Flujo descriptivo

La subida y caducidad del archivo no cambian. `PanelEntregasProfesor`/`PanelEntregasGlobales` → `calificarEntregaDescriptiva` → validación 0–10 → `guardar_resultado_ejercicio_academico(descriptive_grade)` con versión esperada → actualización, bloqueo y auditoría en la misma transacción.

## Vínculo evaluable

Al crear o editar una actividad, el profesor debe escoger periodo y criterio activo por asignación. En agrupaciones se guarda una selección por grupo. `configurar_vinculo_evaluacion_ejercicio` verifica sesión, profesor/asignación, tenant, ciclo, esquema activo, criterio de actividades y cierre. El índice parcial único impide más de un vínculo activo para el mismo ejercicio/tenant.

## Backfill

La migración `20260829032136_academic_unify_exercise_results_step12.sql`:

1. Bloquea históricos automáticos multiintento sin evidencia conciliable.
2. Normaliza históricos de modo idempotente y auditable.
3. Enlaza solamente resultados con contexto académico inequívoco.
4. Conserva entregas descriptivas directamente en 0–10.
5. No inventa asignaciones para filas ambiguas.

## Aislamiento y concurrencia

- `anon` no ejecuta las RPC.
- `authenticated` no posee `INSERT`/`UPDATE` directo sobre resultados.
- Cada operación usa idempotency key y compare-and-swap mediante `row_version`.
- Profesor ajeno, tenant ajeno, usuario suspendido, periodo cerrado y porcentaje manipulado fallan cerrados.
- La auditoría registra before/after, actor, asignación, periodo, inscripción y correlación.

## Rollback

El código anterior puede recuperarse revirtiendo el commit del Paso 12, pero no debe reactivarse una escritura directa de calificaciones. La migración es aditiva; `calificacion_manual` se conserva temporalmente como sombra. Para revertir DDL se debe preparar una migración compensatoria revisada, nunca borrar tablas ni restaurar a ciegas.
