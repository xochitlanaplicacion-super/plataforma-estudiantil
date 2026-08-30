import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAlumnoDashboardData } from '@/lib/actions/alumno';
import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { SubjectCard } from '../components/SubjectCard';
import { loadMyAcademicResultsAction } from '@/lib/actions/calificaciones';

export default async function MisMateriasPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/');

  const [data, academicResults] = await Promise.all([
    getAlumnoDashboardData(user.id),
    loadMyAcademicResultsAction(),
  ]) as [any, Awaited<ReturnType<typeof loadMyAcademicResultsAction>>];
  const profile = data?.profile;
  const materias = data?.materiasAsignadas || [];

  const semestre = profile?.grupos?.grados?.nombre || 'Semestre Actual';
  const grupoNombre = profile?.grupos?.nombre || 'Grupo X';
  const turno = profile?.grupos?.turno || 'Turno Indefinido';

  return (
    <div className="space-y-8 pb-16 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-0">

      {/* HEADER PAGE */}
      <header className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pb-6 border-b border-border/50">
        <div>
          <h1 className="text-3xl md:text-4xl font-black font-headline text-primary tracking-tight">
            Mis Materias
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2 font-medium">
            {semestre} - Grupo {grupoNombre} - Turno <span className="capitalize">{turno}</span>
          </p>
        </div>


      </header>

      {/* LISTA EXPANDIDA DE MATERIAS */}
      {materias.length === 0 ? (
        <div className="bg-muted/30 border-2 border-dashed rounded-2xl p-16 text-center text-muted-foreground max-w-2xl mx-auto mt-12">
          <BookOpen className="w-16 h-16 mx-auto mb-6 opacity-20" />
          <h5 className="font-bold text-xl text-foreground mb-2">Aún no tienes materias asignadas</h5>
          <p className="text-sm">Por favor, acude con control escolar para actualizar tu matrícula del ciclo actual.</p>
        </div>
      ) : (
        <div className="space-y-6 md:space-y-8">
          {materias.map((materia: any) => {
            // Filtrar ejercicios que pertenecen a esta materia
            const ejerciciosDeMateria = (data.todosLosEjercicios || []).filter(
              (ex: any) => ex.materia_id === materia.id
            );

            const realizados = ejerciciosDeMateria.filter((ex: any) => ex.completado);
            const resultadosMateria = academicResults.ok
              ? academicResults.data.items.filter((item) => item.subjectId === materia.id)
              : [];
            const resultadoMateria = resultadosMateria.find((item) => item.periodState === 'activo')
              ?? resultadosMateria.find((item) => item.publicationState === 'final')
              ?? resultadosMateria[0];
            const promedioMateria = resultadoMateria?.displayGrade ?? 'N/A';
            const progresoMateria = resultadoMateria?.progressPercent ?? 0;

            return (
              <SubjectCard
                key={materia.id}
                materia={materia}
                exercises={ejerciciosDeMateria}
                unidades={data.unidades || []}
                promedio={promedioMateria}
                progreso={progresoMateria}
                proximaEvaluacion={data.fechasEvaluacion?.[materia.id] || undefined}
              />
            );
          })}
        </div>
      )}

    </div>
  );
}
