# Resultados de cierre — Paso 8

## Identificación

- Plan: `EDICION_CALIFICACIONES_MULTITENANT_V2`
- Paso: `Paso 8 — Crear RPC atómica de edición, auditoría y cierre`
- Ejecución: `e8-20260827-paso8-000000000001`
- Alcance aplicado: repositorio y PostgreSQL local desechable.
- Base productiva, Vercel y demás servicios remotos: **sin cambios**.
- Paso 9: **no iniciado**.

## Resultado

El Paso 8 queda implementado y verificable. Las calificaciones admiten edición individual o por lote en una transacción corta, con un máximo de 100 filas, clave de idempotencia, compare-and-swap por `row_version`, auditoría exacta y errores lógicos estables. El cierre materializa snapshots inmutables por matrícula; la reapertura conserva esos snapshots y crea una nueva versión histórica.

No existe `last-write-wins` silencioso. Una versión obsoleta produce `PT409`; un lote con una fila inválida revierte el lote completo. Un alcance cerrado queda protegido tanto en las RPC como en triggers defensivos sobre las tablas fuente.

## Artefactos implementados

### Base de datos

- Migración `supabase/migrations/20260828042542_academic_atomic_grade_mutations_closures.sql`.
- Ledger interno `solicitudes_mutacion_academica` para idempotencia por tenant, actor, operación y clave.
- Tabla `cierres_calificaciones` con snapshot exacto, resultado visual, desglose, versión, estado, actor, motivo, correlación y vínculo al snapshot anterior.
- RPC pública `editar_calificaciones_academicas(...)`.
- RPC pública `previsualizar_cierre_calificaciones(...)`.
- RPC pública `cerrar_calificaciones_academicas(...)`.
- RPC pública `reabrir_calificaciones_academicas(...)`.
- Funciones privadas para autorización, validación del motivo, construcción del dataset y detección de un alcance cerrado.
- Triggers inmutables para snapshots y auditoría académica.
- Triggers defensivos para impedir mutaciones directas de notas, resultados, participación y configuración cuando el alcance está cerrado.
- `EXECUTE` concedido sólo a `authenticated` y `service_role`; `anon` y `public` quedan revocados.
- RLS forzada en las tablas nuevas. El ledger no se expone a usuarios autenticados y los snapshots sólo se leen mediante el alcance tenant-safe ya aprobado en el Paso 6.

### Contratos y experiencia de usuario

- `src/lib/academic-grading/mutation-contracts.ts` tipa argumentos, resultados, estados `idle/saving/saved/conflict/error`, errores y política de reintentos.
- `src/lib/database.types.ts` contiene las cuatro firmas RPC del Paso 8.
- `src/components/academic/AcademicClosureDialog.tsx` presenta cierre/reapertura, resumen de matrículas pendientes, motivo obligatorio y estados de guardado/conflicto/error.
- El diálogo usa únicamente tokens semánticos del tema (`background`, `muted`, `primary`, `destructive`, etc.); no introduce colores, logos o valores institucionales hardcodeados.
- El componente es un contrato reutilizable. Su conexión con acciones del servidor y la libreta corresponde expresamente a los Pasos 9 y 11.

## Contrato transaccional

### Edición

1. Obtiene el actor exclusivamente de `auth.uid()` y resuelve el tenant desde la asignación; no acepta actor, tenant ni nota normalizada enviados por el cliente.
2. Rechaza platform admin, sesión inexistente, rol ajeno, tenant suspendido, asignación/periodo/inscripción/fuente incongruentes, estado inválido y nota fuera de 0–10.
3. Limita el lote a 100 filas y 256 KiB, valida todas las filas y bloquea objetivos en orden estable.
4. Reserva la clave idempotente y compara el digest del request. La misma clave y el mismo payload devuelve la respuesta previa; la reutilización con otro payload produce conflicto.
5. Actualiza mediante CAS con `expectedRowVersion`. Si alguna versión cambió, toda la transacción falla con `PT409`.
6. Inserta una entrada de auditoría por cada cambio efectivo, con `before`, `after`, motivo, actor, tenant y `correlation_id`.

### Cierre y reapertura

1. Sólo `admin` o `superuser` activos del tenant pueden previsualizar, cerrar o reabrir. Platform admin permanece de sólo lectura.
2. Cierre y reapertura adquieren `pg_advisory_xact_lock` determinista por asignación y periodo, además de bloquear el periodo dentro de una transacción corta.
3. El cierre exige que todas las matrículas activas tengan un resultado completo y materializa el resultado exacto, visual y desglose usados en ese instante.
4. Los snapshots no admiten `UPDATE` ni `DELETE`.
5. La reapertura exige motivo, no elimina el cierre anterior y crea una versión nueva enlazada mediante `snapshot_parent_id`.
6. Un segundo cierre sin reapertura produce conflicto; repetir el mismo request idempotente devuelve el resultado previo sin duplicar snapshots o auditoría.

## Errores y reintentos

