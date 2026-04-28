-- Tabla para almacenar los mensajes genéricos preconfigurados por el admin
CREATE TABLE IF NOT EXISTS public.mensajes_acreditacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo TEXT NOT NULL UNIQUE, -- 'APROBADO' o 'NO_APROBADO'
    contenido TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.mensajes_acreditacion ENABLE ROW LEVEL SECURITY;

-- Políticas para mensajes_acreditacion
CREATE POLICY "Admins pueden ver y editar mensajes de acreditacion" 
ON public.mensajes_acreditacion FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.rol IN ('superuser', 'admin', 'superusuario', 'administrador')
  )
);

CREATE POLICY "Cualquier usuario logueado puede ver los mensajes de acreditacion"
ON public.mensajes_acreditacion FOR SELECT
USING (auth.uid() IS NOT NULL);


-- Tabla para almacenar los datos extraídos por el OCR de los alumnos
CREATE TABLE IF NOT EXISTS public.acreditaciones_alumnos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    curp TEXT NOT NULL UNIQUE, -- Clave única para enlazar con el alumno
    alumno_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Se puede enlazar si ya existe
    
    estatus TEXT NOT NULL, -- 'Aprobado' o 'No Aprobado' (basado en la zona donde se subió)
    
    fecha_expedicion TEXT,
    nombres TEXT,
    primer_apellido TEXT,
    segundo_apellido TEXT,
    nivel TEXT,
    perfil TEXT,
    folio_identificacion TEXT,
    
    -- JSONB para guardar múltiples filas dinámicas: [{ area: '...', fecha: '...', puntaje: '...' }]
    etapas_evaluacion JSONB DEFAULT '[]'::jsonb,
    
    puntaje_total NUMERIC,
    calificacion_numerica NUMERIC,
    resultado_final TEXT,
    
    -- Para notificaciones
    visto_por_alumno BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.acreditaciones_alumnos ENABLE ROW LEVEL SECURITY;

-- Políticas para acreditaciones_alumnos
CREATE POLICY "Admins pueden ver y gestionar todas las acreditaciones" 
ON public.acreditaciones_alumnos FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.rol IN ('superuser', 'admin', 'superusuario', 'administrador')
  )
);

CREATE POLICY "Alumnos pueden ver su propia acreditacion vinculada a su ID o CURP"
ON public.acreditaciones_alumnos FOR SELECT
USING (
  alumno_id = auth.uid() OR
  curp = (SELECT curp FROM public.profiles WHERE id = auth.uid())
);

-- Permitir a los alumnos marcar como vista su propia acreditacion (Update)
CREATE POLICY "Alumnos pueden actualizar estado de visto"
ON public.acreditaciones_alumnos FOR UPDATE
USING (
  alumno_id = auth.uid() OR
  curp = (SELECT curp FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
  alumno_id = auth.uid() OR
  curp = (SELECT curp FROM public.profiles WHERE id = auth.uid())
);

-- Agregar tabla a la publicacion realtime para que la UI se actualice
ALTER PUBLICATION supabase_realtime ADD TABLE public.acreditaciones_alumnos;
