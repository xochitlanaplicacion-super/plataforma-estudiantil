-- ============================================================
-- Migration: Tramas, Marca de Agua, Diseño Panel, Posición Logo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar nuevas columnas a config_credenciales
ALTER TABLE public.config_credenciales
ADD COLUMN IF NOT EXISTS trama_tipo TEXT DEFAULT 'ninguno',
ADD COLUMN IF NOT EXISTS trama_imagen_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS trama_escala NUMERIC DEFAULT 50,
ADD COLUMN IF NOT EXISTS trama_rotacion NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS trama_opacidad NUMERIC DEFAULT 10,
ADD COLUMN IF NOT EXISTS logo_x NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS logo_y NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS panel_diseno TEXT DEFAULT 'plano';

-- 2. Crear bucket para imágenes de marca de agua
INSERT INTO storage.buckets (id, name, public)
VALUES ('credenciales-watermark', 'credenciales-watermark', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas de storage para el bucket credenciales-watermark
CREATE POLICY "Public read credenciales-watermark"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'credenciales-watermark');

CREATE POLICY "Admin upload credenciales-watermark"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'credenciales-watermark');

CREATE POLICY "Admin update credenciales-watermark"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'credenciales-watermark');

CREATE POLICY "Admin delete credenciales-watermark"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'credenciales-watermark');
