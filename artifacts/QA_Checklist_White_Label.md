# 🧪 Plan de Pruebas Extremo: Auditoría White-Label (Multi-Tenant)

Esta es tu lista de control (Checklist) para realizar el QA (Quality Assurance) exhaustivo antes de subir tus cambios a producción.
Asegúrate de tener un color llamativo asignado en el panel (ej. morado brillante) durante las pruebas para que los cambios visuales resalten de inmediato.

## 🌐 1. Interfaces Públicas (Sin Iniciar Sesión)
- [x] **Página de Login (`/`)**
  - [x] El título de la pestaña del navegador dice "Plataforma Educativa | Sistema Académico" (o el nombre que definiste).
  - [x] El Logo principal que aparece es el que subiste desde el panel Admin.
  - [x] El tema dinámico (color de botón, estilo de cristal, fondo) cambia correctamente al recargar la página (si está en Aleatorio) o se queda fijo (si está en Fijo).
- [x] **Página de Acerca de Nosotros (`/acerca-de-nosotros`)**
  - [x] Aparece el "Nombre Completo" y el "Slogan" en el Hero section.
  - [x] Los correos y teléfonos listados son los que configuraste.
  - [x] El Copyright del footer menciona a la institución actual.
- [x] **Página de Preregistro (`/preregistro`)**
  - [x] La cabecera menciona el nombre corto o las siglas de la escuela.
  - [x] Los correos de contacto de ayuda son dinámicos.
- [x] **Página de Cuenta Expirada (`/expired`)**
  - [x] Al intentar loguear un alumno inactivo/expirado, la página roja de error muestra el teléfono y correo real configurado en el sistema para pedir ayuda.

## 👑 2. Interfaz de Superuser / Administrador
- [x] **Panel Principal (`/dashboard/admin`)**
  - [x] El subtítulo debajo de "Panel Administrativo" dice: "Control global de la plataforma [Nombre Corto]".
  - [x] Todo el tema visual (botones primarios, badges) es del color primario que elegiste.
- [X] **Menú Lateral (Sidebar)**
  - [x] El color de fondo del menú lateral es una variante 15% más oscura de tu color primario (gracias al ThemeProvider).
  - [x] El Logo en la parte superior izquierda del menú refleja el bucket.
  - [x] Debajo del logo aparece el "[Nombre Corto]" y el "[Slogan]".
- [X] **Generación de PDFs y Excel (Exportaciones)**
  - [X] Ve a "Matrícula y Salones" -> Entra a un grupo -> Exporta la **Lista de Asistencia PDF**. Verifica que el logo inyectado en el documento sea el de tu institución.
  - [X] Verifica el encabezado del archivo Excel exportado, debe decir "Lista Oficial - [Siglas]".
- [X] **Modal de Configuración (El nuevo Panel)**
  - [X] Verifica que subir una imagen nueva cambie exitosamente la URL (funcionalidad de subida de logos al bucket).
  - [X] Cambia el color primario, guarda, recarga la página, y asegúrate de que **TODA** la plataforma (botones, menús, textos) cambia de color.

## 👩‍🏫 3. Interfaz del Profesor
- [ ] **Dashboard General (`/dashboard/profesor`)**
  - [ ] Aparece la marca de agua dinámica o el nombre en las cabeceras.
- [ ] **Listas y PDFs (`/dashboard/profesor/grupos`)**
  - [ ] Al descargar la lista de asistencia de sus grupos en PDF, el logo de cabecera debe ser el oficial de la configuración, no "Zapata".
- [ ] **Mensajería (`/dashboard/profesor/mensajes`)**
  - [ ] La cabecera del chat dice "Chat Oficial [Siglas]".

## 👨‍🎓 4. Interfaz del Alumno
- [x] **Dashboard General (`/dashboard/alumno`)**
  - [x] El banner de bienvenida dice "Bienvenido a [Nombre Corto]".
- [x] **Mis Materias y Juegos (`ActivityPreview.tsx`)**
  - [x] Entra a una materia, abre una Actividad Interactiva / Juego.
  - [x] Verifica que el color del botón del juego coincida con el color primario.
  - [x] Verifica que la marca de agua o texto en el pie del visor del juego diga "Recurso oficial de [Nombre Completo]".
- [ ] **Documento de Acreditación (OCR / jsPDF)**
  - [ ] Entra a ver el dictamen digital.
  - [ ] Genera el PDF de la acreditación; asegúrate de que el logo impreso en el certificado sea el logo dinámico y no el anterior.
- [x] **Mensajería (`/dashboard/alumno/mensajes`)**
  - [x] El título del chat dice "Contacto Oficial [Siglas]".

## 📧 5. Correos Automáticos y Pasarela de Pagos (Back-End)
*Nota: Para probar esto, registra un nuevo alumno de prueba desde el admin y asínale una colegiatura.*
- [ ] **Correos de Bienvenida / Alta (`email.ts`)**
  - [ ] Remitente: "Equipo [Nombre Corto]".
  - [ ] Asunto: "Bienvenido a [Nombre Completo]".
  - [ ] Dentro del HTML del correo: El logotipo superior jala de `logo_url`.
  - [ ] Pie del correo: "© 2026 [Nombre Completo] - [Dirección]".
- [ ] **Correos de Recordatorio de Documentos**
  - [ ] Al presionar el botón "Recordatorio" en el Dashboard Admin, verifica que el correo enviado contenga los correos de contacto actualizados para que el alumno envíe sus papeles.
- [ ] **Correos y Recibos de Pago (`pagos.ts`)**
  - [ ] Genera un nuevo pago/boucher para un alumno.
  - [ ] El correo de "Pago Registrado" lleva el branding, logo y colores actuales.
  - [ ] Si se genera un PDF de boucher, la cabecera es dinámica.

## 🛠️ 6. Pruebas de Resiliencia (Manejo de Errores)
- [x] **Caché del Cliente:** Cierra la pestaña, vuelve a abrirla. Asegúrate de que el portal carga rápido y no parpadea a colores grises/rotos por falta de configuración (Fallback).
- [x] **Base de datos vacía:** Si por error un administrador borra la fila 1 de `configuracion_sistema` (¡no lo hagas en prod!), el sistema debe inyectar automáticamente los valores "Emiliano Zapata" por defecto en vez de romperse. (Comportamiento de la constante `DEFAULTS`).
