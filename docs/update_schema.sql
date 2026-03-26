
-- SCRIPT DE ACTUALIZACIÓN: SOPORTE PARA DIAPOSITIVAS Y AUDITORÍA DE CONTENIDO
-- Corre este código en el SQL Editor de Supabase

-- 1. Vincular Alumnos a Grupos (Si no se ha hecho antes)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES grupos(id);

-- 2. Tabla de Diapositivas (Presentaciones)
CREATE TABLE IF NOT EXISTS slides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tema_id UUID REFERENCES temas(id) ON DELETE CASCADE,
  titulo TEXT,
  contenido TEXT,
  imagen_url TEXT,
  orden INTEGER DEFAULT 1,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Auditoría de creación en todas las tablas pedagógicas
-- (Necesario para el reemplazo de profesores y protección de contenidos)
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE temas ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE ejercicios ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- 4. Políticas de Seguridad (RLS)
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir lectura de slides a todos') THEN
        CREATE POLICY "Permitir lectura de slides a todos" ON slides FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir gestión de slides a usuarios autenticados') THEN
        CREATE POLICY "Permitir gestión de slides a usuarios autenticados" ON slides FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;
