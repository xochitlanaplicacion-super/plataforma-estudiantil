# Mapa de libreta editable del profesor — Paso 11

## Flujo autorizado

```text
sesión Supabase autenticada
  → requireTenantSession(['profesor'])
  → feature flag global + allowlist del tenant
  → selector ciclo → periodo → asignación devuelto por listContext
  → loadAcademicGradebookWorkspaceAction
  → AcademicGradebookService (rol profesor exclusivamente)
  → SupabaseAcademicGradebookRepository (tenant + actor derivados)
  → tablas/vistas security_invoker + RLS
  → GradebookEditor
  → borradores locales, sin autosave
  → saveAcademicGradesAction (≤100 filas, idempotency key)
  → editar_calificaciones_academicas (RPC atómica, CAS, auditoría)
  → recarga y conciliación canónica
```

El navegador nunca envía `tenant_id`, `actor_id`, `profesor_id`, alumno libre, grupo libre ni materia libre. Sólo envía el alcance previamente devuelto por servidor y los identificadores/versiones de las celdas. La acción vuelve a autenticar y la RPC vuelve a comprobar asignación, periodo, matrícula, tenant y versión.

## Contratos de lectura

- `listAcademicContextAction`: asignaciones activas del profesor autenticado y periodos del ciclo.
- `loadAcademicGradebookWorkspaceAction`: valida UUID estrictos, exige rol profesor y construye el contexto desde relaciones tenant-safe.
- Matrículas: activas, mismo tenant/ciclo/grupo, máximo 200 por pantalla.
- Esquema: única versión activa para asignación y periodo.
- Columnas: criterios/subcriterios directos, actividades enlazadas y participación read-only.
- Celdas: `vista_libreta_profesor`, `security_invoker`, filtrada otra vez por tenant/asignación/periodo/matrículas.
- Cierre: periodo cerrado o última versión de cierre en estado cerrado vuelve toda la libreta read-only.

## Persistencia y concurrencia

- Guardado explícito; no existe efecto de autosave.
- Lote máximo: 100 cambios y 262144 bytes, validado en TypeScript/Zod y PostgreSQL.
- Cada intento nuevo genera una UUID; un reintento incierto conserva exactamente la misma clave.
- La RPC usa compare-and-swap mediante `expectedRowVersion` y revierte el lote completo ante una fila inválida/conflictiva.
- Tras timeout se consulta el estado: sólo se declara éxito si todas las celdas coinciden y avanzaron versión.
- Ante 409 se conserva el valor local y se carga la versión remota. El profesor decide entre revisar, rebasar explícitamente sus valores sobre las nuevas versiones o descartar lo local. Ninguna opción guarda automáticamente.
- El recibo muestra correlación y replay; la auditoría global sigue protegida para admin/superuser por RLS.

## Experiencia de usuario

- Encabezado fijo con ciclo, periodo, materia, grupo, esquema, versión, escala y estado.
- Escritorio: tabla con alumno fijado, búsqueda, orden y celdas navegables con flechas/Enter/Tab.
- Móvil menor de 768 px: tarjetas por alumno/actividad.
- 768 px o más: tabla compacta desplazable con primera columna fijada.
- Cada input tiene `aria-label` alumno + actividad y los errores incluyen texto; nunca dependen sólo del color.
- Observación y estado se editan en diálogo; máximo 2000 caracteres.
- “Ver desglose” invoca el motor determinista canónico, no una fórmula duplicada.
- Colores: sólo tokens semánticos (`primary`, `destructive`, `muted`, `background`, `border`).

## Fuera de alcance

No se creó ni modificó SQL. El enlace automático de ejercicios/entregas y la migración integral de consumidores corresponden al Paso 12. No hubo push, despliegue ni mutación remota.
