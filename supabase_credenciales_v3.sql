-- ============================================================
-- Migration: Color Panel Izquierdo, Escala Logo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE public.config_credenciales
ADD COLUMN IF NOT EXISTS color_panel_izquierdo TEXT DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS logo_escala NUMERIC DEFAULT 100;
