# Resultados de cierre — Paso 3

## Alcance terminado

- `periodos_evaluacion` ligados inequívocamente a tenant y ciclo.
- Tres periodos institucionales iniciales, continuos y no solapables para el ciclo 2026–2027.
- `esquemas_evaluacion` ligados a tenant, ciclo, asignación y periodo mediante FKs compuestas.
- Versionado con una sola versión vigente y preservación inmutable de activas/archivadas.
- Escala generada y no configurable `0-10`, aprobatoria `6.0000`, precisión de cuatro decimales y presentación inicial de uno.
- Reglas fijas `half_up`, `zero_on_close` con valor cero y `exclude` para justificación.
- RLS forzada, frontera de tenant activo, permisos separados por operación y grants mínimos.
- Validadores Zod equivalentes para experiencia de usuario; PostgreSQL permanece como autoridad.
- Tipos Supabase regenerados desde un clon schema-only con Pasos 2 y 3 aplicados.

No se creó editor visual, API pública, criterios, captura de resultados, cron,
cola, Edge Function ni flujo de cierre/reapertura. Tampoco se modificó Supabase
remoto, Vercel o GitHub.

## Periodos iniciales

| Orden | Nombre | Inicio | Fin | Estado inicial | Token semántico |
|---:|---|---|---|---|---|
| 1 | Periodo 1 | 2026-08-31 | 2026-11-27 | `borrador` | `primary` |
| 2 | Periodo 2 | 2026-11-28 | 2027-03-12 | `borrador` | `secondary` |
| 3 | Periodo 3 | 2027-03-13 | 2027-07-16 | `borrador` | `accent` |

La exclusión GiST usa rangos inclusivos. El día siguiente al cierre anterior es
válido; compartir cualquier día entre dos periodos es rechazado.

## Verificación ejecutada

| Comando | Resultado |
|---|---|
| `npm run test:paso3:db` | Base limpia 66/66; base existente 66/66; integridad/RLS 32/32; `EXPLAIN` usa índice; rollback aprobado |
| `npm run test:unit` | 6 archivos, 30/30 pruebas |
| `npm run test:components` | 2 archivos, 3/3 pruebas |
| `npm run typecheck` | 0 errores |
| `npm run test:e2e:list` | 2 escenarios localizados |
| `npm run test:paso3` | Aprobado integralmente |
| `npm run build` | Aprobado; 53 páginas generadas |
| `supabase db lint ... --fail-on warning` | Cero errores y cero advertencias en `public,private` del clon local |
| `git diff --check` | Aprobado |

La primera invocación de `db lint` no alcanzó el análisis porque el CLI intentó
TLS contra el contenedor sin SSL. Se repitió con `sslmode=disable` y terminó con
`No schema errors found`; no se ocultó ni se confundió el fallo de conexión con
un resultado de esquema.

## Integridad y seguridad verificadas

- Periodo fuera del ciclo, fechas invertidas y solapamiento: rechazados.
- Estrechar el ciclo dejando periodos fuera: rechazado.
- Aprobatoria mayor que 10, no entrega distinta de cero y escala `0-100`: rechazados.
- Periodo o contexto de otro tenant: rechazado.
- Segundo esquema vigente para asignación/periodo: rechazado.
- Versión activa o archivada reescrita: rechazada.
- Periodo cerrado editado y esquema cerrado borrado: rechazados.
- Cierre directo sin flujo auditado: rechazado hasta el Paso 8.
- Profesor: lectura de sus relaciones, cero creación/edición.
- Alumno: lectura de sus periodos, cero acceso a configuración de esquemas.
- Tenant B: cero filas de Tenant A.
- `anon`: cero grants; `authenticated`: sin `DELETE`.
- Índices de las claves foráneas y del patrón tenant/ciclo/estado presentes.

## Reconciliación remota y tipos

La auditoría remota previa fue sólo lectura. OpenAPI respondió correctamente,
pero `ciclos_escolares`, `periodos_evaluacion` y `esquemas_evaluacion` no existen
todavía en producción; las consultas a las tablas futuras devuelven `PGRST205`.
Esto es coherente con el corte diferido del Paso 14.

El archivo `src/lib/database.types.ts` se regeneró en PostgreSQL Supabase 17.6
desechable desde el `pg_dump --schema-only` temporal usado en el Paso 2, seguido
por las migraciones locales de Pasos 2 y 3. No se copiaron filas productivas.

## Artefactos y hashes

- Migración: `6dda9aae53d23c8eeb300d14cf5375aef8a15f722112ad7926721cad1ae91fcd`.
- Arnés DB: `df32c39c5850c44a1063fe89262b7cf9e4bc0d6690d10bafc6d5c476f35aacd7`.
- Tipos Supabase: `44d33ac61b6408764cc39f87cfe15cde8cc8ef7a173c36377705baf4c14bbe13`.
- pgTAP estructura: `d2ae19278c4a6c828786e0151032ada7538d105465e1191ce4a0773e7db56046`.
- pgTAP integridad/RLS: `c0ca8d53788fc2b0ff75f9365d987646e8f5bf34d05e3f0f77c1fb83c2427a30`.
- Matriz de estados: `d5237c85cb794f60af17ede118b8759dd1c6211126c241158e85fd95ceffd6f1`.

## Diseño y compatibilidad con Supabase

Se verificaron las guías oficiales vigentes de Supabase sobre:

- RLS y uso de `(select auth.uid())`/funciones auxiliares;
- grants explícitos para tablas nuevas del esquema `public`;
- pruebas de base de datos con pgTAP;
- políticas separadas por operación y combinación con una frontera restrictiva.

Referencias:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/testing

## Rollback

Antes de aplicación remota, revertir el commit local elimina todos los artefactos
del Paso 3. El arnés también prueba una aplicación transaccional completa y
confirma después de `ROLLBACK` que ambas tablas y el índice compuesto añadido a
asignaciones desaparecen, mientras el estado posterior al Paso 2 queda intacto.

Después de una aplicación futura se debe revocar primero la lectura nueva y
usar una migración compensatoria. Los periodos y esquemas ya referenciados se
preservarán como historia; no se borrarán filas para retroceder.

## Riesgos no bloqueantes y parada

- La migración productiva permanece deliberadamente pendiente para el corte controlado del Paso 14.
- El cierre/reapertura auditado se implementará en el Paso 8; hasta entonces está denegado.
- La creación de criterios y activación completa del esquema corresponde al Paso 4.
- La interfaz administrativa corresponde al Paso 10.

No existen riesgos bloqueantes para cerrar el Paso 3. La ejecución se detiene
antes del Paso 4.
