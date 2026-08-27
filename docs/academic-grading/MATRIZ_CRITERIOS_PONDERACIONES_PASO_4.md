# Matriz de criterios y ponderaciones — Paso 4

## Contrato numérico

- Las calificaciones continúan exclusivamente en escala `0–10`.
- `peso` y `peso_interno` son porcentajes `0.0000–100.0000`; nunca son notas.
- Un esquema sólo se activa si sus criterios activos suman exactamente `100.0000`.
- Si un criterio tiene subcriterios activos, éstos también suman exactamente `100.0000`.
- El impacto efectivo es `peso_criterio × peso_interno / 100`, redondeado a cuatro decimales.
- Un criterio híbrido requiere al menos dos subcriterios activos. No existe anidación híbrida.

| Tipo superior | Subcriterios permitidos | Configuración JSON cerrada |
|---|---|---|
| `directo` | Ninguno o `directo` | `{}` |
| `actividades` | Ninguno o `actividades` | `{"agregacion":"promedio"}` |
| `participacion` | Ninguno o `participacion` | `{"modo":"maximo_grupo"}` o `{"modo":"meta_fija","meta":n>0}` |
| `hibrido` | Dos o más de los tres tipos anteriores | La correspondiente a cada tipo hijo |

## Vectores canónicos

| Entrada | Resultado |
|---|---|
| Suma `[60, 40]` | `100.0000` |
| Suma `[33.3333, 33.3333, 33.3334]` | `100.0000` |
| Redistribución `[1, 1, 1]` | `[33.3334, 33.3333, 33.3333]` |
| Redistribución `[20, 30]` | `[40.0000, 60.0000]` |
| Redistribución `[0, 0, 0]` | `[33.3334, 33.3333, 33.3333]` |
| Impacto `40 × 25 / 100` | `10.0000` |
| Impacto `33.3333 × 33.3333 / 100` | `11.1111` |

La redistribución usa unidades enteras de `0.0001`, mayor residuo y desempate por posición original. Repetirla sobre un resultado normalizado devuelve exactamente el mismo vector.

## Autorización e aislamiento

| Actor | Lectura | Crear/editar borrador | Activar | Copiar/versionar | Borrar |
|---|---:|---:|---:|---:|---:|
| Superusuario/admin del tenant | Sí | Sí | Sí, mediante RPC | Sí, mediante RPC | No por Data API |
| Profesor de la asignación | Sí | No | No | No | No |
| Alumno | No | No | No | No | No |
| Usuario de otro tenant/anon | No | No | No | No | No |

El navegador no envía `tenant_id`, actor ni totales confiables a las RPC. Éstas derivan el actor con `auth.uid()`, obtienen el tenant del esquema visible por RLS, bloquean la fila del esquema y recalculan los totales dentro de la misma transacción.

## Versionado e historial

- Un esquema activo no se modifica: se archiva y se copia a un borrador nuevo.
- `copiado_desde_id` conserva la procedencia mediante FK compuesta por origen, tenant y ciclo.
- Una fuente produce como máximo una copia. El reintento con el mismo nombre devuelve la copia; una carga diferente se rechaza.
- La edición de criterios y la activación comparten `FOR UPDATE` sobre el esquema. Esto evita activar una suma validada antes de una edición concurrente.

## Interfaz marca blanca

`WeightDistributionPreview` usa tokens semánticos (`primary`, `success`, `warning`, `destructive`, `muted`) y no nombres, logos ni colores institucionales codificados. El estado se comunica con texto, icono y `aria-live`, por lo que el color no es la única señal.

## Referencias Supabase verificadas

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Pruebas de base de datos con pgTAP](https://supabase.com/docs/guides/database/testing)
- [Cambio de exposición automática y necesidad de grants explícitos](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

