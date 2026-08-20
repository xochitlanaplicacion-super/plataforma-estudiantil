# Operación multitenant

La plataforma funciona como un SaaS multitenant sobre un solo proyecto de Supabase y un solo código. La identidad permanente de una escuela es `tenants.id`; ni el dominio ni el ID del superusuario son claves de propiedad.

## Estado implementado

- Xochitlán está registrado como tenant `c6ecbb65-5e78-48a3-aea0-b6dc9bd5939c`.
- Las 46 tablas de negocio tienen `tenant_id`, FK e índice.
- Los registros históricos conservan los mismos conteos que el respaldo previo.
- RLS tiene una política restrictiva de frontera en todas las tablas tenantizadas.
- Storage usa rutas cuyo primer segmento es el `tenant_id` y una política `RESTRICTIVE` impide escribir o listar rutas de otra institución.
- Los cinco logos históricos fueron copiados a la ruta tenantizada. Los originales continúan temporalmente en la raíz para reversión.
- SMTP se almacena por tenant; la contraseña de aplicación vive en Supabase Vault y no se devuelve al navegador.
- `profiles.password_plain` fue eliminado.

## Alta de una escuela sin SQL

1. Iniciar sesión con la cuenta marcada en `platform_admins` desde el dominio central.
2. Abrir `/platform`.
3. Pulsar **Nueva escuela**.
4. Capturar nombre, dominio, primer superusuario, inicio y duración del periodo.
5. Opcionalmente capturar el Gmail institucional, contraseña de aplicación y nombre del remitente.
6. Confirmar el alta.

El aprovisionamiento crea tenant, configuración, dominio, periodo de servicio, usuario Auth, perfil y auditoría. El usuario recibe `tenant_id` y rol mediante `app_metadata` protegido. Si SMTP fue proporcionado, recibe el correo de bienvenida con la marca de su institución.

El Superduperuser es una identidad global independiente: existe en `auth.users` y
`platform_admins`, pero no tiene fila en `profiles`, no pertenece a ningún tenant y
no hereda acceso académico. El primer `superuser` de cada escuela sí pertenece a su
tenant y funciona como director/administrador institucional, sin acceso a `/platform`.

El panel global persiste sus operaciones en tablas dedicadas: `platform_admins` para
autorización, `tenant_provisioning` para aprovisionamiento, `platform_audit` para
auditoría, `pago_de_servicios` para vigencia/IA/bloqueo y `tenant_domains` para los
dominios. Los formularios no muestran éxito hasta que Supabase devuelve la fila
guardada. El panel incluye cierre explícito de sesión.

## Correo por tenant

Cada escuela puede conservar el flujo actual de Gmail:

1. Crear o elegir el Gmail institucional.
2. Activar verificación en dos pasos.
3. Crear una contraseña de aplicación.
4. Guardar Gmail y contraseña desde Datos de la Institución o durante el aprovisionamiento.

La contraseña se guarda en Vault. Los correos de altas, reactivaciones y recordatorios resuelven colores, logo, URL, horarios y remitente usando el tenant del destinatario. Los reenvíos posteriores no leen una contraseña del usuario: generan un enlace de recuperación de Supabase Auth.

## Dominios

`configuracion_sistema.sitio_web` continúa siendo información de contacto. La resolución técnica usa `tenant_domains.hostname`.

Cambiar el dominio principal desde `/platform` ejecuta una función atómica que:

1. desmarca el dominio principal anterior;
2. marca el nuevo;
3. actualiza `url_plataforma`;
4. registra auditoría.

No modifica alumnos, materias, ejercicios, pagos ni rutas de archivos. El dominio anterior puede conservarse como alias.

También puede editarse directamente el hostname de una fila existente; si es el
principal, `configuracion_sistema.url_plataforma` se actualiza en la misma transacción.
El registro en Supabase no configura DNS ni acredita propiedad ante Vercel: antes de
usar un dominio nuevo, debe agregarse al mismo proyecto Vercel y apuntarse a los
registros DNS que Vercel indique.

