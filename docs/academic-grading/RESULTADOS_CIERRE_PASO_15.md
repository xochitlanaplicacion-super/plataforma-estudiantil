# Resultados de cierre — Paso 15

Fecha: 2026-08-30 (America/Mexico_City)

## Resultado técnico previo al despliegue

La implementación académica multitenant está certificada localmente y en Supabase productivo. La aplicación conserva el tenant existente en modo `dual` hasta que finalice la ventana de observación el 2026-09-06; este paso no anticipa la promoción a `canonical`.

## Base de datos productiva

- Migración `20260830060100`: retiró tres políticas heredadas de `ejercicios` que daban acceso público o demasiado amplio.
- Migraciones `20260830064500` y `20260830065500`: corrigieron a `STABLE` la volatilidad declarada de cuatro funciones académicas sin cambiar firmas, permisos, datos ni resultados.
- Las 11 fronteras académicas usan una política `RESTRICTIVE` y un contexto de tenant cacheable por consulta.
- `anon` enumera 0 ejercicios.
- Conteos antes/después idénticos: 1 tenant, 3 perfiles, 7 ejercicios, 1 ciclo, 3 periodos, 1 inscripción, 1 asignación, 3 esquemas, 3 criterios y 0 resultados.
- Checksum de ejercicios antes/después: `05beb6c18c4e2d3b89dc7e857370c3aa`.
- Calificaciones fuera de 0–10: 0.
- Consultas bloqueadas o de larga duración posteriores: 0.
- `supabase db lint --level warning --fail-on warning`: cero hallazgos.
- Advisors: 0 errores, 0 críticos/altos y 334 advertencias heredadas; ninguna política insegura de `ejercicios`.

## Pruebas

- pgTAP de anonimato, roles y tenant A/B: 14/14.
- Suite unitaria: 149/149 en 20 archivos.
- Componentes: 26/26 en 8 archivos.
- E2E Chromium: 8/8, escritorio y móvil.
- TypeScript: cero errores.
- ESLint Next: cero errores; 80 advertencias heredadas inventariadas.
- Build Next.js 15.5.24: 58/58 rutas.
- Tipos Supabase generados y contratos: aprobados.
- EXPLAIN con 200 alumnos: libreta 114.282 ms / 250 ms; RLS de fuentes 124.020 ms / 150 ms; cierre 44.329 ms / 150 ms.
- Escaneo de código y bundle: 0 secretos, 0 contraseñas conocidas y 0 presentaciones de nota 0–100.
- Segunda escuela sintética: checklist 12/12 y rollback con cero residuos.

## Dependencias

Se actualizaron Next.js 15.5.9→15.5.24, Nodemailer 6→9 y PDF.js a la rama segura compatible con Node 20. Overrides compatibles corrigieron Handlebars, protobufjs y websocket-driver. El total productivo pasó de 3 vulnerabilidades críticas a 0.

Riesgo residual: `npm audit --omit=dev` informa 0 críticas, 10 altas y 54 moderadas. La única dependencia directa alta es `pptxgenjs`, cuyo supuesto arreglo propone una regresión mayor a una versión antigua; no se aplicó `--force`. El resto procede principalmente de Genkit/OpenTelemetry y PostCSS empaquetado por Next 15, sin parche compatible en esta rama.

## Reversión

- Aplicación: volver al deployment productivo anterior en Vercel.
- Funcionalidad académica: apagar `ACADEMIC_GRADING_V2_ENABLED` o cambiar sólo el tenant afectado a `legacy`.
- Base: las migraciones de seguridad no modificaron datos. Una compensatoria puede restaurar volatilidad, pero no deben restaurarse las tres políticas inseguras.
- Datos: conservar IDs, snapshots, auditoría, sombra de compatibilidad y el backup lógico verificado del Paso 14.

## Despliegue

La evidencia de preview, producción, smoke tests y commit final se añadirá en el cierre formal después de completar la publicación gradual autorizada.
