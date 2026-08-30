# Checklist certificada para una segunda escuela — Paso 15

Fecha: 2026-08-30 (America/Mexico_City)

## Resultado

La ruta de aprovisionamiento está lista para crear una segunda escuela sin copiar datos de Xochitlán. La identidad estable es `tenant_id`; el dominio sólo sirve para resolver la institución y puede reemplazarse sin reescribir datos académicos.

## Lista de aceptación

| Control | Evidencia | Estado |
|---|---|---|
| Crear tenant desde `/platform` | `createTenantSchool` crea tenant en estado de aprovisionamiento y registra avance | APROBADO |
| Crear primer superusuario | Supabase Auth recibe `tenant_id` y rol en metadata; después se crea el perfil del mismo tenant | APROBADO |
| Configuración marca blanca independiente | Se crea una fila `configuracion_sistema` ligada sólo al nuevo `tenant_id` | APROBADO |
| Dominio principal independiente | `tenant_domains` tiene unicidad global y una sola fila principal por tenant | APROBADO |
| Resolver apex y `www` | Pruebas `tenant-hostname` validan normalización y candidatos exactos | APROBADO |
| Cambiar dominio sin huérfanos | Prueba transaccional productiva reemplazó la misma fila y actualizó `url_plataforma` | APROBADO |
| SMTP por tenant | Metadata aislada en `tenant_smtp_settings`; el secreto no es legible ni se sobrescribe si el campo queda vacío | APROBADO |
| Servicio y bloqueo por tenant | Se crea `pago_de_servicios` propio; no se hereda el estado de otra escuela | APROBADO |
| Contexto académico vacío | El trigger crea rollout `legacy`; ciclos, periodos, esquemas y ejercicios comienzan en cero | APROBADO |
| Aislamiento RLS | pgTAP profesor/tenant A–B, anon y mutaciones cruzadas: 14/14 | APROBADO |
| Escala de notas | Persistencia y presentación canónica 0–10; cero coincidencias UI 0–100 | APROBADO |
| Reversión de la simulación | Toda la escuela sintética se creó dentro de una transacción y terminó con `ROLLBACK`; filas residuales: 0 | APROBADO |

## Simulación productiva sin persistencia

Se creó dentro de una transacción una escuela con dominio, configuración visual, metadata SMTP, fila de aprovisionamiento y rollout académico. Se comprobó:

- rollout inicial `legacy`;
- exactamente un dominio principal;
- SMTP sin secreto compartido;
- cero datos académicos pertenecientes a Xochitlán;
- reemplazo normalizado del dominio principal;
- actualización atómica de la URL de marca blanca;
- desaparición del dominio anterior sin filas huérfanas;
- `ROLLBACK` final con cero filas sintéticas.

No se creó ningún usuario real, correo real, secreto, archivo ni dato escolar durante esta simulación.

## Procedimiento operativo para el siguiente cliente

1. Confirmar que el dominio apunta al mismo proyecto Vercel y está validado allí.
2. Entrar al dominio central como superduperuser y abrir `/platform`.
3. Crear la escuela con nombre, slug, dominio, primer superusuario y periodo de servicio.
4. Confirmar estado de aprovisionamiento `ready` antes de entregar credenciales.
5. Configurar logo, colores y SMTP desde la institución del nuevo tenant; escribir una contraseña SMTP sólo al crearla o rotarla.
6. Probar dominio apex y `www`, acceso del superusuario y envío de un correo de prueba.
7. Crear un profesor y un alumno de prueba; verificar que no enumeren escuelas, usuarios, ejercicios ni calificaciones de otro tenant.
8. Mantener el rollout académico en `legacy` o `dual` hasta completar su propia observación; nunca copiar el contexto académico de Xochitlán.

## Condición de aprobación

Checklist: 12/12 controles aprobados (100 %). Una segunda escuela puede crearse sin una base Supabase nueva y sin mezclar sus datos con el tenant existente.
