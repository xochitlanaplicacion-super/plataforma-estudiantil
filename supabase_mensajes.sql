-- Tabla principal de mensajes
CREATE TABLE IF NOT EXISTS public.mensajes_internos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remitente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Para mensajes individuales
    destinatario_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Para mensajes globales (NIVEL, CARRERA, GRUPO, o TODOS)
    -- Valores posibles: 'INDIVIDUAL', 'NIVEL', 'CARRERA', 'GRUPO', 'GLOBAL'
    tipo_destino TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    
    -- ID del nivel, carrera o grupo (Nulo si es GLOBAL o INDIVIDUAL)
    destino_id UUID,
    
    contenido TEXT NOT NULL,
    
    -- Para mensajes individuales: si ya lo vio el destinatario
    leido BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.mensajes_internos ENABLE ROW LEVEL SECURITY;

-- Tabla para rastrear qué alumnos han visto los mensajes globales
CREATE TABLE IF NOT EXISTS public.mensajes_vistos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mensaje_id UUID NOT NULL REFERENCES public.mensajes_internos(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    visto_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(mensaje_id, usuario_id) -- Un usuario solo puede marcar un mensaje como visto una vez
);

-- Habilitar RLS
ALTER TABLE public.mensajes_vistos ENABLE ROW LEVEL SECURITY;

-- Políticas para mensajes_internos
CREATE POLICY "Superusuarios y Admins pueden ver y crear todo" 
ON public.mensajes_internos 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.rol IN ('superusuario', 'administrador')
  )
);

CREATE POLICY "Usuarios pueden ver mensajes dirigidos a ellos"
ON public.mensajes_internos
FOR SELECT
USING (
  destinatario_id = auth.uid() OR
  remitente_id = auth.uid() OR
  (tipo_destino = 'GLOBAL') OR
  (tipo_destino = 'NIVEL' AND destino_id IN (
    SELECT c.nivel_id FROM public.carreras c
    INNER JOIN public.profiles p ON p.carrera_id = c.id
    WHERE p.id = auth.uid()
  )) OR
  (tipo_destino = 'CARRERA' AND destino_id IN (SELECT carrera_id FROM public.profiles WHERE id = auth.uid())) OR
  (tipo_destino = 'GRUPO' AND destino_id IN (SELECT grupo_id FROM public.profiles WHERE id = auth.uid()))
);

CREATE POLICY "Usuarios pueden enviar mensajes a Admins"
ON public.mensajes_internos
FOR INSERT
WITH CHECK (
  remitente_id = auth.uid() AND
  tipo_destino = 'INDIVIDUAL' AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = destinatario_id 
    AND profiles.rol IN ('superusuario', 'administrador')
  )
);

-- Políticas para mensajes_vistos
CREATE POLICY "Admins pueden ver todo en mensajes_vistos"
ON public.mensajes_vistos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.rol IN ('superusuario', 'administrador')
  )
);

CREATE POLICY "Usuarios pueden ver y marcar sus propios vistos"
ON public.mensajes_vistos
FOR ALL
USING (usuario_id = auth.uid());
