-- Ejecutar en el Editor SQL de Supabase

CREATE TABLE IF NOT EXISTS public.resultados_ejercicios (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    alumno_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ejercicio_id uuid NOT NULL REFERENCES public.ejercicios(id) ON DELETE CASCADE,
    calificacion numeric(5,2) DEFAULT 0,
    aciertos integer DEFAULT 0,
    total_preguntas integer DEFAULT 0,
    intentos integer DEFAULT 0,
    suma_calificaciones numeric(10,2) DEFAULT 0,
    bloqueado boolean DEFAULT false,
    estado text DEFAULT 'completado',
    fecha_completado timestamp with time zone DEFAULT now(),
    
    -- Queremos asegurar que un alumno solo tenga un registro principal por ejercicio (o actualizarlo)
    CONSTRAINT unique_alumno_ejercicio UNIQUE (alumno_id, ejercicio_id)
);

-- Habilitar RLS
ALTER TABLE public.resultados_ejercicios ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Alumnos pueden ver sus propios resultados"
    ON public.resultados_ejercicios FOR SELECT
    USING (auth.uid() = alumno_id);

CREATE POLICY "Alumnos pueden insertar/actualizar sus propios resultados"
    ON public.resultados_ejercicios FOR ALL
    USING (auth.uid() = alumno_id)
    WITH CHECK (auth.uid() = alumno_id);

CREATE POLICY "Profesores y admins pueden ver todos los resultados"
    ON public.resultados_ejercicios FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('profesor', 'admin', 'superadmin')
        )
    );
