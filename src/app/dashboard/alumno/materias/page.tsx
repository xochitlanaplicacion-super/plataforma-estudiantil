import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAlumnoDashboardData } from '@/lib/actions/alumno';
import { redirect } from 'next/navigation';
import { 
  BookOpen, 
  Calculator,
  Languages,
  Atom,
  Building2,
  Activity,
  GraduationCap,
  Clock4,
  MapPin,
  TrendingUp,
  LineChart,
  FileCheck
} from 'lucide-react';

const getSubjectIcon = (nombre: string) => {
  const norm = nombre.toLowerCase();
  if (norm.includes('mate') || norm.includes('calc')) return <Calculator className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
  if (norm.includes('español') || norm.includes('lit')) return <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-tertiary-container" />;
  if (norm.includes('física') || norm.includes('cien')) return <Atom className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
  if (norm.includes('historia')) return <Building2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />;
  if (norm.includes('quím')) return <Activity className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
  if (norm.includes('inglés')) return <Languages className="w-5 h-5 md:w-6 md:h-6 text-tertiary-container" />;
  return <GraduationCap className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
};

const getSubjectColorClass = (index: number) => {
  const colors = [
    'border-primary bg-primary/5',
    'border-tertiary-container bg-[#cea62c]/10',
    'border-green-500 bg-green-500/10',
  ];
  return colors[index % colors.length];
};

export default async function MisMateriasPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/');

  const data = await getAlumnoDashboardData(user.id) as any;
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
        
        {/* Filtros simples (UI Decorativa por ahora según diseño) */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3 bg-muted/40 p-1 md:p-1.5 rounded-full border border-border w-full md:w-auto">
          <button className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-xs md:text-sm font-bold shadow-sm flex-1 md:flex-none">Todas</button>
          <button className="px-4 py-1.5 text-muted-foreground hover:text-foreground rounded-full text-xs md:text-sm font-medium transition-colors flex-1 md:flex-none">En Curso</button>
          <button className="px-4 py-1.5 text-muted-foreground hover:text-foreground rounded-full text-xs md:text-sm font-medium transition-colors hidden sm:block">Examen Próximo</button>
          <button className="px-4 py-1.5 text-muted-foreground hover:text-foreground rounded-full text-xs md:text-sm font-medium transition-colors hidden sm:block">Aprobadas</button>
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
          {materias.map((materia: any, idx: number) => {
            const estados = [
              { badge: 'EN CURSO', bg: 'bg-blue-100', text: 'text-blue-700' },
              { badge: 'EXAMEN PRÓXIMO', bg: 'bg-[#F3D57F]', text: 'text-[#755B00]' },
              { badge: 'APROBADA', bg: 'bg-green-100', text: 'text-green-700' }
            ];
            const estado = estados[idx % estados.length];
            const colorClass = getSubjectColorClass(idx);
            
            // Stats ficticios para el diseño (ya que no existe progreso o calificaciones reales guardadas conectadas aun)
            const promedioRandom = (Math.random() * (10 - 7) + 7).toFixed(1);
            const progresoRandom = Math.floor(Math.random() * 100);

            return (
              <div key={materia.id} className="bg-card/40 border-l-4 border-border/10 rounded-2xl md:rounded-3xl shadow-sm border outline outline-transparent hover:outline-primary/10 transition-all cursor-pointer group flex flex-col overflow-hidden" style={{ borderLeftColor: idx % 3 === 0 ? '#4d021a' : idx % 3 === 1 ? '#cea62c' : '#16a34a' }}>
                
                {/* Contenido principal de la tarjeta horizontal */}
                <div className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10">
                  
                  {/* Izquierda: Icono + Título + Info Básica */}
                  <div className="flex items-start gap-4 flex-1 w-full md:w-auto">
                    <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl transition-colors ${colorClass.split(' ')[1]} group-hover:bg-transparent shrink-0 border border-black/5`}>
                      {getSubjectIcon(materia.nombre)}
                    </div>
                    <div className="w-full">
                       <h3 className="text-xl md:text-2xl font-bold font-headline text-foreground tracking-tight mb-1 truncate max-w-[200px] xs:max-w-xs sm:max-w-sm" title={materia.nombre}>
                         {materia.nombre}
                       </h3>
                       <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm text-muted-foreground font-medium">
                          <span className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> {materia.profesor}</span>
                          <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-border"></span>
                          <span className="flex items-center gap-1.5"><Clock4 className="w-3.5 h-3.5" /> Lunes, Miér, Vier</span>
                          <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-border"></span>
                          <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Salón {100 + idx}</span>
                       </div>
                    </div>
                  </div>

                  {/* Derecha: Promedio y Acciones */}
                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto shrink-0 border-t md:border-t-0 border-border pt-4 md:pt-0">
                    <div className="text-left md:text-right">
                       <span className={`inline-block px-3 py-1 ${estado.bg} ${estado.text} rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-1`}>
                         {estado.badge}
                       </span>
                       <div className="flex items-center md:justify-end gap-2">
                          <span className="text-3xl md:text-4xl font-black font-headline text-foreground">{promedioRandom}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Promedio<br/>Gral.</span>
                       </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button className="px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-xs md:text-sm font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-primary whitespace-nowrap">
                        Ver Ejercicios
                      </button>
                    </div>
                  </div>
                </div>

                {/* Fila inferiror interactiva: Progreso y Estadísticas extra */}
                <div className="bg-muted/30 px-6 py-4 md:px-8 md:py-5 border-t border-border/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-8">
                   <div className="flex-1 w-full max-w-xl flex items-center gap-4">
                     <span className="text-xs font-bold text-foreground w-10 text-right">{progresoRandom}%</span>
                     <div className="flex-1 h-2 bg-border/50 rounded-full overflow-hidden">
                       <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-out" style={{ width: `${progresoRandom}%` }}></div>
                     </div>
                     <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden sm:inline-block">Completado</span>
                   </div>

                   <div className="flex flex-wrap items-center gap-4 md:gap-8 w-full lg:w-auto">
                     <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <FileCheck className="w-4 h-4 opacity-70" />
                        <span>3/5 Tareas Entregadas</span>
                     </div>
                     <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <TrendingUp className="w-4 h-4 opacity-70" />
                        <span>Próxima Evaluación: <strong className="text-foreground">20 de Mayo</strong></span>
                     </div>
                   </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
