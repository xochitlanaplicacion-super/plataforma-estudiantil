-- 1. Agregar columna foto_perfil a la tabla profiles (sin afectar datos existentes)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS foto_perfil TEXT;

-- 2. Crear el bucket de almacenamiento para los avatares
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Configurar Políticas de Seguridad (RLS) para el bucket 'avatars'

-- Permitir a cualquier usuario (incluso no autenticados) ver las imágenes de perfil
CREATE POLICY "Avatar images are publicly accessible."
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Permitir a los usuarios autenticados subir su propia imagen
CREATE POLICY "Users can upload their own avatar."
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid() = owner
  );

-- Permitir a los usuarios autenticados actualizar su propia imagen
CREATE POLICY "Users can update their own avatar."
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid() = owner
  );

-- Permitir a los usuarios autenticados borrar su propia imagen
CREATE POLICY "Users can delete their own avatar."
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid() = owner
  );
