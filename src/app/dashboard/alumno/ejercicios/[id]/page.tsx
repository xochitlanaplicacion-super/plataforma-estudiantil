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

  // Verificar que el alumno está logueado y obtener el ejercicio
  const { data: ejercicio, error } = await supabase
    .from('ejercicios')
    .select('*')
    .eq('id', resolvedParams.id)
    .single();

  if (error || !ejercicio) {
    redirect('/dashboard/alumno/materias');
  }

  return <ClientStudentPlayer exercise={ejercicio} />;
}
