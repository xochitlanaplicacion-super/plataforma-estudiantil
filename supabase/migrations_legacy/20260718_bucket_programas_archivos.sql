-- ============================================================
-- Bucket: programas_archivos
-- Almacena PDFs, JPGs y PNGs de la oferta educativa
-- ============================================================

-- 1. Crear el bucket público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'programas-archivos',
  'programas-archivos',
  true,
  10485760,  -- 10 MB en bytes
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Política de lectura pública (cualquier visitante puede ver los archivos)
CREATE POLICY "Lectura pública programas archivos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'programas-archivos');

-- 3. Política de subida solo para admin/superuser (autenticados)
CREATE POLICY "Upload programas archivos admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'programas-archivos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'superuser')
  )
);

-- 4. Política de actualización (upsert) solo para admin/superuser
CREATE POLICY "Update programas archivos admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'programas-archivos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'superuser')
  )
);

-- 5. Política de borrado solo para admin/superuser
CREATE POLICY "Delete programas archivos admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'programas-archivos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND rol IN ('admin', 'superuser')
  )
);
