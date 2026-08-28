# Mapa de capa de aplicación — Paso 9

## Frontera única

La UI académica debe importar exclusivamente las funciones de `src/lib/actions/calificaciones.ts` y los DTOs públicos de `src/lib/academic/index.ts`. No debe crear consultas Supabase ni fórmulas de calificación dentro de componentes.

Cada invocación sigue esta secuencia:

1. La Server Action obtiene una sesión verificada mediante `auth.getUser()` y resuelve perfil/tenant activo.
2. El feature flag de servidor comprueba el switch global y la allowlist por UUID/slug del tenant.
3. El servicio valida rol, forma, UUID, paginación, escala, estado, tamaño y timeout.
4. El repositorio usa únicamente el cliente de sesión y añade el tenant autenticado como defensa adicional.
5. PostgreSQL vuelve a autorizar mediante RLS/helpers o dentro de la RPC.
6. La respuesta se valida, se transforma a DTO serializable y los errores internos se sustituyen por mensajes públicos estables.
7. Sólo una mutación exitosa revalida las rutas académicas.

## Action → servicio → fuente

| Server Action | Roles de aplicación | Método del repositorio | Fuente autorizada |
|---|---|---|---|
| `listAcademicContextAction` | superuser, admin, profesor | `listContext` | asignaciones/ciclos/periodos y catálogos con RLS, tenant explícito y página acotada |
| `listAcademicGradebookAction` | superuser, admin, profesor | `listGradebook` | `vista_libreta_profesor` (`security_invoker`) |
| `listAcademicBreakdownAction` | superuser, admin, profesor | `listBreakdown` | `vista_desglose_calificacion` (`security_invoker`) |
| `listMyAcademicGradesAction` | alumno | `listStudentGrades` | `vista_calificaciones_alumno` (`security_invoker`) + actor autenticado |
| `listAcademicAuditAction` | superuser, admin | `listAudit` | `auditoria`, RLS tenant y acciones `academic.%` |
| `calculateAcademicResultAction` | superuser, admin, profesor | `calculateResult` | RPC `calcular_resultado_academico` |
| `previewAcademicClosureAction` | superuser, admin | `previewClosure` | RPC `previsualizar_cierre_calificaciones` |
| `saveAcademicGradesAction` | superuser, admin, profesor | `editGrades` | RPC `editar_calificaciones_academicas` |
| `closeAcademicGradesAction` | superuser, admin | `closeGrades` | RPC `cerrar_calificaciones_academicas` |
| `reopenAcademicGradesAction` | superuser, admin | `reopenGrades` | RPC `reabrir_calificaciones_academicas` |

El platform admin no tiene un contexto tenant académico y no aparece en ninguna capacidad. El cliente no puede enviar `tenant_id`, `actor_id` ni una nota total calculada.

## Paginación y límites

- Página inicial: 1.
- Tamaño predeterminado: 25.
- Máximo por página: 50.
- Máximo por lote de edición: 100 filas y 256 KiB.
- Timeout de lectura: 12 segundos.
- Timeout de escritura: 20 segundos.
- Las consultas aplican orden determinista antes de `range`.

## Contrato consumible por UI

`AcademicActionResult<T>` distingue:

- `success`
- `empty`
- `unauthenticated`
- `forbidden`
- `not_found`
- `conflict`
- `validation`
- `closed`
- `disabled`
- `error`

`AcademicResourceState<T>` añade `loading` para el estado local previo a recibir la Server Action. No existe UI final en este paso.

## Feature flag progresivo

Las variables son exclusivamente de servidor:

- `ACADEMIC_GRADING_V2_ENABLED=true`
- `ACADEMIC_GRADING_V2_TENANTS=<uuid-o-slug-1>,<uuid-o-slug-2>`

El comportamiento es deny-by-default. El tenant debe figurar en la allowlist; `*` sólo surte efecto con el switch global habilitado. No se usa prefijo `NEXT_PUBLIC_`.

## Errores y no filtración

Los errores PostgREST/PostgreSQL se reducen a códigos públicos estables. No se devuelve `detail`, `hint`, SQL, existencia de un UUID ajeno, stack, tenant ni secreto. Un `PT409` de alcance cerrado se presenta como `closed`; los demás conflictos se presentan como `conflict`.

## Revalidación

Las mutaciones exitosas invalidan de forma centralizada:

- `/dashboard/profesor`
- `/dashboard/admin/auditoria`
- `/dashboard/alumno/materias`

Una validación fallida, un conflicto o una operación rechazada no revalida y no devuelve resultados parciales.

## Rollback

Mantener `ACADEMIC_GRADING_V2_ENABLED` apagado deja inaccesibles todos los casos de uso nuevos sin modificar datos ni desmontar las RPC. Eliminar posteriormente las Server Actions y el módulo es un rollback de código; no requiere rollback de base de datos.
