# Resultados de cierre — Paso 9

## Identificación

- Plan: `EDICION_CALIFICACIONES_MULTITENANT_V2`.
- Paso: `Paso 9 — Crear capa de aplicación y contratos de servidor`.
- Ejecución: `e9-20260828-paso9-000000000001`.
- Alcance: código, contratos, documentación y pruebas locales.
- Base productiva, Vercel y servicios remotos: **sin cambios**.
- Paso 10: **no iniciado**.

## Resultado

El Paso 9 expone todos los casos de uso académicos previstos mediante una API de aplicación única, tipada y server-only. Las Server Actions se tratan como endpoints públicos: vuelven a verificar sesión, tenant activo, rol, feature flag y entrada, y delegan exclusivamente a un servicio/repositorio. Las escrituras usan las RPC atómicas del Paso 8 y las lecturas usan read models `security_invoker` o tablas RLS con tenant explícito.

No se incorporó ninguna fórmula académica a Server Actions, repositorios o componentes. El cálculo final sigue siendo responsabilidad exclusiva de `calcular_resultado_academico` y del motor determinista aprobado en el Paso 7.

## Módulo implementado

### DTOs y estados

`src/lib/academic/dto.ts` define:

- páginas, contexto, libreta, desglose, calificaciones propias, auditoría, cálculo, preview, mutación y cierre;
- estados públicos `success`, `empty`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `validation`, `closed`, `disabled` y `error`;
- `AcademicResourceState<T>` con el estado adicional `loading` para consumidores de UI;
- límites de página, lote, bytes y timeout.

Todos los DTO son serializables y el nuevo módulo contiene cero `any` explícitos.

### Validación

`src/lib/academic/validators.ts` aplica esquemas Zod estrictos:

- UUID válidos y rechazo de propiedades adicionales;
- página inicial 1, tamaño predeterminado 25 y máximo 50;
- lote de 1 a 100 filas y máximo 256 KiB;
- notas exclusivamente 0–10;
- nota obligatoria sólo para estado `calificado`;
- `expectedRowVersion=0` para una nota directa todavía inexistente;
- fuente/criterio obligatorios según tipo;
- observación máxima de 2,000 caracteres;
- motivo de 3 a 500 caracteres;
- claves de idempotencia/correlación con forma UUID;
- validación estructural de todas las respuestas RPC antes de devolverlas a UI.

El cliente no puede enviar `tenant_id`, `actor_id` ni un resultado total calculado porque esos campos no existen en los esquemas públicos y los objetos son estrictos.

### Feature flag progresivo

`src/lib/academic/feature-flags.ts` implementa deny-by-default con dos condiciones simultáneas:

1. `ACADEMIC_GRADING_V2_ENABLED` habilitado en servidor.
2. UUID o slug del tenant presente en `ACADEMIC_GRADING_V2_TENANTS`.

`*` habilita todos los tenants sólo con el switch global encendido. Ninguna variable usa `NEXT_PUBLIC_`; el bundle estático contiene cero referencias a ambos nombres.

### Repositorio

`src/lib/academic/repository.ts` es el único módulo nuevo que conoce nombres de tablas, vistas o RPC. Recibe un `SupabaseClient<Database>` de sesión, nunca un admin client.

- Contexto: asignaciones paginadas y catálogos RLS con `tenant_id` autenticado; para profesor añade `profesor_id=auth.uid()` desde el contexto de servidor.
- Libreta: `vista_libreta_profesor`.
- Desglose: `vista_desglose_calificacion`.
- Alumno: `vista_calificaciones_alumno`, tenant y actor autenticado.
- Auditoría: `auditoria`, tenant explícito y sólo acciones `academic.%`.
- Resultado: `calcular_resultado_academico`.
- Preview: `previsualizar_cierre_calificaciones`.
- Edición: `editar_calificaciones_academicas`.
- Cierre: `cerrar_calificaciones_academicas`.
- Reapertura: `reabrir_calificaciones_academicas`.

Las consultas usan orden estable antes de `range`. Los errores PostgREST/SQL se sanitizan antes de abandonar el repositorio.

### Servicio

`src/lib/academic/service.ts` vuelve a validar capacidades antes de tocar el repositorio:

- superuser/admin/profesor: contexto, libreta, desglose, cálculo y edición;
- superuser/admin: auditoría, preview, cierre y reapertura;
- alumno: exclusivamente sus calificaciones;
- platform admin: no forma parte de los roles tenant y no obtiene acceso implícito.

Timeouts: 12 segundos para lectura y 20 segundos para escritura. El servicio no acepta parámetros de tenant o actor.

### Server Actions

`src/lib/actions/calificaciones.ts` expone diez endpoints tipados. Cada invocación:

1. ejecuta `requireTenantSession()` y, por tanto, `auth.getUser()`;
2. crea el repositorio con el cliente de sesión;
3. resuelve feature flag por tenant;
4. llama al servicio;
5. normaliza la respuesta pública;
6. revalida sólo después de una mutación exitosa.

La revalidación se centraliza en `src/lib/academic/revalidation.ts` para profesor, auditoría administrativa y materias del alumno. No existe UI final en este paso.

