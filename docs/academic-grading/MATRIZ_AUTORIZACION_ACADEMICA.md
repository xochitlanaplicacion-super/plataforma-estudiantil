# Matriz canónica de autorización académica

Esta matriz define intención normativa para los pasos posteriores. No reemplaza RLS ni validación en servidor. `service_role` es una credencial técnica, nunca un actor o permiso de negocio.

## Predicados acumulativos

Una operación se autoriza sólo si todos los predicados aplicables son verdaderos:

1. La sesión fue validada contra Auth; no se confía en `user_metadata`.
2. El perfil existe, pertenece al `tenant_id` de `app_metadata` y está `activo`.
3. El tenant está `activo` para operaciones académicas.
4. El rol posee la capacidad solicitada.
5. Los IDs recibidos pertenecen al mismo tenant; ninguna relación sensible se valida sólo por UUID simple.
6. Para profesor, existe una `asignaciones_profesor` propia, activa, vigente, del ciclo, grupo y materia exactos.
7. Para alumno, existe matrícula propia y vigente en el ciclo/grupo exactos.
8. El periodo permite la operación; cerrado implica sólo lectura de snapshot salvo reapertura autorizada.
9. La escritura incluye motivo cuando sea corrección/reapertura, `row_version` esperado e idempotency key.

## Capacidades por rol activo

| Operación | Superuser | Admin | Profesor | Alumno | Platform admin / superduperuser |
|---|---:|---:|---:|---:|---:|
| Listar ciclos/periodos del tenant | Permitir | Permitir | Sólo relacionados con sus asignaciones | Sólo relacionados con su matrícula | Denegar datos nominales |
| Crear/editar ciclo | Permitir | Permitir | Denegar | Denegar | Denegar |
| Crear/editar esquema y criterios | Permitir | Permitir | Denegar en V2 | Denegar | Denegar |
| Ver libreta completa del tenant | Permitir | Permitir | Denegar | Denegar | Denegar |
| Ver libreta de una asignación | Permitir | Permitir | Sólo propia/vigente | Denegar | Denegar |
| Ver resultado individual | Permitir | Permitir | Sólo alumno de su asignación | Sólo propio | Denegar |
| Capturar nota individual/masiva | Permitir con auditoría | Permitir con auditoría | Sólo propia/vigente y periodo editable | Denegar | Denegar |
| Modificar nota de otro profesor | Permitir sólo como corrección auditada | Permitir sólo como corrección auditada | Denegar | Denegar | Denegar |
| Cerrar periodo | Permitir con auditoría | Sólo con capacidad explícita y auditoría | Denegar | Denegar | Denegar |
| Reabrir periodo | Permitir con motivo y auditoría | Sólo con capacidad explícita, motivo y auditoría | Denegar | Denegar | Denegar |
| Leer snapshot histórico | Permitir | Permitir | Sólo asignación propia/histórica | Sólo propio | Denegar salvo soporte autorizado/auditado |
| Borrar físicamente calificación/auditoría | Denegar | Denegar | Denegar | Denegar | Denegar |

## Matriz negativa obligatoria

| Caso | Lectura | Escritura | Resultado requerido |
|---|---:|---:|---|
| `tenant_id` A intenta fila de B | Denegar | Denegar | 0 filas/403 sin revelar existencia |
| Profesor A intenta asignación de profesor B del mismo tenant | Denegar | Denegar | 0 filas/403 |
| Profesor de materia A intenta materia B del mismo grupo | Denegar | Denegar | 0 filas/403 |
| Profesor intenta alumno no matriculado en su grupo/ciclo | Denegar | Denegar | 0 filas/403 |
| Alumno intenta otro alumno | Denegar | Denegar | 0 filas/403 |
| Usuario `inactivo` o `suspendido` | Denegar | Denegar | sesión rechazada para módulo académico |
| Tenant `suspendido`, `cancelado` o `provisionando` | Denegar salvo vista administrativa de estado | Denegar | sin acceso académico |
| Periodo cerrado | Snapshot permitido según rol | Denegar | conflicto de dominio, sin mutación |
| `row_version` obsoleto | Permitida nueva lectura | Denegar escritura | conflicto 409 con datos actuales |
| Idempotency key repetida con mismo payload | N/A | No duplicar | devolver resultado original |
| Idempotency key repetida con payload distinto | N/A | Denegar | conflicto/auditoría |
| JWT sin `tenant_id` protegido | Denegar | Denegar | sesión inválida |
| Parámetro `tenant_id` manipulado en cliente | Denegar | Denegar | el servidor deriva tenant de sesión |
| Service role usada sin repetir autorización | N/A | Prohibido | fallo de prueba/revisión |
| Platform admin fuera de modo soporte | Sólo agregados globales | Denegar notas | sin PII ni calificaciones nominales |

## Defensa en profundidad que deberán demostrar las pruebas

- RLS restrictiva tenant-safe y políticas positivas por capacidad.
- Grants mínimos; `authenticated` por sí solo nunca autoriza filas.
- `UPDATE` con `USING` y `WITH CHECK`, además de política `SELECT` compatible.
- Funciones privilegiadas fuera de esquemas expuestos, `search_path=''`, identidad interna y `EXECUTE` revocado por defecto.
- Server Actions/RPC revalidan todos los predicados aunque utilicen cliente administrativo.
- FKs/uniques compuestos incluyen `tenant_id` en relaciones sensibles.
- Auditoría append-only con antes/después, actor, motivo, correlación y tenant.
