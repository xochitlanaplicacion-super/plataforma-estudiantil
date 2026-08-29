# Mapa de configuración administrativa — Paso 10

## Frontera de seguridad

El navegador sólo invoca Server Actions de `src/lib/actions/calificaciones.ts`. Cada petición vuelve a resolver `auth.getUser()`, perfil, tenant activo, rol y feature flag. Ninguna entrada acepta `tenant_id`, `actor_id`, escala o estado histórico. La capa de servicio permite exclusivamente `superuser` y `admin`; el layout de las rutas aplica la misma capacidad antes de renderizar.

```text
/dashboard/admin/evaluacion/**
  → Server Actions
    → AcademicConfigurationService (rol + flag + Zod)
      → SupabaseAcademicConfigurationRepository (tenant de sesión + RLS)
        → tablas tenant-safe / RPC versionadas existentes
```

## Rutas y casos de uso

| Ruta | Caso de uso | Acción | Persistencia |
|---|---|---|---|
| `/dashboard/admin/evaluacion/ciclos` | Cargar todo el contexto administrativo | `loadAcademicConfigurationAction` | lecturas RLS con `tenant_id` derivado |
| misma | Crear/editar ciclo | `saveAcademicCycleAction` | `ciclos_escolares`; compare-and-swap por `updated_at` al editar |
| misma | Crear/editar periodo | `saveAcademicPeriodAction` | `periodos_evaluacion`; tenant+ciclo+ID+`updated_at`; cerrado es sólo lectura |
| `/dashboard/admin/evaluacion/esquemas` | Crear/editar borrador | `saveAcademicSchemeAction` | `esquemas_evaluacion`; escala/reglas institucionales no son entrada |
| misma | Crear/editar criterio | `saveAcademicCriterionAction` | `criterios_evaluacion`; esquema+tenant+`updated_at` |
| misma | Crear/editar subcriterio | `saveAcademicSubcriterionAction` | `subcriterios_evaluacion`; criterio+tenant+`updated_at` |
| misma | Activar | `activateAcademicSchemeAction` | RPC `activar_esquema_evaluacion`; versión esperada y total exacto 100% |
| misma | Copiar/versionar | `copyAcademicSchemeAction` | RPC `copiar_esquema_evaluacion`; no reescribe historia |
| misma | Consultar auditoría | `listAcademicAuditAction` | sólo lectura de eventos `academic.%` del tenant |

## Contratos visibles

- Escala: texto informativo fijo `0 a 10`; no existe control editable.
- Aprobatoria: decimal entre 0 y 10.
- Decimales visibles: 0, 1 o 2.
- Redondeo: `half_up` fijo.
- No entrega: cero únicamente al cierre.
- Justificado: excluido del denominador.
- Pesos: porcentaje 0–100, separado semánticamente de una calificación.
- Activación: requiere criterios activos positivos con total superior exacto 100%; cada distribución interna existente también debe sumar 100%; híbrido requiere dos hijos.
- Concurrencia: las ediciones incluyen `expectedUpdatedAt`; una fila modificada por otra sesión produce conflicto 409 y obliga a recargar.

## Estados UX obligatorios

- Skeleton con `role=status`.
- Vacío guiado para primer ciclo y primer periodo.
- Error con mensaje público y reintento.
- 401/403 sin contenido del tenant.
- Feature flag deshabilitado con mensaje explícito.
- Tenant suspendido rechazado antes del repositorio por `requireTenantSession`.
- Periodo cerrado y esquema activo/archivado en sólo lectura.
- Confirmación previa para fechas/estado, reglas, activación y copia.
- Guardado sólo se anuncia después de respuesta exitosa y recarga del recurso persistido.

## Marca blanca y accesibilidad

Los componentes usan únicamente `primary`, `muted`, `destructive`, `card`, `border`, `ring` y demás tokens semánticos. No contienen HEX/RGB/HSL ni nombres/URLs de una institución. Los estados siempre incluyen texto e icono. Labels, fieldsets, headings, `aria-live`, alertas, foco visible y orden DOM permiten teclado y lector de pantalla. La composición se verificó a 360, 768 y 1440 píxeles.

## Rollback

Mantener `ACADEMIC_GRADING_V2_ENABLED=false` o retirar los dos enlaces impide consumir las rutas nuevas. Revertir el commit del Paso 10 elimina exclusivamente UI/capa de configuración; tablas, RPC y datos de Pasos 2–8 permanecen intactos.
