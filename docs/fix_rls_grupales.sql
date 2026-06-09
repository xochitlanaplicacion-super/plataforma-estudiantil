-- ============================================================
-- FIX: Política RLS para que alumnos reciban mensajes grupales
-- ============================================================
-- PROBLEMA: La política actual usa "inscripciones_alumno" que no se usa 
-- en el sistema. Los alumnos tienen su grupo en "profiles.grupo_id".
-- Esto causa que Supabase Realtime NO envíe los eventos de CHAT_GRUPAL
-- al cliente del alumno, por lo tanto NUNCA recibe notificaciones.
-- ============================================================

-- 1. Eliminar la política antigua que usa inscripciones_alumno
DROP POLICY IF EXISTS "Alumnos ven grupales/avisos de sus grupos" ON public.mensajes_clases;

-- 2. Crear nueva política que use profiles.grupo_id (como funciona el resto del sistema)
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
