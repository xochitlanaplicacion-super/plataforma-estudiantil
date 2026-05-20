-- ============================================================================
-- SQL WHITE-LABEL: SISTEMA MULTI-ESCUELA
-- Instituto Educativo Emiliano Zapata → Plataforma SaaS Marca Blanca
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================================

-- ─── PASO 1: Agregar columnas a configuracion_sistema ─────────────────────────

ALTER TABLE public.configuracion_sistema
  ADD COLUMN IF NOT EXISTS nombre_completo text DEFAULT 'Instituto Educativo Emiliano Zapata',
  ADD COLUMN IF NOT EXISTS nombre_corto text DEFAULT 'Emiliano Zapata',
  ADD COLUMN IF NOT EXISTS siglas text DEFAULT 'IEEZ',
  ADD COLUMN IF NOT EXISTS slogan text DEFAULT 'Plataforma Académica',
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS sitio_web text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS logo_dark_url text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS color_primario text DEFAULT '#8B2332',
  ADD COLUMN IF NOT EXISTS color_secundario text DEFAULT '#1A4A3F',
  ADD COLUMN IF NOT EXISTS temas_login jsonb DEFAULT '[
    {
      "id": "vino",
      "bgImage": "/images/FONDO_ROJO.png",
      "buttonColor": "#8B2332",
      "textColor": "text-white",
      "glassStyle": "bg-black/20 border-white/30 text-white"
    },
    {
      "id": "verde",
      "bgImage": "/images/FONDOS_VERDE.png",
      "buttonColor": "#1A4A3F",
      "textColor": "text-white",
      "glassStyle": "bg-black/20 border-white/30 text-white"
    },
    {
      "id": "beige",
      "bgImage": "/images/fondos_beige.jpg",
      "buttonColor": "#E8D5B7",
      "textColor": "text-[#1A4A3F]",
      "glassStyle": "bg-primary/10 border-primary/20 text-primary"
    }
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS modo_tema_login text DEFAULT 'aleatorio',
  ADD COLUMN IF NOT EXISTS tema_fijo_index int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS niveles_nombres jsonb DEFAULT '[
    { "clave": "bachillerato", "nombre": "Bachillerato Emiliano Zapata" },
    { "clave": "universidad", "nombre": "Universidad Emiliano Zapata" },
    { "clave": "capacitaciones", "nombre": "Capacitaciones Emiliano Zapata" }
  ]'::jsonb;

-- ─── PASO 2: Actualizar el registro existente id=1 con valores por defecto ────

UPDATE public.configuracion_sistema
SET
  nombre_completo = COALESCE(nombre_completo, 'Instituto Educativo Emiliano Zapata'),
  nombre_corto = COALESCE(nombre_corto, 'Emiliano Zapata'),
  siglas = COALESCE(siglas, 'IEEZ'),
  slogan = COALESCE(slogan, 'Plataforma Académica'),
  color_primario = COALESCE(color_primario, '#8B2332'),
  color_secundario = COALESCE(color_secundario, '#1A4A3F'),
  modo_tema_login = COALESCE(modo_tema_login, 'aleatorio'),
  tema_fijo_index = COALESCE(tema_fijo_index, 0)
WHERE id = 1;

-- ─── PASO 3: Crear bucket de Storage para logos ───────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos-institucion',
  'logos-institucion',
  true,
  5242880, -- 5MB máximo
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
ON CONFLICT (id) DO NOTHING;

-- ─── PASO 4: Políticas de acceso para el bucket ──────────────────────────────

-- Lectura pública (cualquiera puede ver los logos)
CREATE POLICY "Logos públicos lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos-institucion');

-- Upload solo para admin/superuser autenticados
CREATE POLICY "Logos upload admin"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'logos-institucion'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'superuser')
  )
);

-- Update solo para admin/superuser
CREATE POLICY "Logos update admin"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'logos-institucion'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'superuser')
  )
);

-- Delete solo para admin/superuser
CREATE POLICY "Logos delete admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'logos-institucion'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'superuser')
  )
);

-- ─── PASO 5: RLS para configuracion_sistema (si no existe) ───────────────────

-- Lectura pública de la configuración (todos necesitan ver nombre/logo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'configuracion_sistema' 
    AND policyname = 'config lectura publica'
  ) THEN
    CREATE POLICY "config lectura publica"
    ON public.configuracion_sistema FOR SELECT
    USING (true);
  END IF;
END $$;

-- ============================================================================
-- ✅ LISTO. Verifica ejecutando:
-- SELECT nombre_completo, nombre_corto, siglas, color_primario FROM configuracion_sistema WHERE id = 1;
-- ============================================================================
