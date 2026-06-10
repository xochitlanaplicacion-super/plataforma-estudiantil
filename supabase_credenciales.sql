-- ============================================================
-- Script: Credenciales de Institución
-- Descripción: Crea las tablas necesarias para el módulo de
--              credenciales de estudiante.
-- IMPORTANTE: Ejecutar en Supabase SQL Editor.
-- ============================================================

-- 1. Tabla de configuración del diseño de credenciales
CREATE TABLE IF NOT EXISTS public.config_credenciales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_primario TEXT DEFAULT '#6B2D5B',
  color_secundario TEXT DEFAULT '#F5F0EB',
  color_texto_primario TEXT DEFAULT '#FFFFFF',
  color_texto_secundario TEXT DEFAULT '#333333',
  fuente_principal TEXT DEFAULT 'Montserrat',
  fuente_secundaria TEXT DEFAULT 'Open Sans',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar configuración por defecto si no existe
INSERT INTO public.config_credenciales (id)
VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- 2. Tabla de autorizaciones de credenciales por alumno
CREATE TABLE IF NOT EXISTS public.credenciales_autorizadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  autorizado BOOLEAN DEFAULT false,
  autorizado_por UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(alumno_id)
);

-- 3. Políticas RLS

-- Habilitar RLS
ALTER TABLE public.config_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credenciales_autorizadas ENABLE ROW LEVEL SECURITY;

-- config_credenciales: Solo superuser/admin pueden leer y escribir
CREATE POLICY "Admins can read config_credenciales"
  ON public.config_credenciales FOR SELECT
  USING (true);

CREATE POLICY "Admins can update config_credenciales"
  ON public.config_credenciales FOR UPDATE
  USING (true);

CREATE POLICY "Admins can insert config_credenciales"
  ON public.config_credenciales FOR INSERT
  WITH CHECK (true);

-- credenciales_autorizadas: Admins full access, alumnos read own
CREATE POLICY "Admins can manage credenciales_autorizadas"
  ON public.credenciales_autorizadas FOR ALL
  USING (true);
