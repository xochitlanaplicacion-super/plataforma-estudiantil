# Rollback del motor determinista — Paso 7

## Antes del corte

El Paso 7 es aditivo y el flag nuevo permanece apagado. Para volver al estado del Paso 6 se revierte el commit local del Paso 7. No existe rollback de datos porque no se crean tablas, no se hace backfill y no se muta producción.

## Después de aplicar la migración en un corte futuro

1. Poner `ACADEMIC_GRADING_ENGINE_V2_ENABLED=false` y verificar que los consumidores usan la lectura heredada.
2. Revocar `EXECUTE` de las dos funciones públicas para detener consumidores nuevos.
3. Aplicar una migración compensatoria que elimine primero `public.calcular_resultado_academico(uuid,uuid,uuid)`, luego `public.calcular_calificacion_academica(jsonb)` y finalmente `private.academic_evaluate_sources(jsonb,text,text,text)`.
4. No borrar ni reescribir fuentes, criterios, periodos o notas: el motor no es propietario de esos datos.

El arnés del Paso 7 prueba esta secuencia dentro de una transacción y confirma que las tres funciones desaparecen tras `ROLLBACK` de la migración sin afectar el esquema del Paso 6.
