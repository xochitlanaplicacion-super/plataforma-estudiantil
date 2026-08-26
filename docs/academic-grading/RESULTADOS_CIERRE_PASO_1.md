# Evidencia de cierre del Paso 1

- Ejecución: `e1r00003-2026-0825-paso1-000000000003`.
- Fecha: 2026-08-25, zona `America/Mexico_City`.
- Plan: `EDICION_CALIFICACIONES_MULTITENANT_V2`.
- SHA del plan verificado: `3f6a6b62c022c1715ae18ae7b960382d65ac1a22aa29932aa11f33ef9c6d43a0`.
- Git base: `main` en `e42cc05781293931a8cf00aa6eff95b1353903ed`.
- Base remota: cero DDL/DML; sólo OpenAPI, catálogos/conteos read-only y `pg_dump --schema-only`.

## Decisiones congeladas

D-01 a D-09 están `APROBADA` por delegación expresa del propietario en `DECISIONES_INSTITUCIONALES_OBLIGATORIAS.md`. El contrato ejecutable correspondiente vive en `src/lib/academic-grading/institutional-policy.ts` y tiene pruebas de límites, orden y ausencia de solapamiento.

## Resultados verificables

| Control | Resultado |
|---|---|
| SHA triple plan/manifiesto/registro | Coincide |
| OpenAPI remoto | HTTP 200; 294599 bytes; SHA-256 `cf4efdb368cb49ed14e84edd0dbd1bc4113f8ffa1ddd0f885a9df72a878052da` |
| Vitest dominio | 3 archivos, 19 pruebas, todas aprobadas |
| Testing Library | 1 archivo, 1 prueba aprobada |
| Playwright real | 2/2: Chromium escritorio y móvil; login visible |
| pgTAP local | 43/43 aserciones aprobadas sobre clon local sin filas productivas |
| `git diff --check` | Sin errores |
| `npm run build` | Aprobado; 53 páginas generadas |
| `npm run typecheck` | Baseline fallido: 64 errores heredados; 0 en archivos del Paso 1 |

## Incidencias y tratamiento

1. Supabase retiró OpenAPI para claves públicas en 2026. El script usa ahora clave secreta sólo en proceso servidor y encabezado `apikey`, sin imprimirla ni persistirla.
2. Realtime `v2.129.0` ejecuta una instrucción no soportada por el CPU local. El override ignorado por Git `supabase/.temp/realtime-version=v2.120.3` permitió inicializar esquemas; PostgreSQL se mantuvo en 17.6.1.159.
3. Las migraciones históricas no reconstruyen una base vacía porque comienzan después de la creación original de `profiles`. Para pgTAP se usó un clon local de sólo esquema. La estrategia definitiva de baseline limpio es requisito previo de aceptación del Paso 2.
4. La primera versión del baseline pgTAP esperaba `numeric` sin precisión. Se corrigió para fijar los tipos remotos reales: `numeric(5,2)`, `numeric(5,2)` y `numeric(10,2)`.
5. Playwright se configuró para reutilizar Chrome del sistema cuando existe y conserva fallback al navegador administrado por Playwright.

## Seguridad y rollback

- No se copiaron filas, UUID, PII, credenciales ni contenido de buckets.
- Los fixtures usan dos tenants sintéticos y UUID reservados para prueba.
- No se alteró la base remota ni se desplegó código.
- Rollback del Paso 1: revertir exclusivamente documentación, contratos, fixtures y configuración de pruebas. No existe rollback de datos.

## Deuda no bloqueante del Paso 1

Los 64 errores TypeScript preexistentes deben sanearse en una unidad independiente antes de endurecer el pipeline. No se ocultan: Next.js tiene desactivada la validación de tipos durante `build`. La reproducción de base limpia sí es bloqueante para la aceptación del Paso 2 y deberá resolverse dentro de ese paso antes de aplicar cualquier migración remota.
