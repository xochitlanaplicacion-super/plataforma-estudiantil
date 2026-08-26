# Saneamiento TypeScript previo al Paso 2

Fecha: 2026-08-25
Alcance: unidad técnica independiente entre el Paso 1 y el Paso 2 del plan canónico de calificaciones.

## Resultado

- Baseline: `npm run typecheck` fallaba con 64 errores TypeScript heredados.
- Estado final: `npm run typecheck` termina con código 0 y cero errores.
- Se repitió el typecheck después del build para regenerar y validar también `.next/types`.
- No se redujo la exigencia de `strict`, no se excluyeron archivos y no se introdujeron directivas `@ts-ignore` o `@ts-nocheck`.
- No hubo DDL/DML, migraciones, consultas de escritura, despliegue ni cambios de datos Supabase.
- El Paso 2 no fue iniciado.

## Causas raíz corregidas

1. Componentes auxiliares exportados desde una ruta `page.tsx`, algo rechazado por los contratos de módulos de ruta de Next.js 15.
2. Inferencia ambigua de consultas Supabase construidas con nombres de tabla o columnas dinámicos.
3. Cliente Supabase de servidor recibido por funciones con un tipo incompatible derivado del constructor cliente genérico.
4. Contratos institucionales, de landing, credenciales y avisos que no incluían campos ya usados por la aplicación.
5. API actual de PDF.js que exige la referencia al `canvas` dentro de `RenderParameters`.
6. API actual de React Markdown que no acepta `className` directamente en el componente.
7. Variable del stream de IA declarada dentro de `try` pero utilizada también desde `catch`.
8. Modelo de IA con costos opcionales no representados en el tipo local.
9. Comparación imposible contra una variante no admitida por el modal de ejercicios.
10. Error lógico al consultar `.length` sobre el índice numérico del carrusel.
11. Acciones de materiales consumidas como si devolvieran una propiedad `success` que su contrato real no contiene.

## Organización realizada

La implementación completa de la landing se movió desde la ruta de Next.js a:

`src/components/landing/InstitutionLandingPage.tsx`

La ruta `src/app/acerca-de-nosotros/page.tsx` ahora sólo reexporta el componente predeterminado permitido. El editor administrativo importa las secciones de vista previa desde el módulo de componentes, sin duplicar código ni modificar la personalización multitenant.

## Verificación ejecutada

| Comando | Resultado |
|---|---|
| `npm run typecheck` | 0 errores, código 0 |
| `npm run build` | Aprobado; 53 páginas generadas |
| `npm run test:unit` | 19/19 aprobadas |
| `npm run test:components` | 1/1 aprobada |
| `npm run test:e2e:list` | 2 escenarios encontrados |
| `npm run test:e2e` | 2/2 aprobados, escritorio y móvil |
| `git diff --check` | Aprobado |

## Condición previa al Paso 2

El typecheck ya queda como puerta obligatoria: no debe iniciarse ni aceptarse el Paso 2 si `npm run typecheck` deja de terminar con código 0. Continúa siendo independiente la precondición ya documentada de reconstruir una línea base limpia y reproducible de migraciones antes de aplicar migraciones académicas.
