
-- EJECUTAR ESTO EN EL SQL EDITOR DE SUPABASE --

-- 1. Agregar columna grupo_id a profiles si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'grupo_id') THEN
        ALTER TABLE profiles ADD COLUMN grupo_id UUID;
    END IF;
END $$;

-- 2. Crear la relación de clave foránea con la tabla grupos
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'profiles_grupo_id_fkey') THEN
        ALTER TABLE profiles 
        ADD CONSTRAINT profiles_grupo_id_fkey 
        FOREIGN KEY (grupo_id) 
        REFERENCES grupos(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Crear índice para mejorar el rendimiento de consultas por grupo
CREATE INDEX IF NOT EXISTS idx_profiles_grupo_id ON profiles(grupo_id);

-- 4. Notificar a PostgREST que el esquema ha cambiado (opcional pero recomendado)
NOTIFY pgrst, 'reload schema';
