# Resultados de cierre — Paso 4

Fecha: 2026-08-26  
Unidad: criterios, subcriterios y reglas de ponderación  
Alcance remoto: ninguno; todas las validaciones se ejecutaron en PostgreSQL desechable local.

## Implementación

- Migración aditiva para `criterios_evaluacion`, `subcriterios_evaluacion` y procedencia de versiones.
- Checks de tipos, rangos, orden, nombres y configuración JSON cerrada.
- FK compuestas e índices por tenant/padre, incluidos índices parciales de lectura activa.
- RLS forzada y grants explícitos: admin/superusuario configura; profesor sólo lee su asignación; alumno, anon y otro tenant no acceden.
- RPC `activar_esquema_evaluacion`: bloqueo corto, versión esperada y validación exacta superior/interna.
- RPC `copiar_esquema_evaluacion`: copia histórica idempotente sin reescribir la fuente.
- Funciones TypeScript puras para suma, redistribución determinista e impacto efectivo.
- Validador Zod discriminado por tipo y componente accesible aislado con tokens marca blanca.
- Tipos de Supabase regenerados desde un clon desechable del esquema real más las migraciones 2–4.

## Evidencia ejecutable

- `006_paso4_structure.sql`: 66 aserciones estructurales, RLS, grants por columna, RPC y volatilidad.
- `007_paso4_integrity_rls.sql`: 34 aserciones de integridad, límites, exactitud, versionado y aislamiento.
- `test-step4-database.sh`: base limpia, datos previos, pgTAP, EXPLAIN, carrera real edición/activación y rollback.
- `academic-weights.test.ts`: suma, decimales, residuo, cero, errores e idempotencia.
- `academic-criterion-policy.test.ts`: contratos JSON válidos e inválidos.
- `academic-weight-distribution.test.tsx`: estados exacto/incompleto/excedido, impacto y acciones accesibles.

## Resultado final de validación

- PostgreSQL/pgTAP: `100/100` aserciones aprobadas (`66` estructura + `34` integridad/RLS).
- Carrera concurrente real: la activación esperó el bloqueo de edición y rechazó el total final `90.0000`.
- Suite unitaria completa: `55/55` aprobadas.
- Suite de componentes completa: `7/7` aprobadas.
- Revalidación focal posterior al endurecimiento: `29/29` aprobadas.
- `npm run typecheck`: cero errores.
- Playwright: dos casos descubiertos, escritorio y móvil; no se ejecutó contra un servidor desplegado.
- `npm run build`: aprobado, 53 páginas estáticas generadas.
- `supabase db lint` sobre el esquema académico desechable: sin errores.
- El lint del clon completo reporta una referencia histórica a `storage.foldername` porque el volcado sólo contiene `public/private` y no restaura el esquema `storage`; no pertenece al Paso 4.
- `npm run lint` no es una puerta automatizable actualmente: el script heredado usa `next lint`, obsoleto, y abre un asistente interactivo. No se creó una configuración ESLint nueva fuera de alcance.
- `git diff --check` y escaneo de secretos del diff: aprobados.

## Rollback

La migración es aditiva y se probó dentro de una transacción revertida. Antes de cualquier despliegue futuro debe existir respaldo. El orden manual de reversión sería: revocar/eliminar RPC y políticas del Paso 4, eliminar tablas hijas, funciones privadas e índices, retirar la FK/índice de procedencia y finalmente retirar `copiado_desde_id`. No se incluye una migración destructiva automática.

## Límite deliberado

No se conectaron todavía actividades, participaciones u otras fuentes reales: corresponde al Paso 5. Tampoco se creó una ruta final de edición ni se desplegó a producción.
