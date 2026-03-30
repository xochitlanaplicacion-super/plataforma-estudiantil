import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAlumnoDashboardData } from '@/lib/actions/alumno';
import { 
  BookOpen, 
  CalendarDays, 
  Users, 
  Sun, 
  GraduationCap,
  Calculator,
  Languages,
  Atom,
  Building2,
  Activity,
  ArrowRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  MapPin,
  Clock4
} from 'lucide-react';
import { redirect } from 'next/navigation';
import Link from 'next/link';

// Helper for dynamic subject icons
const getSubjectIcon = (nombre: string) => {
  const norm = nombre.toLowerCase();
  if (norm.includes('mate') || norm.includes('calc')) return <Calculator className="w-5 h-5 text-primary" />;
  if (norm.includes('español') || norm.includes('lit')) return <BookOpen className="w-5 h-5 text-tertiary-container" />;
  if (norm.includes('física') || norm.includes('cien')) return <Atom className="w-5 h-5 text-primary" />;
  if (norm.includes('historia')) return <Building2 className="w-5 h-5 text-green-600" />;
  if (norm.includes('quím')) return <Activity className="w-5 h-5 text-primary" />;
  if (norm.includes('inglés')) return <Languages className="w-5 h-5 text-tertiary-container" />;
  return <GraduationCap className="w-5 h-5 text-primary" />;
};

const getSubjectColorClass = (index: number) => {
  const colors = [
    'border-primary bg-primary/5',
    'border-tertiary-container bg-tertiary-container/5',
    'border-green-500 bg-green-500/5',
  ];
  return colors[index % colors.length];
};

