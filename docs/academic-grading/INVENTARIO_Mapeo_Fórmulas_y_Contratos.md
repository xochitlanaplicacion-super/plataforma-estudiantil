# Inventario remoto reproducible — Paso 1

Inspección: 2026-08-22, PostgreSQL 17.6, transacciones `BEGIN READ ONLY … ROLLBACK`. No se ejecutó DDL/DML remoto ni se extrajo PII. Los UUID de tenant se sustituyeron por alias (`tenant_1`).

## Reproducción

- Catálogos, conteos y distribución: `docs/academic-grading/evidence/STEP1_READ_ONLY_INVENTORY.sql` con `psql -X -f …` sobre una conexión autorizada.
- Exposición normal PostgREST: `node scripts/academic-grading/step1-openapi-inventory.mjs .env.local` usando una clave secreta sólo en el proceso local de servidor. Desde abril de 2026 Supabase retiró el acceso al esquema OpenAPI mediante claves `anon`/publicables.
- Contrato local pgTAP: `supabase/tests/database/001_paso1_baseline.sql` mediante `npm run test:db` contra Supabase local.
- Migraciones observadas: 15, desde `backup_pre_multitenant_20260819` hasta `remove_legacy_survey_rpcs`; el listado exacto lo emite el SQL reproducible.

## Resultado OpenAPI

- HTTP 200, `application/openapi+json`, 294599 bytes, SHA-256 `cf4efdb368cb49ed14e84edd0dbd1bc4113f8ffa1ddd0f885a9df72a878052da` al inspeccionar.
- Presentes: las 13 tablas base de este inventario.
- Ausentes tanto en OpenAPI como `to_regclass`: `ciclos_escolares`, `periodos_evaluacion`, `esquemas_evaluacion`, `criterios_evaluacion`, `subcriterios_evaluacion`, `snapshots_calificaciones`.
- La ausencia se verificó con una solicitud OpenAPI normal y catálogo PostgreSQL; no se infirió mediante un conteo `HEAD`.
- El script envía la clave exclusivamente como `apikey`; nunca la imprime, persiste ni reutiliza como JWT `Bearer`.

## Conteos no sensibles

| Tabla | Tenant 1 |
|---|---:|
| `profiles` | 3 (`superuser=1`, `profesor=1`, `alumno=1`; todos activos) |
| `niveles` | 1 |
| `carreras` | 1 |
| `grados` | 1 |
| `grupos` | 1 |
| `materias` | 1 |
| `grupo_materias` | 0 |
| `asignaciones_profesor` | 1 |
| `inscripciones_alumno` | 0 |
| `ejercicios` | 6 |
| `resultados_ejercicios` | 0 |
| `fechas_evaluacion` | 0 |
| `auditoria` | 0 |

## Distribución de campos de nota

`resultados_ejercicios` no tiene filas. Por ello `min/max`, estados, nulos efectivos e ítems de `historico_intentos` no aportan una muestra estadística; los cuatro conteos fuera de rango observados son 0 por conjunto vacío, no una garantía del contrato futuro. El esquema permite actualmente:

- `calificacion numeric null default 0`, sin check de rango; contrato de código heredado 0–100.
- `calificacion_manual numeric null`, sin check de rango; contrato de código 0–10.
- `suma_calificaciones numeric null default 0`, sin check de rango; suma de intentos 0–100.
- `historico_intentos jsonb null default []`, sin JSON Schema; `[*].calificacion` se escribe 0–100.

## Catálogo completo de columnas

Convención: `!` no nulo, `?` nullable. Los defaults exactos se obtienen del SQL reproducible.

