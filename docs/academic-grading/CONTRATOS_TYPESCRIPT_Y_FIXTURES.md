# Contratos TypeScript y fixtures anonimizados

## Código ejecutable del Paso 1

- `src/lib/academic-grading/scale.ts`: límites canónicos, marca `Grade10`, validación, conversión única y redondeo sólo visual.
- `src/lib/academic-grading/contracts.ts`: contexto tenant, ámbito académico, reglas institucionales, comando y resultado de mutación.
- `src/lib/academic-grading/institutional-policy.ts`: ciclo inicial, periodos y reglas D-01 a D-09 como contrato inmutable y probado.
- `tests/fixtures/academic-grading.ts`: dos tenants y un comando sintéticos; no contienen IDs, nombres, correos, CURP ni matrículas reales.

Estos contratos no crean APIs ni tablas. Son el límite común que los pasos 2–13 deberán extender sin duplicar modelos.

## Invariantes

1. `tenantId` se deriva de sesión en servidor; aunque aparezca en un comando interno, nunca se confía en el valor enviado por navegador.
2. `Grade10` sólo se obtiene tras validar 0–10.
3. Un resultado no calificado lleva `grade=null` y un estado explícito.
4. Una escritura exige `assignmentId`, `enrollmentId`, `periodId`, `criterionId`, motivo, `expectedRowVersion` e idempotency key.
5. El servidor devuelve nueva versión, auditoría y timestamp; la interfaz no inventa estado confirmado.
6. Identificadores siguen siendo strings en Paso 1 porque las entidades aún no existen. Las migraciones posteriores fijarán UUID/FKs compuestas tenant-safe.
7. El ciclo inicial es `2026–2027` (`2026-08-31` a `2027-07-16`) y sus tres periodos son consecutivos y no solapados.
8. La política inicial fija aprobatoria 6.0, cuatro decimales exactos, uno visible con `HALF_UP`, `no_entrego` a cero sólo al cierre y `justificado` excluido.

## Contrato de error futuro

| Código | Significado | Respuesta UI |
|---|---|---|
| `UNAUTHENTICATED` | sesión ausente/inválida | redirigir a login sin filtrar datos |
| `TENANT_FORBIDDEN` | tenant distinto/inactivo | pantalla de acceso no disponible |
| `ASSIGNMENT_FORBIDDEN` | profesor sin asignación exacta | mensaje de permiso, sin revelar alumno/clase |
| `PERIOD_CLOSED` | periodo cerrado | recargar snapshot, editor bloqueado |
| `VERSION_CONFLICT` | otra edición ganó | mostrar valor servidor y opciones recargar/cancelar |
| `INVALID_GRADE` | valor fuera de 0–10 | error junto al campo, no enviar |
| `IDEMPOTENCY_CONFLICT` | misma clave/payload distinto | bloquear y registrar correlación |
| `VALIDATION_ERROR` | contrato incompleto | errores por campo |

## Prohibiciones para fixtures

- No copiar registros productivos ni UUIDs reales.
- No almacenar correos, CURP, teléfonos, nombres de alumnos o credenciales.
- No usar el nombre/logo/color del colegio como expectativa de prueba.
- Usar al menos tenants A/B y profesores A/B para las pruebas negativas.
