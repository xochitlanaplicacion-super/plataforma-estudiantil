-- 1. Vincular Alumnos a Grupos
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- 2. Crear tabla de Diapositivas para Presentaciones Multimedia
CREATE TABLE IF NOT EXISTS slides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tema_id UUID REFERENCES temas(id) ON DELETE CASCADE,
  titulo TEXT,
  contenido TEXT,
  imagen_url TEXT,
  orden INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS en Slides
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;

-- Políticas de Slides
DROP POLICY IF EXISTS "Permitir lectura de slides a todos" ON slides;
CREATE POLICY "Permitir lectura de slides a todos" ON slides FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir gestión de slides a usuarios autenticados" ON slides;
CREATE POLICY "Permitir gestión de slides a usuarios autenticados" ON slides FOR ALL USING (auth.role() = 'authenticated');

-- Comentarios de documentación
COMMENT ON COLUMN slides.imagen_url IS 'URL de imagen de internet para la diapositiva';
COMMENT ON COLUMN slides.contenido IS 'Texto largo o explicación de la diapositiva';
