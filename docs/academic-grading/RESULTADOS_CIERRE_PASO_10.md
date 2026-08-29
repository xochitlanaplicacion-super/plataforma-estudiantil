# Resultados de cierre — Paso 10

## Estado

`COMPLETADO` localmente. Se implementaron todas las subetapas inseparables del Paso 10 y se respetó la parada previa al Paso 11.

## Entregado

1. Grupo “Evaluación” visible para `superuser` y `admin` con enlaces a ciclos/periodos y esquemas/criterios.
2. Dos rutas protegidas por sesión, tenant activo y rol administrativo.
3. Selectores jerárquicos ciclo→nivel→carrera/programa→grado→grupo→asignación→periodo.
4. Editores persistentes de ciclo, periodo, aprobatoria, decimales, criterios y subcriterios; reglas no editables y escala 0–10 informativa.
5. Calculadora jerárquica de pesos, bloqueo visual y transaccional de activación distinta de 100%, copia versionada y activación RPC.
6. Confirmaciones de cambios, compare-and-swap por `updated_at`, conflicto 409, periodo cerrado en sólo lectura y auditoría académica read-only.
7. Loading, vacío, error/reintento, 403, flag deshabilitado y suspensión; responsive, teclado, lector de pantalla, axe y tokens de marca blanca.

## Base de datos y servicios

- `BASE DE DATOS: SIN CAMBIOS`.
- Cero migraciones, DDL, DML remoto o backfill.
- Frontend conectado únicamente a acciones tipadas; repositorio servidor usa cliente de sesión, filtros tenant y RLS existentes.
- Sin admin/service client nuevo, Edge Function, cron, cola, webhook ni proveedor externo.
- Changelog de Supabase revisado al iniciar. Los cambios vigentes de Management API `logs`, extensiones, Realtime y self-hosting no afectan este paso. La deprecación futura de TypeScript <5 tampoco aplica: el proyecto usa TypeScript 5.

## Pruebas aprobadas

- Específicas: 7/7 (4 unitarias y 3 de componentes/integración visual).
- Unitarias completas: 124/124 en 17 archivos.
- Componentes completas: 15/15 en 6 archivos.
- Accesibilidad: axe sin infracciones `critical` o `serious`; navegación por teclado comprobada.
- Roles: profesor bloqueado antes del repositorio; admin autorizado; feature flag deny-by-default.
- Validaciones: escala no editable, fechas, rango 0–10, versión, concurrencia y total exacto 100%.
- E2E Chromium: 1/1; borrador→criterio 100%→activar, viewports 360/768/1440, ocho capturas y video.
- `npm run typecheck`: cero errores.
- `npm run test:e2e:list`: 4 pruebas localizadas en dos proyectos.
- `npm run build`: aprobado, 55/55 páginas; rutas administrativas generadas.
- `git diff --check` y escaneos de color/secreto/dominio/`any`: aprobados.

## Seguridad y aislamiento

- Actor y tenant nunca provienen del formulario.
- IDs manipulados se acotan nuevamente por tenant, relación padre y RLS; una fila ajena se presenta como no disponible/conflicto sin filtrar datos.
- Profesor/alumno no acceden a las rutas ni al servicio administrativo.
- Esquemas activos/archivados y periodos cerrados no se reescriben.
- Activación/copia usan RPC atómicas existentes y versión esperada.
- No se incorporaron secretos, PII, dominios escolares ni colores institucionales en código/evidencia.

## Evidencias

- Mapa: `docs/academic-grading/MAPA_CONFIGURACION_ADMINISTRATIVA_PASO_10.md`.
- Capturas/video y manifiesto: `docs/academic-grading/evidence/step10/`.
- Pruebas: `tests/unit/academic-configuration-step10.test.ts`, `tests/components/academic-configuration-step10.test.tsx`, `tests/e2e/academic-configuration-step10.spec.ts`.

## Riesgos restantes

- Bloqueantes para el cierre del Paso 10: ninguno.
- No bloqueante: las migraciones académicas continúan sólo locales hasta los pasos de backfill/despliegue autorizados; el feature flag continúa apagado por defecto.
- No bloqueante: la exportación externa de auditoría y animaciones adicionales permanecen fuera del alcance.

## Rollback

Apagar el feature flag conserva inaccesible la nueva API; retirar enlaces o revertir el commit local del Paso 10 elimina la UI. No existe rollback de base de datos porque este paso no la modificó.
