# 🚀 Protocolo de Despliegue Marca Blanca (White-Label)

Este documento contiene las instrucciones paso a paso para desplegar una **nueva instancia independiente** de la Plataforma Estudiantil para cada colegio o institución educativa que adquiera el software.

Cada cliente contará con:
- **Su propio proyecto en Supabase** (base de datos aislada, almacenamiento de archivos e identidades de usuarios).
- **Su propio repositorio en GitHub** (código fuente independiente y control de versiones).
- **Su propio proyecto en Vercel** (dominio o subdominio personalizado con SSL automático).
- **Su propia personalización** (logotipos, colores institucionales, nombre de la escuela, contacto), administrable directamente desde el panel de control del sistema (`/dashboard/admin/configuracion`).

---

## 📋 Lista de Verificación (Checklist de Despliegue)

- [ ] 1. Crear nuevo proyecto en **Supabase**
- [ ] 2. Ejecutar el script SQL inicial (tablas y políticas de seguridad)
- [ ] 3. Crear repositorio nuevo en **GitHub**
- [ ] 4. Duplicar y subir el código al nuevo repositorio
- [ ] 5. Crear nuevo proyecto en **Vercel** conectado a GitHub
- [ ] 6. Configurar las Variables de Entorno en Vercel
- [ ] 7. Iniciar sesión como Administrador y personalizar el colegio

---

## 🛠️ Paso 1: Configurar Supabase para el Nuevo Colegio

1. Entra a [https://supabase.com](https://supabase.com) y crea un **New Project**.
   - **Name:** `plataforma-[nombre-colegio]` (ejemplo: `plataforma-colegio-hidalgo`)
   - **Database Password:** Guarda esta contraseña en un lugar seguro.
   - **Region:** Selecciona la región más cercana (ej. `us-east-1` o `us-west-1`).

2. En el panel lateral de Supabase, ve a **Project Settings > API**:
   - Copia la **Project URL** (ejemplo: `https://xxxx.supabase.co`)
   - Copia la clave **anon (public)**
   - Copia la clave **service_role (secret)**

3. Ve al **SQL Editor** en Supabase y ejecuta las migraciones iniciales para crear la estructura de tablas y funciones.
4. En **Storage**, asegúrate de habilitar los buckets necesarios:
   - `material-apoyo`
   - `logos-institucion`
   - `entregas-tareas`
   - `diapositivas-clase`

---

## 🐙 Paso 2: Crear Repositorio GitHub para el Colegio

1. Entra a GitHub y crea un repositorio nuevo:
   - **Repository Name:** `plataforma-[nombre-colegio]`
   - **Visibility:** Public o Private (según lo acuerdes con el cliente).

2. En la terminal de tu equipo, duplica el proyecto base e inícialo para el cliente:
   ```bash
   # Clona la plantilla base a una nueva carpeta
   git clone https://github.com/tu-usuario/plataforma-base.git plataforma-nuevo-colegio
   cd plataforma-nuevo-colegio

   # Cambia la dirección remota hacia el repositorio del nuevo colegio
   git remote set-url origin https://github.com/tu-usuario/plataforma-nuevo-colegio.git

   # Sube el código
   git push -u origin main
   ```

---

## 🔑 Paso 3: Configurar Variables de Entorno (.env.local y Vercel)

Las variables de entorno son la clave del modelo Marca Blanca: **ninguna clave API ni URL debe escribirse directamente en el código**.

### Archivo `.env.local` (Desarrollo Local):
Crea el archivo `.env.local` en la raíz del proyecto para pruebas locales:

```env
# URL y Claves del Supabase del Cliente
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxx

# IA / OpenRouter (Clave global de servicio o por cliente)
OPENROUTER_API_KEY=sk-or-v1-xxxx
OPENROUTER_SLIDES_API_KEY=sk-or-v1-xxxx

# Dominio y Nombre de la Aplicación
NEXT_PUBLIC_APP_URL=https://plataforma-nuevo-colegio.vercel.app
NEXT_PUBLIC_APP_NAME="Plataforma Estudiantil"

# Secreto de seguridad para tareas de mantenimiento automáticas (Cron)
CRON_SECRET=secreto-unico-para-este-colegio
```

---

## ⚡ Paso 4: Despliegue en Vercel (Producción)

1. Entra a [https://vercel.com](https://vercel.com) y haz clic en **Add New > Project**.
2. Importa el repositorio de GitHub del nuevo colegio (`plataforma-[nombre-colegio]`).
3. En la sección **Environment Variables**, agrega **una por una** las siguientes 6 variables:

| Variable | Descripción | Ejemplo de Valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública de Supabase del colegio | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública Anon de Supabase | `sb_publishable_xxxx` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta Service Role | `sb_secret_xxxx` |
| `OPENROUTER_API_KEY` | Clave para IA (Copiloto y Ejercicios) | `sk-or-v1-xxxx` |
| `OPENROUTER_SLIDES_API_KEY` | Clave para IA de Diapositivas | `sk-or-v1-xxxx` |
| `NEXT_PUBLIC_APP_URL` | Dominio final de Vercel | `https://colegio.vercel.app` |

4. Haz clic en **Deploy**. Vercel compilará la aplicación en 1-2 minutos.

---

## 🎨 Paso 5: Personalización Institucional (Primer Inicio)

Una vez completado el deploy:

1. Entra al enlace generado por Vercel (`https://colegio.vercel.app`).
2. Registra la primera cuenta de administrador o inicia sesión con el usuario inicial configurado.
3. Ve a **Panel de Control > Configuración del Sistema** (`/dashboard/admin/configuracion`):
   - **Nombre de la Institución:** Escribe el nombre completo del colegio.
   - **Colores Institucionales:** Elige los colores primario y secundario del colegio (el tema visual de toda la plataforma cambiará automáticamente).
   - **Logotipo:** Sube el logo oficial de la escuela.
   - **Información de Contacto:** Teléfonos, dirección, correo y horarios de atención.

¡Listo! El colegio ahora cuenta con una plataforma 100% aislada, personalizada y funcional.

---

## 🛡️ Reglas de Seguridad Marca Blanca

1. **Jamás subir `.env.local` a Git**: El archivo `.env.local` debe estar siempre en `.gitignore`.
2. **Sin fallbacks con URLs reales**: En el código nunca deben dejarse URLs de Supabase o claves API por defecto. El código usará estrictamente `process.env.NEXT_PUBLIC_SUPABASE_URL!` y fallará de forma segura si no están definidas las variables en Vercel.
3. **Control de costos de IA**: Si usas OpenRouter, puedes asignar un límite de presupuesto mensual o una API Key con saldo topado para cada colegio.