En Vercel deben añadirse el wildcard/subdominio y los dominios personalizados al mismo proyecto. No se necesita otro GitHub, despliegue o Supabase por escuela.

## Vigencia, IA y bloqueo de acceso

El Superduperuser administra por tenant:

- `estado` del servicio;
- fecha de inicio;
- duración de 1 a 3660 días;
- disponibilidad de IA;
- bloqueo de profesores y alumnos;
- mensaje institucional de bloqueo.

| Estado | IA | Switch de bloqueo | Resultado |
|---|---:|---:|---|
| Vigente | Encendida | Cualquiera | Acceso normal |
| Vigente | Apagada | Cualquiera | Acceso normal, interfaz/API de IA bloqueadas |
| Vencido o `NO` | Cualquiera | Apagado | Acceso normal, IA bloqueada |
| Vencido o `NO` | Cualquiera | Encendido | Profesor/alumno bloqueados; admin/superuser conservan acceso |

Los crons requieren `Authorization: Bearer $CRON_SECRET`. Vercel envía este encabezado automáticamente cuando `CRON_SECRET` está definido en el proyecto.

## Variables de despliegue

Además de las claves Supabase existentes, el único proyecto Vercel debe definir:

```ini
MULTITENANT_ENABLED=true
DEFAULT_TENANT_SLUG=xochitlan
PLATFORM_HOSTNAMES=plataforma-estudiantil.vercel.app
NEXT_PUBLIC_PLATFORM_HOSTNAME=plataforma-estudiantil.vercel.app
CRON_SECRET=<secreto aleatorio compartido con Vercel Cron>
```

`PLATFORM_HOSTNAMES` puede contener varios hostnames separados por coma. La clave secreta de Supabase sólo se usa en helpers `server-only`, crons autenticados, aprovisionamiento, correo y páginas públicas que ya resolvieron un tenant explícito.

## Pruebas de aislamiento

Ejecutar con las variables locales cargadas:

```bash
DOTENV_CONFIG_PATH=.env.local node scripts/test-multitenant-isolation.mjs
```

La prueba crea dos usuarios administrativos temporales y una Escuela B temporal. Verifica:

- lecturas de niveles y perfiles;
- lectura cruzada por ID;
- escritura cruzada en Postgres;
- escritura propia y cruzada en Storage;
- resolución de dominio;
- restauración de conteos de Xochitlán.

Siempre elimina usuarios, tenant y objetos temporales al finalizar.

## Recuperación

- Esquema y datos: `backup_multitenant_20260819` contiene las copias previas de las tablas públicas y el manifiesto de Storage.
- Migración de respaldo: `supabase/migrations/20260819220119_backup_pre_multitenant.sql`.
- Los cinco objetos originales de `logos-institucion` se conservaron; no deben eliminarse hasta completar un periodo de estabilidad en producción.
- Las migraciones posteriores son aditivas y están versionadas en `supabase/migrations`.

En una reversión de emergencia se debe detener el alta de tenants, restaurar desde el esquema de respaldo en una transacción y volver las referencias de logos a sus rutas originales. No debe borrarse el esquema de respaldo hasta tener además un backup externo validado.

## Verificaciones finales realizadas

- Los conteos de las 46 tablas coinciden con el respaldo.
- No existen filas tenantizadas con `tenant_id` nulo.
- La prueba de Escuela B pasó diez controles de aislamiento.
- Security Advisor no reporta problemas de RLS, vistas ni funciones. Sólo queda la recomendación de activar **Leaked Password Protection** desde la configuración de Supabase Auth.
- Performance Advisor no reporta FK sin índice ni índices duplicados.

Referencias: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control), [Supabase Vault](https://supabase.com/docs/guides/database/vault), [Vercel Multi-Tenant Platforms](https://vercel.com/docs/multi-tenant/domain-management).