- `asignaciones_profesor`: `id:uuid!`, `profesor_id:uuid?`, `nivel_id:uuid?`, `carrera_id:uuid?`, `grado_id:text?`, `grupo_id:uuid?`, `materia_id:uuid?`, `activo:bool?`, `created_at:timestamptz?`, `tenant_id:uuid!`.
- `auditoria`: `id:uuid!`, `user_id:uuid?`, `accion:varchar!`, `entidad:varchar!`, `entidad_id:uuid?`, `detalles:jsonb?`, `created_at:timestamptz?`, `tenant_id:uuid!`.
- `carreras`: `id:uuid!`, `nivel_id:uuid?`, `nombre:varchar!`, `clave:varchar?`, `activo:bool?`, `created_at:timestamptz?`, `tenant_id:uuid!`.
- `ejercicios`: `id:uuid!`, `tema_id:uuid?`, `titulo:varchar!`, `descripcion:text?`, `tipo:varchar?`, `contenido:jsonb?`, `orden:int4?`, `publicado:bool?`, `visible:bool?`, `created_by:uuid?`, `created_at:timestamptz?`, `updated_at:timestamptz?`, `fecha_entrega:timestamptz?`, `sync_id:uuid?`, `tenant_id:uuid!`.
- `fechas_evaluacion`: `id:uuid!`, `grupo_id:uuid!`, `materia_id:uuid?`, `fecha_evaluacion:date!`, `descripcion:text?`, `created_by:uuid?`, `created_at:timestamptz!`, `updated_at:timestamptz!`, `tenant_id:uuid!`.
- `grados`: `id:uuid!`, `carrera_id:uuid?`, `nombre:varchar!`, `orden:int4?`, `activo:bool?`, `created_at:timestamptz?`, `tenant_id:uuid!`.
- `grupo_materias`: `id:uuid!`, `grupo_id:uuid?`, `materia_id:uuid?`, `activo:bool?`, `created_at:timestamptz?`, `tenant_id:uuid!`.
- `grupos`: `id:uuid!`, `grado_id:uuid?`, `nombre:varchar!`, `turno:varchar?`, `activo:bool?`, `created_at:timestamptz?`, `carrera_id:uuid?`, `tenant_id:uuid!`.
- `inscripciones_alumno`: `id:uuid!`, `alumno_id:uuid?`, `nivel_id:uuid?`, `carrera_id:uuid?`, `grado_id:uuid?`, `grupo_id:uuid?`, `fecha_inicio:date?`, `fecha_fin:date?`, `activo:bool?`, `created_at:timestamptz?`, `tenant_id:uuid!`.
- `materias`: `id:uuid!`, `carrera_id:uuid?`, `grado_id:uuid?`, `nombre:varchar!`, `clave:varchar?`, `descripcion:text?`, `activo:bool?`, `created_at:timestamptz?`, `tenant_id:uuid!`.
- `niveles`: `id:uuid!`, `nombre:varchar!`, `descripcion:text?`, `activo:bool?`, `created_at:timestamptz?`, `imagen_correo_url:text?`, `imagen_bienvenida_url:text?`, `tenant_id:uuid!`.
- `profiles`: `id:uuid!`, `nombre:varchar!`, `apellidos:varchar!`, `curp:varchar!`, `email:varchar!`, `telefono:varchar?`, `rol:varchar!`, `estatus:varchar?`, `fecha_inicio:date?`, `fecha_expiracion:date?`, `matricula:varchar?`, `numero_empleado:varchar?`, `created_at:timestamptz?`, `updated_at:timestamptz?`, `fecha_nacimiento:date?`, cuatro banderas documentales, `carrera_id:uuid?`, `grupo_id:uuid?`, `genero:varchar?`, `foto_perfil:text?`, `tenant_id:uuid?`.
- `resultados_ejercicios`: `id:uuid!`, `alumno_id:uuid!`, `ejercicio_id:uuid!`, `calificacion:numeric?`, `aciertos:int4?`, `total_preguntas:int4?`, `estado:text?`, `fecha_completado:timestamptz?`, `intentos:int4?`, `suma_calificaciones:numeric?`, `bloqueado:bool?`, `archivo_url:text?`, `archivo_nombre:text?`, `archivo_path:text?`, `primer_envio_en:timestamptz?`, `caduca_el:timestamptz?`, `calificacion_manual:numeric?`, `historico_intentos:jsonb?`, `tenant_id:uuid!`.

## Constraints por tabla

Tipos: `p` PK, `f` FK, `u` unique, `c` check. La definición completa (columnas, referencias y acciones) está en el SQL reproducible.

- `asignaciones_profesor`: PK; FKs a profesor, nivel, carrera, grupo, materia y tenant. No tiene unique de asignación exacta ni FK compuesta con tenant; `grado_id` además es `text`, inconsistente con `grados.id uuid`.
- `auditoria`: PK; FKs a perfil y tenant. No existe constraint append-only.
- `carreras`: PK; FKs a nivel y tenant.
- `ejercicios`: PK; FKs a creador, tema y tenant.
- `fechas_evaluacion`: PK; FKs a creador, grupo, materia y tenant; unique simple `(grupo_id,materia_id)`.
- `grados`: PK; FKs a carrera y tenant.
- `grupo_materias`: PK; FKs a grupo, materia y tenant; unique simple `(grupo_id,materia_id)`.
- `grupos`: PK; FKs a grado, carrera y tenant.
- `inscripciones_alumno`: PK; FKs a alumno, nivel, carrera, grado, grupo y tenant. No incluye ciclo ni unique de matrícula vigente.
- `materias`: PK; FKs a carrera, grado y tenant.
- `niveles`: PK; FK a tenant.
- `profiles`: PK/FK a `auth.users`; FKs a carrera, grupo y tenant; unique global de email; unique tenant-CURP; checks de rol/estatus.
- `resultados_ejercicios`: PK; FKs a alumno Auth, ejercicio y tenant; unique simple `(alumno_id,ejercicio_id)`. No hay checks de notas/estado ni FK compuesta tenant-safe.

## Índices

Todos los nombres observados quedan cubiertos por la consulta de `pg_indexes`. Resumen completo por tabla:

