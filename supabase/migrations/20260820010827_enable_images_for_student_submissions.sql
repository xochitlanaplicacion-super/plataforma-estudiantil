-- Permitir fotografías en entregas descriptivas y un tamaño adecuado para cámaras móviles.
-- El bucket sigue siendo privado y conserva las políticas multitenant existentes.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]
where id = 'entregas-alumnos';

-- Las URLs firmadas son efímeras y ya no deben persistirse. Se generan bajo demanda.
update public.resultados_ejercicios
set archivo_url = null
where archivo_path is not null and archivo_url is not null;
