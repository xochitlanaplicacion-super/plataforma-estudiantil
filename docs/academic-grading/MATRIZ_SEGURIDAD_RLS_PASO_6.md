# Matriz de seguridad académica — Paso 6

## Frontera común

Las once tablas académicas usan RLS forzada y una política restrictiva común. La fila sólo participa en otra política si:

1. `auth.uid()` identifica un perfil del mismo `tenant_id`.
2. El perfil está `activo`.
3. El tenant está `activo`.
4. La operación tiene además una política permisiva específica (`SELECT`, `INSERT` o `UPDATE`).
5. El rol SQL posee el grant mínimo correspondiente.

`anon` no tiene grants sobre tablas ni vistas académicas. `authenticated` no tiene `DELETE` y tampoco puede escribir directamente `resultados_ejercicios`; esa edición quedará encapsulada en la RPC atómica del Paso 8.

## Helpers privados

| Helper | Autoriza | Rechaza explícitamente |
|---|---|---|
| `private.can_manage_teaching_assignment(tenant, assignment)` | Admin/superuser activo del tenant o profesor activo de esa asignación exacta | `auth.uid()` nulo, tenant/perfil suspendido, profesor de otra materia, otro tenant |
| `private.can_view_enrollment(tenant, enrollment, assignment)` | Admin/superuser, alumno dueño o profesor de la asignación exacta cuyo ciclo/grupo coincide con la matrícula | Asignación manipulada, alumno/grupo/ciclo distinto, profesor paralelo del mismo grupo |
| `private.can_view_enrollment(tenant, enrollment)` | Lo anterior para listados de matrícula; profesor con alguna asignación activa del grupo/ciclo | Otro grupo, ciclo, tenant, perfil o tenant suspendido |

Los tres son `STABLE SECURITY DEFINER`, fijan `search_path=''`, cualifican schemas, usan `(select auth.uid())`, revocan `EXECUTE` a `PUBLIC/anon` y sólo lo conceden a `authenticated/service_role`.

## Matriz por recurso

| Recurso | Admin/superuser | Profesor | Alumno | Anon |
|---|---|---|---|---|
| Ciclos | Lee/crea/actualiza su tenant | Lee su tenant | Lee su tenant | Sin acceso |
| Matrículas | Lee/crea/actualiza su tenant | Lee sólo grupos/ciclos asignados | Lee la propia | Sin acceso |
| Asignaciones | Lee/crea/actualiza su tenant | Lee sólo las propias activas | Lee las relacionadas con su matrícula | Sin acceso |
| Periodos | Lee/crea/actualiza su tenant | Lee ciclos asignados | Lee su ciclo | Sin acceso |
| Esquemas/criterios | Configura borradores del tenant | Lee sólo su asignación | Lee sólo esquemas de sus asignaciones matriculadas | Sin acceso |
| Vínculos de ejercicios | Lee/crea/actualiza asignaciones autorizadas | Lee/crea/actualiza sólo asignación propia | Lee vínculos de sus asignaciones | Sin acceso |
| Resultados de ejercicios | Lee su tenant | Sólo lectura de asignación exacta | Sólo lectura propia | Sin acceso |
| Calificaciones directas | Lee/crea/actualiza su tenant | Lee/crea/actualiza sólo asignación y matrícula exactas | Sólo lectura propia | Sin acceso |
| Participación | Lee/crea eventos | Lee/crea eventos de asignación exacta, con `actor_id=auth.uid()` | Sólo lectura propia | Sin acceso |

## Read models

| Vista | Consumidor | Protección | Escala |
|---|---|---|---|
| `vista_libreta_profesor` | Profesor y administración | `security_invoker` + asignación exacta | Conserva `0-10` o `0-1` en `escala_fuente` |
| `vista_desglose_calificacion` | Profesor y administración | Libreta autorizada + matrícula exacta | Añade pesos, no calcula nota final |
| `vista_calificaciones_alumno` | Alumno autenticado | `alumno_id=auth.uid()` + matrícula/asignación exactas | Conserva escala fuente y no expone otros alumnos |

No se unen perfiles ni correos en estas vistas. Los IDs prohibidos producen cero filas; la capa de aplicación usa un 404 neutral cuando se solicita una fuente única inexistente o invisible.

## Casos ejecutados

| Actor/caso | Resultado esperado y observado |
|---|---|
| Profesor A, Materia A | Una fila; puede actualizar su nota directa |
| Profesor A2, mismo tenant/grupo, Materia A2 | Una fila propia; cero filas de Materia A |
| Profesor A con ID de asignación A2 | Helper falso; cero filas/actualizaciones |
| Alumno A | Dos materias propias; cero de Alumno B; libreta profesor vacía |
| Admin A | Dos asignaciones A; cero filas B; no suplanta vista alumno |
| Admin B | Una asignación B; cero filas A |
| Perfil suspendido | Cero filas |
| Tenant suspendido | Cero filas |
| `auth.uid()` nulo | Helpers falsos |
| Anon | `permission denied` / HTTP 401–403 |
| Escrituras alumno | Rechazadas por RLS |
| `DELETE` o edición directa de resultados | Rechazados por grant |

La misma matriz se ejecutó por SQL/pgTAP y por PostgREST real con JWT HS256 sintéticos de diez minutos. Los tokens y la clave de firma son efímeros/deterministas del contenedor local; no corresponden a ningún proyecto Supabase.

## Índices y rendimiento

Se añadieron índices con `tenant_id` como primera columna para membresía, asignación, matrícula, resultados, directas y participación. Con `enable_seqscan=off`, el plan de consulta profesor/asignación usó `academic_direct_grades_rls_idx`; los helpers aparecen como `InitPlan/SubPlan`, evitando reevaluar `auth.uid()` por fila.

## Referencias aplicadas

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database tables and privileges](https://supabase.com/docs/guides/database/tables)
