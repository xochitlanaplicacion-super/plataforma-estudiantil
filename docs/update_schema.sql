
-- 1. Agregar la columna grupo_id a la tabla profiles
-- Esta columna permitirá vincular a cada alumno con un grupo específico.
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES public.grupos(id) ON DELETE SET NULL;

-- 2. Comentario informativo para el administrador
COMMENT ON COLUMN public.profiles.grupo_id IS 'ID del grupo académico al que pertenece el alumno (Modulo 3: Inscripciones)';

-- 3. Nota: Si utilizas RLS (Row Level Security), asegúrate de que el rol autenticado 
-- tenga permisos de UPDATE en la tabla profiles para esta columna.