El mapa íntegro Action → rol → repositorio → RPC/view está en `docs/academic-grading/MAPA_CAPA_APLICACION_PASO_9.md`.

## Errores públicos

| Estado | HTTP | Uso |
|---|---:|---|
| `unauthenticated` | 401 | sesión ausente/expirada |
| `forbidden` | 403 | rol, perfil o tenant no autorizado |
| `not_found` | 404 | alcance neutral inexistente/no visible |
| `conflict` | 409 | versión, idempotencia o concurrencia |
| `closed` | 409 | escritura sobre alcance cerrado |
| `validation` | 422 | forma, estado, escala o límite inválido |
| `disabled` | 503 | feature flag apagado para tenant |
| `error` | 500/504 | fallo inesperado o timeout |

Nunca se devuelve `detail`, `hint`, stack, SQL, mensaje interno, tenant ajeno ni secreto.

## Database types

`src/lib/database.types.ts` quedó sincronizado con:

- `cierres_calificaciones` y todas sus relaciones;
- `solicitudes_mutacion_academica` y sus relaciones;
- las RPC de cálculo, preview, edición, cierre y reapertura.

`scripts/academic-grading/test-step9-generated-types.sh` levanta PostgreSQL Supabase 17.6 desechable, aplica la historia académica, ejecuta `supabase gen types typescript --db-url ... --schema public` y contrasta los contratos generados con el archivo versionado. La comprobación aprobó y el contenedor fue eliminado. No se usó la base remota.

## Pruebas

### Específicas del Paso 9

21/21 pruebas aprobadas en tres archivos:

- feature flag global/tenant deny-by-default;
- validación de rol antes del repositorio;
- sesión ausente;
- UUID y campos manipulados;
- lote de 101 filas;
- semántica estado/nota y versión inicial;
- contexto actor/tenant obtenido de sesión;
- empty/success;
- conflicto sin revalidación ni resultado parcial;
- revalidación sólo tras éxito;
- profesor sin auditoría/cierre;
- sanitización de errores;
- mapeo exacto de RPC;
- read model, filtros y rango paginado;
- ausencia de `any`, admin client, service key y flags públicos;
- Database types sincronizados.

### Suite completa

- `npm run test:paso9:types`: aprobado con `supabase gen types` real sobre PostgreSQL desechable.
- Pruebas unitarias: 120/120 en 16 archivos.
- Pruebas de componentes: 12/12 en 5 archivos.
- `npm run typecheck`: 0 errores.
- `npm run test:e2e:list`: 2 escenarios, escritorio y móvil.
- `npm run build`: aprobado; compilación optimizada y 53/53 páginas generadas.
- `git diff --check`: aprobado.
- Bundle cliente `.next/static`: 0 referencias a `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `sb_secret_` o los flags académicos de servidor.

## Seguridad y aislamiento

- Sesión validada mediante llamada autenticada al servidor de Supabase.
- Ningún consumidor académico nuevo usa `createSupabaseAdminClient`.
- No existe service key en el módulo, las acciones o el bundle cliente.
- Tenant y actor se obtienen de sesión y se inyectan internamente.
- RLS/funciones vuelven a validar la autorización en base.
- Parámetros de ruta sólo identifican alcance; nunca conceden acceso.
- Los objetos de entrada estrictos rechazan tenant/actor añadidos.
- No se añadieron datos, dominios, colores institucionales ni PII hardcodeada.
- No hubo correo, proveedor, Edge Function, cron, cola, webhook ni llamada externa dentro de operaciones académicas.

## Cambios de base y servicios

- Migraciones nuevas: ninguna.
- DDL/DML remoto: ninguno.
- Backfill: ninguno.
- Supabase productivo: sin cambios.
- Vercel: sin cambios.
- Git remoto: sin push.

## Riesgos pendientes

- Bloqueantes para cerrar el Paso 9: ninguno.
- No bloqueantes:
  - el feature flag permanece apagado hasta una activación explícita;
  - producción todavía no contiene las migraciones académicas locales de Pasos 2–8;
  - la UI administrativa corresponde al Paso 10 y la libreta editable al Paso 11;
  - cache avanzada permanece fuera del alcance;
  - el equipo local ejecuta Node `v20.20.2`; el build actual aprueba con dependencias fijadas, pero una futura actualización de las librerías Supabase debe ejecutarse sobre Node 22 o superior conforme al changelog vigente;
  - Supabase CLI quedó fijado en `2.115.0`; durante la ejecución informó `2.116.0` disponible, sin necesidad de cambiar el lockfile para este paso.

## Rollback

El rollback no afecta datos:

1. mantener o establecer `ACADEMIC_GRADING_V2_ENABLED=false`;
2. retirar imports/consumidores de las Server Actions nuevas;
3. revertir el commit local del Paso 9 si aún no fue publicado.

Con el flag apagado, los endpoints responden `disabled` antes de consultar el repositorio. Las RPC/read models existentes permanecen intactas.

## Condición de parada

Paso 9 cerrado localmente. El Paso 10 permanece `NO_INICIADO` y requiere autorización nueva y expresa.
