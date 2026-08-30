# Resultados de cierre — Paso 12

Fecha: 2026-08-29 (America/Mexico_City)

## Resultado

Los ejercicios automáticos y las entregas descriptivas usan una única ruta transaccional de persistencia. La escala autoritativa es 0–10 en base, acciones, dashboards y contexto de IA. La creación/edición exige periodo y criterio activos, incluyendo actividades sincronizadas por agrupación.

## Base de datos

- Migración nueva: `20260829032136_academic_unify_exercise_results_step12.sql`.
- PostgreSQL local desechable: instalación limpia, datos existentes, backfill idempotente, lint, plan de índice y rollback aprobados.
- Supabase remoto: se comprobó primero que `resultados_ejercicios` contenía cero filas. Las migraciones académicas 2–8, que aún no estaban aplicadas, y la del Paso 12 se ejecutaron juntas en una transacción y se registraron en `supabase_migrations.schema_migrations`.
- Verificación remota posterior: 1 ciclo activo, 1 inscripción activa, 1 asignación activa, 3 periodos, 0 resultados legacy, 0 notas fuera de 0–10 y 0 vínculos activos duplicados; RPC presentes; `anon=false`, `authenticated=true` para ejecución de resultado.

## Pruebas

- Base de datos Paso 12: 12 aserciones estructurales + 32 de comportamiento aprobadas.
- Casos explícitos: 0/100→0/10, 50/100→5/10, 100/100→10/10, 5/100→0.5/10, múltiples intentos, perfecto bloqueado, repetición idempotente, versión obsoleta, descriptiva 8.5/10, vencido sin persistir, tenant/profesor/usuario ajeno y cierre.
- `supabase db lint`: cero resultados.
- Tipos generados desde PostgreSQL: contratos de ambas RPC sincronizados.
- Pruebas específicas Paso 12: 9 aprobadas.
- Suite unitaria: 139/139.
- Componentes: 21/21.
- TypeScript: cero errores.
- E2E Chromium: 6/6 en escritorio y móvil.
- Build Next.js de producción: aprobado, 56/56 páginas.
- `git diff --check`: aprobado.

## Seguridad

No se guardaron contraseñas, tokens, connection strings ni service keys en código, fixtures, documentos o migraciones. Los fixtures usan UUID, correos y CURP sintéticos. Ningún color institucional fue hardcodeado; la UI nueva usa tokens semánticos existentes.

## Operación

No se alteraron la política de Storage ni el cron de caducidad. Los archivos continúan con su ruta por tenant, acceso firmado y fecha de conservación existente. No se inició el Paso 13.
