# Runbook de corte y reversión — Paso 14

Fecha: 2026-08-29 (America/Mexico_City)

## Propósito

Este runbook controla la migración del tenant existente al modelo académico canónico 0–10 sin borrar historia, y deja a cada tenant futuro apagado y vacío hasta que se aprovisione expresamente.

## Respaldo previo obligatorio

- Artefacto: `/home/seraphael/Escritorio/RESPALDOS_PLATAFORMA_ESTUDIANTIL/PASO_14_20260829/produccion_pre_paso14.dump`.
- Formato: dump lógico PostgreSQL custom, restaurable con `pg_restore`.
- Tamaño: 1,023,390 bytes.
- Permisos locales: `0600`.
- SHA-256: `248d02d592d763763463e9fabee4ece0bdc61b1cb51953f81ffee597f512b85a`.
- Verificaciones: `sha256sum -c` correcto; catálogo de restauración legible; 156 entradas de datos; restauración comprobada en PostgreSQL Supabase 17.6 con 65 tablas públicas y 4 usuarios de Auth.

La cuenta usada por Supabase CLI respondió `403 insufficient privileges` al intentar enumerar backups gestionados. Eso no dejó el corte sin respaldo: antes de cualquier DDL/DML remoto se creó y restauró el dump lógico verificado. Los cuerpos de objetos de Storage no forman parte de un dump PostgreSQL; Paso 14 no muta buckets ni objetos.

## Preflight de producción

Ejecutar sólo lectura:

```bash
psql "$DIRECT_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/academic-grading/step14-production-preflight.sql
```

El corte se bloquea si aparece una nota fuera de 0–10, diferencia entre canon y sombra, resultado sin contexto, ejercicio ambiguo, inscripción activa duplicada o vínculo activo duplicado.

Baseline observado antes del corte:

| Entidad | Filas |
|---|---:|
| tenants | 1 |
| profiles | 3 |
| cycles | 1 |
| periods | 3 |
| enrollments | 1 |
| assignments | 1 |
| schemes / criteria | 0 / 0 |
| exercises / active links | 7 / 0 |
| exercise results | 0 |

Las seis consultas de anomalías devolvieron cero.

## Aplicación atómica

Migración: `20260830050405_academic_cutover_existing_tenant_step14.sql`.

Debe aplicarse junto con el registro `20260830050405` en una sola transacción y con `ON_ERROR_STOP`. La migración:

1. crea `tenant_academic_rollout` con RLS forzada;
2. deja tenants nuevos en `legacy` mediante trigger;
3. añade marcadores de versión sin imponer `NOT NULL` a historia;
4. ejecuta preflight bloqueante;
5. crea esquemas sólo donde no existe configuración vigente;
6. crea un criterio `Actividades` al 100 % con D-04…D-07;
7. enlaza todos los ejercicios actuales con una única asignación candidata;
8. completa contexto de resultados legacy sin volver a dividir notas;
9. mueve a `dual` únicamente tenants con discrepancias cero;
10. registra métricas agregadas sin PII y auditoría idempotente.

El plan sellado inventariaba seis ejercicios; producción contenía siete al ejecutar el corte. La política aprobada fue conservar y enlazar los siete. Omitir el séptimo habría violado el criterio de cero pérdida.

## Verificación posterior

```bash
psql "$DIRECT_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/academic-grading/step14-production-postflight.sql
```

Resultado remoto:

- rollout: `dual`, `step14-cutover-v1`;
- esquemas iniciales: 3;
- criterios iniciales: 3, cada uno al 100 %;
- ejercicios/vínculos activos: 7/7;
- resultados: 0;
- legacy, fuera de rango, diferencia de sombra y contexto huérfano: 0;
- auditoría `academic.cutover.dual_started`: una fila;
- migración registrada: `20260830050405`.

## Ventana dual y promoción

`dual` habilita la interfaz canónica por tenant y conserva `calificacion_manual` como sombra. La ventana remota quedó registrada desde `2026-08-30 05:29:25.943385+00` hasta `2026-09-06 05:29:25.943385+00` (siete días). Durante ella deben permanecer en cero:

- `legacy_result_count`;
- `out_of_range_count`;
- `shadow_difference_count`;
- `orphan_context_count`;
- `exercise_count - linked_exercise_count`.

Promover a `canonical` no forma parte de este corte automático: requiere que termine la ventana, verificación nuevamente en cero y autorización de certificación/despliegue del Paso 15. No se elimina la sombra mediante este paso.

## Reversión segura

Ante una discrepancia:

1. fijar `ACADEMIC_GRADING_V2_ENABLED=false` como apagado global de emergencia, o cambiar únicamente el tenant afectado a `mode='legacy'` con acceso de servicio auditado;
2. no borrar esquemas, criterios, vínculos ni resultados nuevos;
3. conservar `calificacion_manual`, IDs, intentos, snapshots y auditoría;
4. validar que las interfaces heredadas de ejercicios siguen leyendo sus filas existentes;
5. restaurar el dump sólo ante una recuperación de desastre aprobada, nunca como corrección ordinaria;
6. cualquier migración compensatoria exige diagnóstico, backup nuevo y autorización expresa.

El flag `legacy` deshabilita las rutas académicas V2; no reactiva fórmulas 0–100 retiradas porque volver a una fórmula conocida como incorrecta no es un rollback seguro.

## Aprovisionamiento de una escuela nueva

El trigger crea exclusivamente una fila `tenant_academic_rollout(mode='legacy')`. No copia ciclo, periodo, esquema, criterio, profesor, alumno, materia, ejercicio, resultado ni configuración de la escuela muestra. La prueba sintética demostró además que RLS y la vista `security_invoker` no enumeran métricas de otro tenant.

## Límites

- Sin push ni despliegue en Paso 14.
- Sin cambios en Storage, cron, correo, Auth, dominios o proveedores.
- No iniciar Paso 15 sin autorización nueva y expresa.