- `asignaciones_profesor` (7): PK, `tenant_id`, `profesor_id`, `nivel_id`, `carrera_id`, `grupo_id`, `materia_id`.
- `auditoria` (3): PK, `tenant_id`, `user_id`.
- `carreras` (4): PK, unique `(id,tenant_id)`, `tenant_id`, `nivel_id`.
- `ejercicios` (5): PK, `tenant_id`, `created_by`, `sync_id`, `tema_id`.
- `fechas_evaluacion` (6): PK, unique grupo-materia, `tenant_id`, `created_by`, `grupo_id`, `materia_id`.
- `grados` (4): PK, unique `(id,tenant_id)`, `tenant_id`, `carrera_id`.
- `grupo_materias` (5): PK, unique grupo-materia, `tenant_id`, `grupo_id`, `materia_id`.
- `grupos` (5): PK, unique `(id,tenant_id)`, `tenant_id`, `carrera_id`, `grado_id`.
- `inscripciones_alumno` (7): PK y uno por `tenant_id`, alumno, nivel, carrera, grado y grupo.
- `materias` (4): PK, `tenant_id`, carrera y grado.
- `niveles` (3): PK, unique `(id,tenant_id)`, `tenant_id`.
- `profiles` (12): PK, unique email, tenant-CURP, `(id,tenant_id)`, y simples para tenant, carrera, grupo, CURP, estatus, expiración, rol e id.
- `resultados_ejercicios` (6): PK, unique alumno-ejercicio, tenant, alumno, ejercicio e índice parcial de `caduca_el` para archivos pendientes.

## Triggers

- Las 13 tablas tienen `private.enforce_tenant_id()` en `BEFORE INSERT` y `BEFORE UPDATE` (26 entradas de `information_schema.triggers`).
- `profiles` añade `update_profiles_updated_at`; `ejercicios` añade `trigger_ejercicios_updated_at`.
- El inventario no asume que el trigger sustituye FKs compuestas; sólo impide cambiar/inyectar tenant según su implementación actual.

## RLS y políticas

Todas las tablas tienen RLS habilitada, no `FORCE ROW LEVEL SECURITY`, propietario `postgres`.

- Todas incluyen `tenant_boundary`, `RESTRICTIVE`, `ALL`, con `tenant_id = private.current_tenant_id()`; `profiles` permite además el propio `auth.uid()`.
- Todas incluyen lecturas/manejo tenant genérico. `profiles` tiene políticas de propio perfil.
- Riesgos heredados demostrados: `ejercicios` conserva políticas `USING true`, lectura pública y `auth.role()`; `grupo_materias` conserva `ALL USING true`; `fechas_evaluacion` conserva lectura pública; `resultados_ejercicios` permite al profesor gestionar todo el tenant y contiene políticas `TO public`. La barrera restrictiva evita el cruce tenant cuando el claim es correcto, pero no limita profesor por asignación/materia/grupo.
- La política de alumno `UPDATE` en resultados no declara `WITH CHECK` en una de sus variantes.
- Estas políticas no se corrigen en Paso 1 porque sería un cambio remoto; son requisito explícito del Paso 6 y deben tener pruebas negativas.

## Grants

Las 13 tablas conceden a `anon`, `authenticated` y `service_role` las siete capacidades de tabla (`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`): 21 filas de grant por tabla. RLS reduce filas, pero los grants no siguen mínimo privilegio. Los pasos de esquema deberán revocar y conceder explícitamente; la ruptura de Data API de 2026 hace incorrecto depender de autoexposición de tablas nuevas.

## Conclusión de preparación

El tenant actual no tiene resultados que convertir hoy, pero el código puede crearlos en unidades incompatibles. Los datos existentes de estructura y ejercicios deben preservarse. Antes de una segunda escuela se necesitan claves compuestas tenant-safe, autorización exacta de profesor, ciclo/matrícula histórica, motor único y corte de fórmulas heredadas conforme a los pasos 2–14.

## Reproducibilidad local descubierta en el cierre

`supabase db start` no puede reconstruir todavía una base vacía sólo con `supabase/migrations`: la primera migración versionada (`20260718_bucket_programas_archivos.sql`) crea una política que consulta `public.profiles`, pero el historial no contiene la creación previa de esa tabla. Esto es deuda histórica demostrada, no un fallo del esquema remoto ni de pgTAP. No se reescribieron migraciones anteriores porque el Paso 1 prohíbe cambios de base y alteración retrospectiva del historial.

Para comprobar el runner sin datos se levantó PostgreSQL 17.6 en un contenedor temporal, se clonaron por `pg_dump --schema-only` únicamente los esquemas `public` y `private`, y se ejecutó pgTAP allí: 43/43 aserciones aprobadas. El contenedor fue eliminado al terminar. El Paso 2 deberá aportar y probar una estrategia de baseline limpio antes de poder cumplir su propia matriz “base limpia/existente”.

Referencias vigentes consultadas: [API keys de Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [cambio de OpenAPI para claves públicas](https://supabase.com/changelog), [desarrollo local con CLI](https://supabase.com/docs/guides/local-development/cli-workflows) y [testing/linting local](https://supabase.com/docs/guides/local-development/cli/testing-and-linting).
