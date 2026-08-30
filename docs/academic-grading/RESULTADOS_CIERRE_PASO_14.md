# Resultados de cierre — Paso 14

Fecha: 2026-08-29 (America/Mexico_City)

## Resultado

El tenant existente quedó preparado en modo de observación `dual`, con escala canónica 0–10, 7/7 ejercicios enlazados, cero resultados que transformar y cero discrepancias. El control dejó de depender exclusivamente de variables de despliegue: ahora existe un estado persistente por tenant, con apagado de emergencia global y aprovisionamiento vacío para escuelas futuras.

## Subetapas completadas

1. Respaldo lógico de producción creado, hasheado y restaurado en clon desechable antes de tocar remoto.
2. Preflight remoto de conteos, escala, duplicados, huérfanos y ambigüedad: seis categorías en cero.
3. Contexto inicial creado sólo con las decisiones D-01…D-09 ya aprobadas; el ciclo y los tres periodos preexistentes se preservaron.
4. Backfill idempotente: 3 esquemas, 3 criterios y 7 vínculos con marca de migración; 0 resultados requirieron update.
5. Segundo tenant totalmente sintético validado con IDs/FKs independientes y sin enumeración cruzada.
6. Dual-read sobre canon `calificacion` y sombra `calificacion_manual`: diferencias cero.
7. Feature persistente del tenant activado en `dual`; rollback `legacy` y apagado global conservados durante siete días.
8. Tenant nuevo probado vacío: 0 ciclos, 0 periodos, 0 esquemas y 0 ejercicios copiados.

## Conteos antes/después en producción

| Entidad | Antes | Después | Explicación |
|---|---:|---:|---|
| ciclo / periodos | 1 / 3 | 1 / 3 | preservados |
| inscripción / asignación | 1 / 1 | 1 / 1 | preservadas |
| esquemas / criterios | 0 / 0 | 3 / 3 | uno por periodo, Actividades 100 % |
| ejercicios | 7 | 7 | cero pérdida |
| vínculos activos | 0 | 7 | un vínculo por ejercicio |
| resultados | 0 | 0 | no se inventaron notas |
| notas fuera de 0–10 | 0 | 0 | conforme |
| diferencias canon/sombra | 0 | 0 | conforme |
| huérfanos | 0 | 0 | conforme |

## Seguridad

- `tenant_academic_rollout` tiene RLS habilitada y forzada.
- Autenticados sólo poseen `SELECT`; no pueden alterar su modo.
- La política exige membresía activa del mismo tenant.
- La vista comparativa es `security_invoker` y añade una frontera explícita de membresía.
- El segundo tenant no pudo enumerar flag ni métricas del primero.
- Las métricas y auditoría no incluyen nombres, correos, respuestas, rutas de archivos ni otra PII.
- Ningún secreto quedó en repositorio, scripts, documentación o salida persistida.

## Verificación

- DB Paso 14: 6/6 escenarios.
- pgTAP: 14/14 estructurales y 24/24 de comportamiento.
- Base limpia: aprobada.
- Clon con histórico 75/100, 5/100 y descriptiva 8/10: 7.5, 0.5 y 8 preservados.
- Segunda ejecución: checksum lógico idéntico; auditoría sin duplicar.
- Preflight ambiguo: falla cerrado.
- Rollback SQL transaccional: aprobado.
- `supabase db lint`: sin hallazgos.
- Índice de rollout: usado por el planificador.
- Regresión RLS/REST/JWT: 43/43 estructurales y 31/31 de matriz multitenant, con IDOR/BOLA, roles, tenant suspendido, usuario suspendido, índices y rollback aprobados.
- TypeScript: cero errores después de regenerar tipos y ajustar argumentos RPC opcionales.
- Suite unitaria: 149/149 en 20 archivos.
- Suite de componentes: 26/26 en 8 archivos.
- Inventario E2E: 8 pruebas en 4 archivos, escritorio y móvil.
- Build Next.js 15.5.9: 58/58 páginas.

## Producción

- Migración remota: `20260830050405`.
- Nombre: `academic_cutover_existing_tenant_step14`.
- Aplicación: una sola transacción con `ON_ERROR_STOP`.
- Postflight: `dual`, `step14-cutover-v1`, 7/7, todas las métricas de error en cero.
- Ventana dual: `2026-08-30 05:29:25.943385+00` → `2026-09-06 05:29:25.943385+00`.
- GitHub/Vercel: sin push ni despliegue, conforme al límite del paso.

## Respaldo y reversión

El respaldo verificado está fuera del repositorio, con permisos `0600`, y su SHA-256 es `248d02d592d763763463e9fabee4ece0bdc61b1cb51953f81ffee597f512b85a`. El procedimiento operativo completo está en `RUNBOOK_CORTE_PASO_14.md`. La reversión normal apaga el feature por tenant y conserva todas las filas; no borra historia ni reinstala fórmulas 0–100.

## Riesgos residuales

- La promoción `dual` → `canonical` debe esperar la ventana de siete días y pertenece a la certificación/despliegue posterior.
- La enumeración de backups gestionados del proveedor no estuvo disponible para la cuenta CLI (`403`); el dump lógico restaurado cubre el requisito de respaldo de base. Storage no se modificó.
- El plan sellado decía seis ejercicios, pero el inventario real al corte era siete. Los siete quedaron preservados y cubiertos por pruebas.

## Condición de parada

Paso 14 completado. No se inició el Paso 15 y no se hará push ni despliegue sin autorización nueva y expresa.
