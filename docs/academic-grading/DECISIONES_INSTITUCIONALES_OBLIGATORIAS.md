# Decisiones institucionales obligatorias para cerrar el Paso 1

## Regla de validez y delegación

Una decisión sólo se considera `APROBADA` cuando existe una instrucción expresa del propietario. El 2026-08-25 el propietario ordenó: «tú hazlo solo, cierra formalmente el Paso 1 y cumple con todo lo que falta». Esa instrucción delegó expresamente el cierre técnico de D-01 a D-09. Los valores siguientes son decisiones institucionales congeladas para el ciclo inicial; un cambio posterior deberá versionarse y nunca reescribir historia cerrada.

## Decisiones aprobadas

| Decisión | Valor | Evidencia |
|---|---|---|
| Escala técnica y de presentación | 0.0000–10.0000 | Orden expresa del usuario de estandarizar todas las calificaciones en 0–10 antes del Paso 1 |
| Ponderaciones | 0–100% y suma exacta 100% | El porcentaje representa peso, no calificación; plan V2 sellado |
| Separación de estados | `sin_capturar`, `calificado`, `no_entrego`, `justificado` | Plan V2; evita convertir `null` implícitamente en nota |
| D-01 — Ciclo inicial | `2026–2027` | Delegación expresa del propietario del 2026-08-25 |
| D-02 — Vigencia del ciclo | `2026-08-31` a `2027-07-16`, fechas inclusivas | Decisión técnica delegada; zona `America/Mexico_City` |
| D-03 — Periodos | P1 `2026-08-31`–`2026-11-27`; P2 `2026-11-28`–`2027-03-12`; P3 `2027-03-13`–`2027-07-16` | Orden 1–3, cobertura continua y sin solapamiento |
| D-04 — Aprobatoria | `6.0000` | Escala canónica 0–10 |
| D-05 — Precisión y redondeo | Guardar 4 decimales; mostrar 1; `HALF_UP` sólo al presentar | El valor exacto nunca se sobrescribe por presentación |
| D-06 — `no_entrego` | Antes del cierre conserva estado explícito; al cerrar aporta `0.0000` | No convierte ausencias provisionales en cero anticipadamente |
| D-07 — `justificado` | Excluir del numerador y denominador; nunca convertir automáticamente a cero | Preserva la justificación como estado |
| D-08 — Cierre/reapertura | Superuser; admin sólo con capacidad explícita; motivo obligatorio para reapertura y auditoría en ambos casos | Profesores, alumnos y platform admin no pueden cerrar/reabrir |
| D-09 — Solapamiento | Prohibido dentro del mismo tenant y ciclo | Los periodos pueden ser contiguos, nunca superpuestos |

## Decisiones cerradas

| ID | Decisión | Valor aprobado | Estado |
|---|---|---|---|
| D-01 | Nombre del ciclo inicial | `2026–2027` | APROBADA |
| D-02 | Fecha inicial y final | `2026-08-31` / `2027-07-16` | APROBADA |
| D-03 | Periodos | Tres periodos consecutivos descritos arriba | APROBADA |
| D-04 | Calificación mínima aprobatoria | `6.0000` | APROBADA |
| D-05 | Decimales y redondeo | 4 exactos, 1 visible, `HALF_UP` | APROBADA |
| D-06 | Tratamiento de `no_entrego` | `0.0000` sólo al cierre | APROBADA |
| D-07 | Tratamiento de `justificado` | Excluir del cálculo | APROBADA |
| D-08 | Roles que pueden cerrar/reabrir | Superuser; admin con capacidad explícita; motivo/auditoría | APROBADA |
| D-09 | Periodos solapados | Prohibidos por tenant/ciclo | APROBADA |

## Efecto sobre los pasos siguientes

No queda ninguna decisión institucional bloqueante del Paso 1. El Paso 2 puede materializar el ciclo y sus reglas de vigencia; los periodos se crearán en el Paso 3 con los valores aquí versionados. Estas fechas son política inicial de la plataforma bajo delegación del propietario, no una afirmación de calendario oficial externo.
