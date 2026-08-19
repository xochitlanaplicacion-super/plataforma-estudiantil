import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ClientStudentPlayer from './ClientStudentPlayer';

export default async function RealizarEjercicioPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Obtener el ejercicio
  const { data: ejercicio, error } = await supabase
    .from('ejercicios')
    .select('*')
    .eq('id', resolvedParams.id)
    .single();

  if (error || !ejercicio) {
    redirect('/dashboard/alumno/materias');
  }

  // Si es actividad descriptiva, obtener la entrega existente del alumno
  let entregaExistente = null;
  if (ejercicio.tipo === 'actividad_descriptiva') {
    const { data: entrega } = await supabase
      .from('resultados_ejercicios')
      .select('archivo_url, archivo_nombre, archivo_path, primer_envio_en, caduca_el, calificacion_manual')
      .eq('alumno_id', user.id)
      .eq('ejercicio_id', resolvedParams.id)
      .maybeSingle();
    entregaExistente = entrega;
  }

  return <ClientStudentPlayer exercise={ejercicio} entregaExistente={entregaExistente} />;
}
