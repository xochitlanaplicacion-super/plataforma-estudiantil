-- Tabla principal de mensajes para clases (Profesores <-> Alumnos)
CREATE TABLE IF NOT EXISTS public.mensajes_clases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remitente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Para mensajes directos
    destinatario_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Contexto académico (Obligatorio para categorizar, excepto en avisos generales de perfil, pero aquí todo se ancla a una materia)
    materia_id UUID REFERENCES public.materias(id) ON DELETE CASCADE,
    
    -- El grupo al que va dirigido (Para avisos y chats grupales)
    grupo_id UUID REFERENCES public.grupos(id) ON DELETE CASCADE,
    
    -- Valores posibles: 'INDIVIDUAL', 'AVISO', 'CHAT_GRUPAL'
    tipo_mensaje TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    
    contenido TEXT NOT NULL,
    
    -- Para mensajes individuales: si ya lo vio el destinatario
    leido BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.mensajes_clases ENABLE ROW LEVEL SECURITY;

-- Tabla para rastrear qué alumnos/profesores han visto los avisos y chats grupales
CREATE TABLE IF NOT EXISTS public.mensajes_clases_vistos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mensaje_id UUID NOT NULL REFERENCES public.mensajes_clases(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    visto_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(mensaje_id, usuario_id) -- Un usuario solo puede marcar un mensaje como visto una vez
);

-- Habilitar RLS
ALTER TABLE public.mensajes_clases_vistos ENABLE ROW LEVEL SECURITY;

-- ==== POLÍTICAS RLS PARA mensajes_clases ====

-- Admins pueden ver y gestionar todo
CREATE POLICY "Admins pueden gestionar mensajes_clases" 
ON public.mensajes_clases 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.rol IN ('superusuario', 'administrador')
  )
);

-- Usuarios pueden ver sus mensajes individuales
CREATE POLICY "Usuarios ven sus mensajes individuales"
ON public.mensajes_clases
FOR SELECT
USING (
  tipo_mensaje = 'INDIVIDUAL' AND 
  (remitente_id = auth.uid() OR destinatario_id = auth.uid())
);

-- Usuarios pueden ver avisos y chats grupales si pertenecen al grupo.
-- Usa profiles.grupo_id (para alumnos) y asignaciones_profesor (para profesores).
CREATE POLICY "Alumnos ven grupales/avisos de sus grupos"
ON public.mensajes_clases
FOR SELECT
USING (
  tipo_mensaje IN ('AVISO', 'CHAT_GRUPAL') AND (
    -- Alumno: su grupo_id en profiles coincide con el grupo del mensaje
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.grupo_id = mensajes_clases.grupo_id
    )
    OR
    -- Profesor: tiene asignación activa al grupo+materia del mensaje
    EXISTS (
      SELECT 1 FROM asignaciones_profesor 
      WHERE profesor_id = auth.uid() 
      AND asignaciones_profesor.grupo_id = mensajes_clases.grupo_id 
      AND asignaciones_profesor.materia_id = mensajes_clases.materia_id 
      AND asignaciones_profesor.activo = true
    )
    OR
    -- Remitente: siempre puede ver sus propios mensajes
    remitente_id = auth.uid()
  )
);

-- Inserción de mensajes
CREATE POLICY "Usuarios pueden insertar mensajes"
ON public.mensajes_clases
FOR INSERT
WITH CHECK (
  remitente_id = auth.uid()
);

-- Actualización (sólo para marcar como leído o eliminar/ocultar)
CREATE POLICY "Usuarios pueden actualizar mensajes individuales (marcar leido)"
ON public.mensajes_clases
FOR UPDATE
USING (
  destinatario_id = auth.uid() OR remitente_id = auth.uid()
);

-- ==== POLÍTICAS RLS PARA mensajes_clases_vistos ====

CREATE POLICY "Admins ven todo en mensajes_clases_vistos"
ON public.mensajes_clases_vistos
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.rol IN ('superusuario', 'administrador')
  )
);

CREATE POLICY "Usuarios ven sus propios vistos"
ON public.mensajes_clases_vistos
FOR ALL
USING (usuario_id = auth.uid());
