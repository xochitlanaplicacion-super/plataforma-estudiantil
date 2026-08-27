# Cierre verificable — Paso 5

## Alcance ejecutado

Se implementaron las fuentes de calificación sin iniciar el editor del Paso 6:
vínculos ejercicio/asignación/periodo/criterio; contexto trazable en resultados;
notas directas sin ejercicio; ledger append-only de participación; estados
separados de la nota; adaptadores backend; contratos de filas/columnas y vistas
seguras.

## Evidencia automática

- PostgreSQL Supabase 17.6 limpio y con datos sintéticos: aprobado.
- pgTAP de estructura: 37/37.
- pgTAP de integridad y RLS: 25/25.
- Índice compuesto asignación/periodo: `Index Only Scan` confirmado.
- `supabase db lint --schema public,private --fail-on error`: sin errores.
- Rollback transaccional: restauró el estado posterior al Paso 4.
- Pruebas unitarias: 61/61 antes de la batería final.
- TypeScript: cero errores antes de la batería final.
- Auditoría remota: sólo lectura; 6 ejercicios, 0 resultados y 0 ambigüedades
  por `sync_id`.

## Casos adversos cubiertos

Fuente duplicada, ejercicio de materia/tenant incorrectos, inscripción fuera de
grupo/ciclo, nota fuera de 0–10, estado sin nota, `justificado`, criterio con
ejercicio intentando nota directa, participación negativa, mutación/borrado del
ledger, edición de nota por alumno, visibilidad cruzada de tenant, visibilidad
docente limitada y filas huérfanas.

## Operación y seguridad

No se creó cron, cola, webhook ni Edge Function. No hubo despliegue, push ni
migración remota. Los secretos locales no aparecen en pruebas o documentación.
Las vistas ejecutan como invocador y las tablas nuevas combinan grants mínimos,
RLS restrictiva de tenant y políticas por rol/asignación/inscripción.

## Rollback

Antes del corte remoto se pueden dejar sin uso las columnas y tablas del Paso 5
y regresar a las lecturas antiguas. Después del corte nunca se deben borrar
resultados ni eventos: los eventos se corrigen con reversas y las filas legacy se
conservan hasta su conciliación formal.