export default async function AlumnoDashboard() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/');

  const data = await getAlumnoDashboardData(user.id) as any;
  const profile = data?.profile;
  const materias = data?.materiasAsignadas || [];
  
  // Data fallbacks
  const isLoading = !profile;
  const nombreCompleto = profile ? `${profile.nombre} ${profile.apellidos}` : 'Cargando...';
  const carrera = profile?.carreras?.nombre || 'Sin Carrera Asignada';
  const semestre = profile?.grupos?.grados?.nombre || 'Sin Grado';
  const grupoNombre = profile?.grupos?.nombre || 'N/A';
  const turno = profile?.grupos?.turno || 'N/A';

  // KPIs
  const totalMaterias = materias.length;
  const promedio = 9.4; // Ficticio por ahora, pendiente de calificaciones reales
  const creditos = totalMaterias * 10;
  const totalTareas = 4; // Ficticio por ahora

  return (
    <div className="space-y-12 pb-16 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      
      {/* HEADER TOP (Mobile/Tablet View adjustment since Sidebar handles desktop) */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4 md:py-0">
        <div>
          <h2 className="font-headline text-2xl md:text-3xl font-bold text-primary tracking-tight">
            ¡Bienvenido(a) a tu espacio!
          </h2>
          <p className="text-muted-foreground mt-1">
            Plataforma del Instituto Educativo Emiliano Zapata
          </p>
        </div>
      </header>

      {/* BANNER PRINCIPAL */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#6B1A2E] to-[#370D18] rounded-2xl md:rounded-3xl p-6 md:p-12 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="space-y-4 md:space-y-5">
            <span className="inline-block px-3 py-1 bg-[#cea62c] text-[#4f3d00] rounded-full text-xs font-bold uppercase tracking-widest shadow-sm">
              Estado Académico
            </span>
            <h3 className="text-3xl md:text-4xl lg:text-5xl font-black font-headline leading-tight tracking-tight">
              {nombreCompleto}
            </h3>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-white/85 font-medium text-sm md:text-base">
              <p className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 md:w-5 md:h-5 opacity-80" /> 
                {carrera}
              </p>
              <p className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 md:w-5 md:h-5 opacity-80" /> 
                {semestre}
              </p>
              <p className="flex items-center gap-2">
                <Users className="w-4 h-4 md:w-5 md:h-5 opacity-80" /> 
                Grupo: {grupoNombre}
              </p>
              <p className="flex items-center gap-2">
                <Sun className="w-4 h-4 md:w-5 md:h-5 opacity-80" /> 
                Turno: <span className="capitalize">{turno}</span>
              </p>
            </div>
          </div>
          
          {/* KPI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-4 md:gap-6 w-full lg:w-auto mt-6 lg:mt-0">
            <div className="text-center bg-white/5 rounded-2xl p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors">
              <p className="text-4xl md:text-5xl font-black text-[#CEA62C] font-headline tracking-tighter">{totalMaterias}</p>
              <p className="text-[10px] md:text-xs font-bold uppercase text-white/60 tracking-widest mt-1">Materias</p>
            </div>
            <div className="text-center bg-white/5 rounded-2xl p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors">
              <p className="text-4xl md:text-5xl font-black text-[#CEA62C] font-headline tracking-tighter">{promedio}</p>
              <p className="text-[10px] md:text-xs font-bold uppercase text-white/60 tracking-widest mt-1">Promedio</p>
            </div>
            <div className="text-center bg-white/5 rounded-2xl p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors hidden md:block">
              <p className="text-4xl md:text-5xl font-black text-[#CEA62C] font-headline tracking-tighter">{totalTareas}</p>
              <p className="text-[10px] md:text-xs font-bold uppercase text-white/60 tracking-widest mt-1">Tareas</p>
            </div>
            <div className="text-center bg-white/5 rounded-2xl p-4 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors hidden md:block">
              <p className="text-4xl md:text-5xl font-black text-[#CEA62C] font-headline tracking-tighter">{creditos}</p>
              <p className="text-[10px] md:text-xs font-bold uppercase text-white/60 tracking-widest mt-1">Créditos</p>
            </div>
          </div>
        </div>
        {/* Subtle Background Pattern */}
        <div className="absolute top-0 right-0 w-full md:w-2/3 h-full opacity-5 pointer-events-none mix-blend-overlay">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full fill-current">
            <path d="M0,0 L100,0 L100,100 L0,100 Z" strokeWidth="2" strokeDasharray="5,5" fill="none" />
            <circle cx="80" cy="20" r="15" />
            <circle cx="90" cy="80" r="25" />
            <circle cx="20" cy="90" r="10" />
          </svg>
        </div>
      </section>

      {/* MIS MATERIAS GRID */}
      <section className="space-y-6 md:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h4 className="text-xl md:text-2xl font-bold font-headline text-primary tracking-tight">Mis Materias</h4>
            <p className="text-sm md:text-base text-muted-foreground font-medium">Ciclo Escolar en curso</p>
          </div>
          <Link href="/dashboard/alumno/horario" className="text-primary font-bold hover:underline flex items-center gap-1 text-sm md:text-base group">
            Ver horario completo <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {materias.length === 0 ? (
          <div className="bg-muted/30 border-2 border-dashed rounded-2xl p-12 text-center text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h5 className="font-bold text-lg text-foreground">Aún no tienes materias asignadas</h5>
            <p className="text-sm">Contacta a servicios escolares para tu inscripción al semestre actual.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {materias.map((materia: any, idx: number) => {
              // Valores simulados para estado de materias
              const estados = [
                { badge: 'EN CURSO', bg: 'bg-blue-100', text: 'text-blue-700' },
                { badge: 'EXAMEN', bg: 'bg-[#F3D57F]', text: 'text-[#755B00]' },
                { badge: 'APROBADA', bg: 'bg-green-100', text: 'text-green-700' }
              ];
              const estado = estados[idx % estados.length];
              const colorClass = getSubjectColorClass(idx);

              return (
                <div key={materia.id} className={`bg-card/40 p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-border outline outline-transparent hover:outline-primary/10 border-l-4 ${colorClass.split(' ')[0]} transition-all hover:-translate-y-1 hover:shadow-md cursor-pointer group`}>
                  
                  <div className="flex justify-between items-start mb-6">
                    <span className={`px-3 py-1 ${estado.bg} ${estado.text} rounded-full text-[10px] font-bold uppercase tracking-wider`}>
                      {estado.badge}
                    </span>
                    <div className={`p-2 rounded-xl transition-colors ${colorClass.split(' ')[1]} group-hover:bg-transparent`}>
                      {getSubjectIcon(materia.nombre)}
                    </div>
                  </div>
                  
                  <h5 className="text-lg md:text-xl font-bold text-foreground mb-1 tracking-tight truncate" title={materia.nombre}>
                    {materia.nombre}
                  </h5>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium mb-6">
                    {materia.profesor}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl border border-muted">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Clock4 className="w-3.5 h-3.5 opacity-70" /> Horario Fijo
                    </div>
                    <div className="flex items-center gap-1.5 font-medium">
                      <MapPin className="w-3.5 h-3.5 opacity-70" /> Campus IEEZ
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* TAREAS PENDIENTES */}
      <section className="space-y-6 pb-12">
        <div>
          <h4 className="text-xl md:text-2xl font-bold font-headline text-primary tracking-tight">Tareas Pendientes</h4>
          <p className="text-sm md:text-base text-muted-foreground font-medium">Actividades para esta semana</p>
        </div>
        
        <div className="bg-card border border-border rounded-2xl md:rounded-3xl overflow-hidden shadow-sm">
          <div className="divide-y divide-border">
            
            {/* Tarea de ejemplo 1 */}
            <div className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 hover:bg-muted/20 transition-colors">
              <div className="flex items-start md:items-center gap-4 flex-1">
                <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <AlertTriangle className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h6 className="font-bold text-foreground tracking-tight text-sm md:text-base">Investigación Académica I</h6>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium mt-0.5">
                    Metodología • Vence: Hoy 23:59 hrs
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                <span className="px-3 md:px-4 py-1.5 bg-red-600 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full">
                  URGENTE
                </span>
                <Link href="#" className="flex-1 md:flex-none text-center px-4 md:px-6 py-2 bg-primary text-primary-foreground rounded-full font-bold text-xs md:text-sm hover:opacity-90 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                  Ver Ejercicio
                </Link>
              </div>
            </div>

            {/* Tarea de ejemplo 2 */}
            <div className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 hover:bg-muted/20 transition-colors">
              <div className="flex items-start md:items-center gap-4 flex-1">
                <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-full bg-[#f3d57f]/30 flex items-center justify-center text-[#755B00]">
                  <Clock className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h6 className="font-bold text-foreground tracking-tight text-sm md:text-base">Ensayo Reporte Lectura</h6>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium mt-0.5">
                    Comunicación • Vence: Próximo Miércoles
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                <span className="px-3 md:px-4 py-1.5 bg-orange-500 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full">
                  PRÓXIMA
                </span>
                <Link href="#" className="flex-1 md:flex-none text-center px-4 md:px-6 py-2 bg-primary text-primary-foreground rounded-full font-bold text-xs md:text-sm hover:opacity-90 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                  Ver Ejercicio
                </Link>
              </div>
            </div>

            {/* Tarea de ejemplo 3 */}
            <div className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 hover:bg-muted/20 transition-colors">
              <div className="flex items-start md:items-center gap-4 flex-1">
                <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h6 className="font-bold text-foreground tracking-tight text-sm md:text-base">Cuestionario Unidad 2</h6>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium mt-0.5">
                    Laboratorio • Vence: Fin de Mes
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                <span className="px-3 md:px-4 py-1.5 bg-green-600 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full">
                  A TIEMPO
                </span>
                <Link href="#" className="flex-1 md:flex-none text-center px-4 md:px-6 py-2 bg-primary text-primary-foreground rounded-full font-bold text-xs md:text-sm hover:opacity-90 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                  Ver Ejercicio
                </Link>
              </div>
            </div>

          </div>
          
          <div className="bg-muted/20 p-4 text-center border-t border-border">
            <Link href="/dashboard/alumno/tareas" className="text-primary font-bold text-sm hover:underline hover:text-primary/80 transition-colors">
              Ver todas las tareas pendientes
            </Link>
          </div>
        </div>
      </section>
      
    </div>
  );
}