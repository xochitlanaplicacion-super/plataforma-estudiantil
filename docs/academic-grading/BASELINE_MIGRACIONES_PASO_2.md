# Línea base reproducible de migraciones — Paso 2

## Decisión

El repositorio conserva un flujo de migraciones imperativas de Supabase. No se
introduce un segundo sistema declarativo porque `supabase/config.toml` mantiene
`schema_paths = []` y el historial remoto ya está administrado por migraciones.

La historia local anterior al 18 de julio de 2026 empieza después de la creación
de tablas como `profiles`, `inscripciones_alumno` y `asignaciones_profesor`. Por
ello, un `db reset` vacío no representa la base histórica real. El Paso 2 cierra
esa precondición de forma verificable con dos capas:

1. `step2_pre_migration_schema.sql` reconstruye únicamente el contrato académico
   anterior al paso, con roles y tablas mínimas y sin datos de clientes.
2. `step2_existing_data.sql` agrega dos tenants y usuarios totalmente sintéticos
   para ejercitar el backfill, RLS y referencias cruzadas.

El arnés `scripts/academic-grading/test-step2-database.sh` levanta PostgreSQL
Supabase 17.6 en un contenedor desechable, espera su estado `healthy` y valida:

- base limpia;
- base con datos históricos;
- integridad, RLS y proyección compatible;
- rollback transaccional local.

## Reconciliación con el esquema real

Antes de crear la migración se obtuvo un `pg_dump --schema-only` temporal y de
sólo lectura de `public` y `private`. El archivo no se incorporó al repositorio:
contenía configuración histórica ajena al alcance y no era necesario para las
pruebas reproducibles. Se cargó en PostgreSQL desechable y la migración se aplicó
sobre ese clon. Los tipos TypeScript se regeneraron desde el clon migrado.

La importación terminó los objetos del esquema antes de encontrar una sentencia
final de privilegios predeterminados que el usuario desechable no podía cambiar.
Ese aviso no pertenece al DDL del Paso 2. La migración posterior se ejecutó sin
errores y el contenedor fue eliminado.

## Límites de seguridad

- No se copiaron filas productivas, correos reales, dominios, IDs de proyecto ni secretos.
- El único URL de base versionado pertenece al contenedor local y usa la contraseña fija no secreta `postgres`.
- No se ejecutó `db push`, `migration up --linked`, DDL ni DML remoto.
- El backfill real queda reservado al corte controlado del Paso 14; esta unidad
  entrega y prueba la migración, pero no altera el tenant productivo.

## Rollback

Antes de aplicación remota, el rollback es revertir el commit local. La prueba
automatizada aplica todo el DDL dentro de una transacción y comprueba después de
`ROLLBACK` que la tabla y columnas nuevas no existen.

Después de una aplicación futura, se debe desactivar primero la lectura nueva.
Una migración compensatoria sólo podrá retirar triggers, constraints y columnas
si no existen consumidores; `ciclos_escolares` y las filas de matrícula/asignación
se preservarán para revisión histórica, conforme al plan canónico.
