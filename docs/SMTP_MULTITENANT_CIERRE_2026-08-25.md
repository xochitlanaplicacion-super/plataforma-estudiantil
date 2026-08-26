# Cierre de la corrección SMTP multitenant

Fecha: 2026-08-25

Estado: implementada y verificada antes de iniciar el Paso 2 del plan académico.

## Objetivo

Permitir que un superusuario o administrador consulte y actualice la configuración de correo saliente de su propia institución sin revelar el secreto SMTP ni efectuar escrituras innecesarias.

## Contrato de seguridad implementado

1. `getInstitucionConfigAuth()` exige una sesión válida con rol `superuser` o `admin`.
2. El `tenant_id` se obtiene del perfil autenticado mediante `requireTenantSession()`; el navegador no puede elegirlo.
3. La consulta de `tenant_smtp_settings` filtra explícitamente por ese `tenant_id`.
4. La respuesta para la interfaz contiene host, puerto, usuario y nombre del remitente, pero nunca el secreto.
5. La interfaz sólo recibe `smtp_password_configured`, un booleano derivado de la existencia de la referencia al secreto.
6. La recuperación del secreto quedó en `src/lib/email/tenant-smtp.ts`, marcado con `server-only`, y se usa exclusivamente para envíos desde el backend.
7. Se eliminó la antigua Server Action que aceptaba un `tenantId` arbitrario y devolvía las credenciales descifradas.
8. La clave pública no puede leer `tenant_smtp_settings` ni ejecutar el RPC que descifra el secreto. Esta condición se comprobó contra el proyecto remoto sin imprimir valores sensibles.

## Comportamiento de la interfaz

- Muestra los metadatos SMTP reales del tenant autenticado.
- Muestra `Contraseña configurada` o `Sin contraseña` como estado, nunca puntos que representen un secreto recuperado.
- El campo se llama `Nueva contraseña (App Password)`, inicia vacío y usa `autocomplete="new-password"` más indicadores para gestores de contraseñas.
- Dejarlo vacío conserva el secreto existente.
- Escribir una nueva contraseña reemplaza el secreto.
- Si metadatos y contraseña no cambiaron, no se envía ninguna operación SMTP.
- Si sólo cambia un metadato, se actualizan los metadatos conservando el secreto existente.

## Rutas de envío corregidas

Los correos de bienvenida, recordatorios documentales y recordatorios de pago recuperan la configuración SMTP del tenant correspondiente mediante el módulo exclusivo del servidor. Los colores, logotipo y textos siguen obteniéndose de la configuración institucional de ese mismo tenant.

## Evidencia automatizada

- `npm run typecheck`: cero errores.
- `npm run test:unit`: 23 pruebas aprobadas, incluidas cuatro pruebas específicas del contrato de guardado SMTP.
- `npm run test:components`: una prueba aprobada.
- Acceso con clave pública a `tenant_smtp_settings`: bloqueado, cero filas.
- Acceso con clave pública a `get_tenant_smtp_for_service`: bloqueado, cero filas y ningún secreto expuesto.
- Verificación de servicio de Xochitlán: tenant localizado, RPC operativo y host, puerto, usuario, remitente y secreto presentes. Sólo se comprobaron booleanos; no se imprimió el secreto.

## Persistencia y base de datos

No fue necesario crear tablas ni cambiar el esquema. La implementación utiliza `tenant_smtp_settings` y los RPC seguros ya existentes. Las comprobaciones remotas de esta corrección fueron de sólo lectura; no se modificó el SMTP actual.
