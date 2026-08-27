# Resultados de cierre — Paso 2

## Alcance terminado

- `ciclos_escolares` con ciclo único activo por tenant, fechas, estado, zona horaria y claves compuestas.
- Matrículas versionadas por ciclo, backfill desde `profiles.grupo_id` y una sola activa por alumno/ciclo.
- Asignaciones docentes con ciclo, vigencia y participación `titular|suplente|apoyo`.
- FKs compuestas, validación de rol/jerarquía, índices de clase y RLS para tenant/rol/estado.
- Proyección temporal unidireccional de matrícula activa hacia `profiles.grupo_id`.
- Acciones existentes adaptadas sin endpoint público, cron, cola ni proveedor nuevo.
- Indicador administrativo read-only con tokens semánticos de marca blanca.
- Tipos Supabase regenerados y pruebas locales reproducibles.

## Conteos y preservación

Auditoría productiva previa de sólo lectura; la migración no fue aplicada allí:

| Ámbito | Alumnos activos | Matrículas | Asignaciones | Asignaciones sin ciclo |
|---|---:|---:|---:|---:|
| Tenant existente, antes | 1 | 0 | 1 | 1 (la columna aún no existe) |

Backfill local con fixtures sintéticos:

| Tenant sintético | Alumnos activos | Matrículas antes | Matrículas después | Asignaciones | Sin ciclo después |
|---|---:|---:|---:|---:|---:|
| A | 1 | 0 | 1 | 1 | 0 |
| B | 1 | 0 | 1 | 0 | 0 |

El ID sintético de la asignación previa y su `grado_id` sobrevivieron intactos.
Las consultas anti-huérfanos devolvieron cero y cada alumno activo quedó con
exactamente una matrícula activa coherente.

## Verificación ejecutada

| Comando | Resultado |
|---|---|
| `npm run test:paso2:db` | Base limpia 36/36; base existente 36/36; integridad/RLS 12/12; rollback aprobado |
| `npm run test:unit` | 5 archivos, 26/26 pruebas |
| `npm run test:components` | 2 archivos, 3/3 pruebas |
| `npm run typecheck` | 0 errores |
| `npm run test:e2e:list` | 2 escenarios localizados |
| `npm run build` | Aprobado; 53 páginas generadas |
| `git diff --check` | Aprobado tras normalizar el archivo generado |

## Integridad y seguridad verificadas

- Duplicado activo por alumno/ciclo: rechazado.
- Alumno o profesor de otro tenant: rechazado.
- Alumno: sólo su matrícula; profesor: sólo sus asignaciones; admin/superuser: gestión del tenant.
- Usuario suspendido y tenant suspendido: cero contexto académico visible.
- `authenticated` no tiene `DELETE` sobre ciclos, matrículas ni asignaciones.
- Bajas lógicas preservan historia y fechas válidas incluso antes de iniciar el ciclo.
- Escaneo de archivos del paso: sin llaves, tokens, contraseñas productivas, PII o colores de cliente.

## Artefactos y hashes

- Migración: `supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql`
  - SHA-256: `c4d7da05f0302ec0d5035aaa979cb1cb6dfd269388ccac61a8e393fc000cfb99`
- Tipos: `src/lib/database.types.ts`
  - SHA-256: `0bb52727755582b5c1e8c8e685f2ca114cf3b3e0bef2c03ae82404ee57d4fe5b`
- Arnés DB: `scripts/academic-grading/test-step2-database.sh`
  - SHA-256: `e20627f5bd8d656c464895b18f107aac6a9868b548a0b16a212eafa3de99b51c`

## Estado externo y parada

Supabase remoto, Vercel y GitHub no recibieron cambios. No hubo `push` ni
despliegue. El Paso 2 queda listo para cierre local y el Paso 3 no se inicia sin
una autorización nueva y expresa.