| SQLSTATE | HTTP lógico | Significado |
|---|---:|---|
| `PT400` | 400 | Request, forma, límite o idempotencia inválidos |
| `PT401` | 401 | Sesión ausente |
| `PT403` | 403 | Actor o rol sin autorización |
| `PT404` | 404 | Alcance neutral no encontrado |
| `PT409` | 409 | Versión, cierre o clave idempotente en conflicto |
| `PT422` | 422 | Estado, rango o cierre incompleto |

La capa TypeScript sólo permite reintentos para `40001`, `40P01`, `55P03` y fallos HTTP transitorios, siempre que exista clave idempotente y no se exceda el máximo configurado. Los errores funcionales 400/401/403/404/409/422 nunca se reintentan automáticamente.

## Corrección de regresión del motor

Al ejecutar los casos dorados sobre la historia completa se descubrió una ambigüedad PL/pgSQL heredada del Paso 7: la asignación de `warnings` dentro de la función SQL podía resolver el identificador contra el campo de salida y producir completitud nula con datasets vivos. La migración del Paso 8 preserva la función original como implementación privada y publica un wrapper determinista que conserva el resultado numérico y reconstruye advertencias/completitud sin ambigüedad. No se reescribió una migración histórica.

Los 24 casos dorados SQL/TypeScript volvieron a ejecutarse y aprobaron con equivalencia decimal exacta.

## Evidencia anonimizada

Todos los IDs usados por el arnés son UUID sintéticos y las bases se destruyen al terminar.

| Escenario | Resultado observable |
|---|---|
| Repetición con la misma clave y payload | 1 solicitud, 1 cambio, 1 auditoría; la segunda respuesta lleva `replayed=true` |
| Lote con una fila inválida | 0 cambios parciales, 0 solicitud persistida y auditoría sin incremento |
| Dos escritores con la misma versión esperada | 1 guardado y 1 `ACADEMIC_VERSION_CONFLICT`; versión incrementada una vez y 1 auditoría |
| Actor de otro tenant/asignación | `PT403`/alcance neutral; 0 cambios |
| Alcance cerrado y llamada directa | `PT409`; fuentes y configuración permanecen intactas |
| Cierre válido | 1 snapshot por matrícula activa y 1 auditoría de cierre |
| Repetición del cierre | Respuesta idempotente sin snapshots ni auditoría duplicados |
| Reapertura válida | Nueva versión histórica; snapshot anterior intacto y enlazado |
| Reapertura sin motivo o rol | `PT400`/`PT403`; 0 cambios |

## Pruebas ejecutadas

- `npm run test:paso8:db`: aprobado.
  - Estructura: 43/43 aserciones pgTAP.
  - Regresión del motor: 24/24 casos pgTAP.
  - Comportamiento atómico, seguridad, idempotencia, cierre y reapertura: 54/54 aserciones pgTAP.
  - Total: 121 aserciones pgTAP.
  - Concurrencia real con dos sesiones `psql`: un único ganador y un conflicto 409.
  - `supabase db lint --schema public,private --fail-on error`: 0 errores.
  - `EXPLAIN`: uso de `cierres_scope_latest_idx` confirmado.
  - Rollback transaccional: tablas, RPC y ledger ausentes después de revertir.
- `npm run test:unit`: 99/99 pruebas aprobadas en 13 archivos.
- `npm run test:components`: 12/12 pruebas aprobadas en 5 archivos.
- `npm run typecheck`: 0 errores.
- `npm run test:e2e:list`: 2 escenarios localizados para escritorio y móvil.
- `npm run build`: compilación de producción aprobada y 53/53 páginas generadas; `.next/BUILD_ID` emitido.
- `git diff --check`: aprobado.

## Seguridad y aislamiento

- No se aceptan `tenant_id`, `actor_id` ni totales normalizados del cliente.
- La asignación exacta limita al profesor; compartir grupo, alumno o tenant con otro profesor no concede acceso a su materia.
- Admin/superuser pueden cerrar y reabrir sólo dentro de su tenant.
- Platform admin no recibe mutación académica implícita.
- `search_path=''` en funciones `SECURITY DEFINER`, nombres cualificados y grants mínimos.
- Ninguna llamada externa, correo, webhook, cron, cola o proveedor ocurre dentro de las transacciones.
- No se copiaron filas productivas, secretos, dominios ni PII al repositorio.

## Riesgos pendientes

- Bloqueantes para cerrar el Paso 8: ninguno.
- No bloqueantes: la migración todavía no está aplicada en producción; el componente todavía no está conectado a una ruta/acción de servidor, porque esa integración pertenece a los Pasos 9 y 11; la exportación externa de auditoría queda fuera de V2.

## Rollback

Antes de cualquier aplicación remota, revertir el commit local del Paso 8 restaura el código anterior. Después de una futura aplicación:

1. revocar `EXECUTE` de las RPC públicas o apagar la característica consumidora;
2. retirar consumidores mediante una migración compensatoria;
3. conservar siempre auditoría y snapshots;
4. reabrir únicamente mediante la operación autorizada y con motivo;
5. nunca borrar ni reescribir el historial de cierres.

El arnés comprobó además el rollback transaccional de la migración en PostgreSQL desechable.

## Condición de parada

Paso 8 cerrado localmente. El Paso 9 permanece `NO_INICIADO` y requiere autorización nueva y expresa.
