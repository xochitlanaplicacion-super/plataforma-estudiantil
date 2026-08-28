# Resultados de cierre — Paso 7

## Resultado

El motor académico determinista y explicable v1 queda implementado y certificado localmente. TypeScript, PostgreSQL y el contrato visual producen exclusivamente notas `0–10`; los nueve casos dorados compartidos coinciden con tolerancia decimal exacta `0.0000` y la suma de aportes coincide con el total exacto.

No hubo `db push`, escritura remota, despliegue ni push Git. La migración se ejecutó únicamente en PostgreSQL Supabase 17.6 desechable. El feature flag permanece apagado por defecto y ningún consumidor productivo fue cortado al motor nuevo.

## Implementación entregada

- Motor TypeScript puro sin I/O, con aritmética entera fija de ocho decimales y salida exacta de cuatro.
- Fórmulas para directo, promedio de actividades, participación normalizada por máximo/meta e híbridos con pesos internos.
- Estados separados: `no_entregado` vale cero únicamente con periodo cerrado; `justificado` se excluye; los demás faltantes no se convierten en cero; estados desconocidos se rechazan.
- Denominador cero explícito con reglas `cero|excluir`; nunca `NaN` o `Infinity`.
- Redondeo `HALF_UP` configurable a 0–2 decimales sólo para presentación.
- Breakdown por fuente, subcriterio y criterio, con peso original/efectivo, ratio, nota canónica y aporte exacto.
- Función de equivalencia heredada `0–100 → 0–10` con tolerancia explícita.
- Función SQL pura `public.calcular_calificacion_academica(jsonb)` y adaptador RLS-safe `public.calcular_resultado_academico(uuid,uuid,uuid)`, ambos `SECURITY INVOKER`.
- Adaptador TypeScript de una sola consulta, `limit+1`, máximo 1,000 filas y dataset sin PII.
- Contrato accesible y marca blanca `GradeBreakdownView` para “Ver desglose”, sin colores hardcodeados.
- Flag de rollback `ACADEMIC_GRADING_ENGINE_V2_ENABLED`, desactivado por defecto.
- Objetivo TypeScript actualizado de ES2017 a ES2020 para soportar enteros exactos `BigInt`; se eliminó una caché incremental antigua y se regeneró correctamente.

## Pruebas y evidencia

| Comprobación | Resultado |
|---|---|
| Casos dorados SQL sobre base limpia | 24/24 pgTAP |
| Casos dorados SQL sobre base existente | 24/24 pgTAP |
| Matriz heredada RLS/IDOR ejecutada antes de probar el adaptador | 31/31 pgTAP |
| Total pgTAP ejecutado | 79/79 |
| Suite unitaria completa | 88/88, 12 archivos |
| Suite de componentes completa | 9/9, 4 archivos |
| TypeScript | 0 errores |
| Playwright discovery | 2 escenarios, escritorio y móvil |
| PostgreSQL lint | 0 errores en `public,private` |
| EXPLAIN | Usa índices académicos existentes; no se añadió índice redundante |
| Build Next.js 15.5.9 | Aprobado, 53 páginas estáticas; compilación final 2.0 min |
| `git diff --check` | Aprobado |
| Escaneo diferencial y archivos nuevos | Sin secretos reales, PII, dominios cliente ni colores hardcodeados; sólo aparece la credencial fija `postgres/postgres` del contenedor local desechable |

La matriz cubre notas/pesos 0, 5 y 10; `-0.0001`/`10.0001`; ratios 0/0.5/1; todos cero; meta y máximo; participación negativa; directo, actividades e híbrido; no entrega abierta/cerrada; justificado; sin capturar/pendiente/entregado/tardío; denominador cero; redondeo; independencia del orden; invariantes; y equivalencia SQL/TypeScript exacta.

## Seguridad y rendimiento

- El motor no autoriza ni recibe `tenant_id`, nombre, correo, matrícula u otra PII.
- El adaptador SQL consulta `vista_desglose_calificacion` como invocador y hereda RLS; un profesor no obtiene otra asignación del mismo grupo y otro tenant obtiene cero filas.
- `anon` carece de `EXECUTE`; `authenticated` sólo puede ejecutar las dos funciones públicas. El helper privado no realiza I/O.
- Las funciones fijan `search_path=''`, tienen límites de 100 criterios, 1,000 fuentes y 1 MiB, y no crean datos persistentes.
- La consulta se carga una vez; no existe N+1. `EXPLAIN` demostró cobertura con índices existentes, por lo que no se añadió uno sin evidencia.

## Migración y hashes

- Migración: `supabase/migrations/20260828014613_academic_deterministic_calculation_engine.sql`
- SHA-256 migración: `468bc05596881d1b8c47e6b65c94a96212053e1a9bed18f45960304970cfcb67`
- SHA-256 fixtures dorados: `58877b8604acb4572d2707a81b37c52331e10613dd8b5d91b7c465178ef29c44`
- SHA-256 especificación: `0f0ba033574fc137aff0cfdbdf619814694a1462a66a5ec87601ab3d07dcc490`
- SHA-256 arnés DB: `25a3c9dcf35897dd7b5c09f5b932f22079af118663a8c78b4303df39ef454404`

## Rollback y riesgos

El rollback transaccional eliminó las funciones nuevas y restauró el estado exacto posterior al Paso 6. Antes de un corte futuro basta mantener/apagar el flag. Después de aplicar la migración, se revoca `EXECUTE` y se eliminan funciones en orden adaptador→motor→helper; nunca se borran fuentes o notas.

Bloqueantes: ninguno para cerrar el Paso 7. La diferencia SQL/TypeScript observada es cero. Riesgos no bloqueantes: el corte efectivo de consumidores permanece diferido; la escritura atómica, auditoría, concurrencia y cierre pertenecen exclusivamente al Paso 8. El build consumió mucha memoria/swap en la primera ejecución, pero aprobó nuevamente con caché caliente tras el último cambio.

## Condición de parada

Paso 7 completo. Paso 8 no iniciado y requiere autorización nueva y expresa.
