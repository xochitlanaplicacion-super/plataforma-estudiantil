-- Migration: 20260718_video_progreso_alumno
-- Descripción: Tabla para almacenar el progreso de reproducción de videos por alumno.

CREATE TABLE IF NOT EXISTS public.video_progreso_alumno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumno_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tema_id UUID NOT NULL REFERENCES public.temas(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    progreso_segundos NUMERIC DEFAULT 0,
    duracion_total NUMERIC DEFAULT 0,
    completado BOOLEAN DEFAULT false,
    ultimo_visto TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (alumno_id, tema_id, video_url)
);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_video_progreso_alumno_updated_at ON public.video_progreso_alumno;
CREATE TRIGGER set_video_progreso_alumno_updated_at
BEFORE UPDATE ON public.video_progreso_alumno
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Habilitar RLS
ALTER TABLE public.video_progreso_alumno ENABLE ROW LEVEL SECURITY;

-- Política: Los alumnos solo pueden ver su propio progreso
CREATE POLICY "Alumnos ven su propio progreso de video" 
ON public.video_progreso_alumno 
FOR SELECT 
USING (auth.uid() = alumno_id);

-- Política: Los alumnos pueden insertar y actualizar su propio progreso
CREATE POLICY "Alumnos pueden actualizar su propio progreso"
ON public.video_progreso_alumno
FOR ALL
USING (auth.uid() = alumno_id)
WITH CHECK (auth.uid() = alumno_id);
