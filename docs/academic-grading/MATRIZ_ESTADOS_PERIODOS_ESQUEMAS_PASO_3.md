# Matriz de estados — periodos y esquemas del Paso 3

## Alcance

Esta matriz congela únicamente los estados introducidos en el Paso 3. No crea
la interfaz de administración, criterios, resultados, cierre auditado ni
reapertura. Esas capacidades pertenecen a pasos posteriores del plan canónico.

## Periodos de evaluación

| Estado actual | Lectura | Cambios ordinarios | Transición permitida en Paso 3 | Garantía de base de datos |
|---|---|---|---|---|
| `borrador` | Admin/super del tenant; profesor y alumno sólo si están relacionados con el ciclo | Admin/super | `activo` | Fechas dentro del ciclo, sin solapamiento y un solo periodo activo por ciclo |
| `activo` | Igual que borrador | Admin/super mientras no cierre | `borrador` dentro de esta fase preparatoria | La combinación tenant/ciclo sigue siendo inmutable |
| `cerrado` | Igual que los demás estados | Ninguno | Ninguna mediante acceso autenticado directo | Fila inmutable; exige `locked_at` y `locked_by` del mismo tenant |

El cambio directo a `cerrado` está deliberadamente bloqueado incluso para
administradores y superusuarios. El Paso 8 incorporará el procedimiento
auditado, motivo obligatorio y capacidad explícita de reapertura. Hasta
entonces, no existe un atajo que pueda cerrar sin auditoría.

## Esquemas de evaluación

| Estado actual | Lectura | Cambios ordinarios | Transición permitida | Preservación histórica |
|---|---|---|---|---|
| `borrador` | Admin/super; profesor sólo para su asignación | Admin/super | `activo` o `archivado` | La versión, tenant, ciclo, asignación, periodo y creador son inmutables |
| `activo` | Igual que borrador | Ninguno sobre sus reglas | Sólo `archivado`, sin alterar reglas | La configuración publicada no se reescribe |
| `archivado` | Igual que borrador | Ninguno | Ninguna | La fila completa es histórica e inmutable |

Para modificar un esquema activo se archiva la versión vigente y se crea una
nueva versión. El índice parcial garantiza una sola versión `borrador|activo`
por combinación `tenant + asignación + periodo`; la restricción única preserva
la secuencia de versiones.

## Autorización efectiva

| Actor | Periodos relacionados | Esquemas relacionados | Crear/editar periodos | Crear/editar esquemas | Borrar | Cerrar/reabrir |
|---|---:|---:|---:|---:|---:|---:|
| Superusuario del tenant activo | Sí | Sí | Sí, salvo cerrado | Sí, sólo borrador | No | No en Paso 3 |
| Administrador del tenant activo | Sí | Sí | Sí, salvo cerrado | Sí, sólo borrador | No | No en Paso 3 |
| Profesor activo con asignación | Sí | Sí, sólo propia | No | No | No | No |
| Alumno activo con matrícula | Sí | No | No | No | No | No |
| Usuario/tenant suspendido | No | No | No | No | No | No |
| `anon` | No | No | No | No | No | No |

La aparente ambigüedad del texto resumido del Paso 3 se resuelve mediante la
matriz de autorización aprobada en el Paso 1: el profesor no configura esquemas
ni criterios en V2. Las políticas RLS implementan esa decisión.

## Contrato 0–10

- `escala` es una columna generada con valor único `0-10`; no es configurable.
- `calificacion_aprobatoria` y `valor_no_entrego` usan `numeric(6,4)`.
- Toda aprobatoria válida está entre `0.0000` y `10.0000`.
- `valor_no_entrego` es exactamente `0.0000` y sólo se aplicará al cierre.
- Los decimales de presentación admitidos son `0`, `1` o `2`; la decisión inicial es `1`.
- El modo institucional es `half_up` y la justificación es `exclude`.
- No existen columnas configurables `score_min`, `score_max` ni selector de escala.

## Marca blanca

`color_semantico` sólo admite tokens (`primary`, `secondary`, `accent`,
`muted`). No se almacenan códigos hexadecimales ni colores de una institución.
