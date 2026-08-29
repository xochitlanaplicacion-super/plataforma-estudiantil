# Resultados de cierre — Paso 11

## Resultado

La libreta editable del profesor quedó implementada sobre los contratos de los Pasos 8–10. Permite seleccionar ciclo, periodo y asignación; editar individualmente o hasta 100 celdas por lote; guardar de forma explícita; recargar y comprobar persistencia; conciliar timeout/conflicto; consultar desglose; y trabajar con tarjetas móviles.

## Subetapas

1. Ruta `/dashboard/profesor/calificaciones` protegida y enlace “Libreta de calificaciones”.
2. Selector ciclo → periodo → asignación y encabezado de contexto persistente.
3. Cuadrícula alumnos × criterios/actividades con búsqueda, orden y columna de alumno fijada.
4. Captura 0–10 por celda, estado/observación, teclado y lote explícito.
5. Indicadores sin guardar, éxito confirmado, errores por fila, 409 y conciliación; timeout consulta antes de reintentar.
6. Desglose mediante motor canónico y recibo de correlación autorizado.
7. Tarjetas bajo 768 px y tabla compacta desde 768 px.

## Seguridad

- La ruta exige `requireTenantSession(['profesor'])`.
- Servicio deny-by-default por feature flag y rol.
- Repositorio exige `tenant_id` en cada relación y `profesor_id = actorId` para profesor.
- Matrícula, grupo, ciclo, asignación y periodo se encadenan en consultas, RLS y RPC.
- La UI no acepta tenant/actor/profesor como parámetros.
- Profesor ajeno del mismo tenant, tenant B, alumno/admin y usuario suspendido quedan rechazados por las capas preexistentes de sesión, servicio, RLS y RPC.
- Sin `service_role`, admin client, secreto, PII real, dominio, escuela o color hardcodeado.

## Base de datos y servicios

`BASE DE DATOS: SIN CAMBIOS`. No se creó ni modificó migración, tabla, vista, función, política, grant ni dato. No se ejecutó `db push`, DDL/DML remoto, Edge Function, cron, webhook, correo, proveedor, push o despliegue.

## Verificación

- Paso 11 específico: 12/12 pruebas (6 unitarias y 6 de componentes).
- Suite unitaria completa: 130/130 en 18 archivos.
- Suite de componentes completa: 21/21 en 7 archivos.
- Accesibilidad: axe sin infracciones críticas/serias; teclado, etiquetas y estados textuales probados.
- E2E Chromium: 1/1; edición → lote único → recarga, conflicto, cierre, 200 alumnos, 360/768/1440 y video.
- Regresión PostgreSQL desechable del contrato usado por la libreta: 121 aserciones pgTAP, concurrencia real, profesor ajeno, matrícula/tenant B, cierre/reapertura, idempotencia, CAS, rollback y `db lint` aprobados.
- TypeScript: cero errores.
- Typecheck final independiente: aprobado con cero errores.
- Build de producción: aprobado; compilación optimizada y 56/56 páginas, incluida `/dashboard/profesor/calificaciones` (2.3 kB propios, 168 kB de primera carga).
- `git diff --check`, escaneos de secretos/colores/dominios y verificación de migraciones: aprobados en el cierre final.

## Riesgos no bloqueantes

- Feature flag permanece apagado salvo activación explícita de servidor y allowlist tenant.
- Producción aún no contiene las migraciones académicas preparadas en Pasos 2–8.
- El enlace general de ejercicios y entregas a esta libreta pertenece al Paso 12.
- Se limita la pantalla a 200 alumnos y cada lote a 100 celdas para mantener tiempos y payload controlados.

## Rollback

Mantener `ACADEMIC_GRADING_V2_ENABLED=false`, retirar el enlace/ruta o revertir el commit del Paso 11 deshabilita la interfaz sin revertir escrituras válidas. No hay rollback de base de datos porque este paso no la modificó.
