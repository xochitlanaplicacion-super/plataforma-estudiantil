'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  BarChart3, GraduationCap, BookOpen, ChevronDown,
  Zap, AlertTriangle,
  Calendar, Save, Loader2, CheckCircle2,
  Presentation, FolderOpen, Clock,
  Flame, ChevronRight, Globe, Edit3, RotateCcw, Download, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getGruposActivos,
  getActividadProfesores,
  getFechasEvaluacion,
  upsertFechaEvaluacion,
  deleteFechaEvaluacion,
  getMateriasDeGrupo
} from '@/lib/actions/auditoria';
import { useToast } from '@/hooks/use-toast';
import { useInstitucion } from '@/hooks/use-institucion';
import {
  loadTeacherActivityAuditAction,
  setTeacherWeeklyExceptionAction,
  clearTeacherWeeklyExceptionAction,
  type TeacherActivityAuditReport,
} from '@/lib/actions/teacher-activity-audit';
import { AcademicTenantResultsPage } from '@/components/academic/AcademicTenantResultsPage';

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function AuditoriaPage() {
  const [activeTab, setActiveTab] = useState<'alumnos' | 'profesores' | 'fechas'>('alumnos');

  return (
    <div className="space-y-8 pb-16 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-0">
      {/* HEADER */}
      <header className="pb-6 border-b border-border/50">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <BarChart3 className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black font-headline text-primary tracking-tight">
              Reportes y Auditoría
            </h1>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              Centro de control académico — Monitoreo de rendimiento y evaluaciones
            </p>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl border border-border w-fit">
        {[
          { key: 'alumnos' as const, icon: GraduationCap, label: 'Rendimiento Alumnos' },
          { key: 'profesores' as const, icon: BookOpen, label: 'Actividad Profesores' },
          { key: 'fechas' as const, icon: Calendar, label: 'Fechas Evaluación' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all',
              activeTab === tab.key
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-muted-foreground hover:bg-white hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* CONTENIDO */}
      {activeTab === 'alumnos' && <TabAlumnos />}
      {activeTab === 'profesores' && <TabProfesores />}
      {activeTab === 'fechas' && <TabFechas />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: RENDIMIENTO DE ALUMNOS
// ═══════════════════════════════════════════════════════════════
function TabAlumnos() {
  return <AcademicTenantResultsPage embedded />;
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: ACTIVIDAD DE PROFESORES
// ═══════════════════════════════════════════════════════════════
function TabProfesores() {
  const { toast } = useToast();
  const { config: institution } = useInstitucion();
  const [profesores, setProfesores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<TeacherActivityAuditReport | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [weeklyError, setWeeklyError] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [savingException, setSavingException] = useState(false);
  const [exceptionEditor, setExceptionEditor] = useState<{
    teacherId: string;
    weekStart: string;
    kind: 'vacaciones' | 'ausencia_autorizada' | 'ingreso_tardio' | 'otra';
    note: string;
    teacherStartedOn: string | null;
  } | null>(null);

  useEffect(() => {
    getActividadProfesores().then(setProfesores).catch(() => setProfesores([])).finally(() => setLoading(false));
    loadTeacherActivityAuditAction().then(result => {
      if (result.ok) setWeeklyReport(result.data);
      else setWeeklyError(result.message);
    }).catch(() => setWeeklyError('No se pudo cargar la auditoría semanal.')).finally(() => setWeeklyLoading(false));
  }, []);

  const refreshWeekly = async () => {
    setWeeklyLoading(true);
    setWeeklyError('');
    try {
      const result = await loadTeacherActivityAuditAction();
      if (result.ok) setWeeklyReport(result.data);
      else setWeeklyError(result.message);
    } catch {
      setWeeklyError('No se pudo cargar la auditoría semanal.');
    } finally {
      setWeeklyLoading(false);
    }
  };

  const downloadPdf = async (teacherId?: string) => {
    if (!weeklyReport) return;
    setExporting(teacherId ?? 'general');
    try {
      const { buildTeacherActivityPdf, teacherActivityPdfFilename } = await import('@/lib/reports/teacher-activity-pdf');
      const teacher = teacherId ? weeklyReport.teachers.find(row => row.id === teacherId) : undefined;
      const pdf = await buildTeacherActivityPdf({
        report: weeklyReport,
        teacherId,
        institution: {
          name: institution.nombre_completo === 'Mi Institución' ? weeklyReport.scope.tenantName : institution.nombre_completo,
          primaryColor: institution.color_primario,
          secondaryColor: institution.color_secundario,
          logoUrl: institution.logo_url,
        },
      });
      pdf.save(teacherActivityPdfFilename(weeklyReport, teacher?.name));
      toast({ title: 'PDF generado', description: teacher ? `Reporte de ${teacher.name}.` : 'Reporte general de profesores.' });
    } catch {
      toast({ title: 'No se pudo generar el PDF', description: 'Vuelve a intentarlo.', variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const saveException = async () => {
    if (!exceptionEditor) return;
    setSavingException(true);
    try {
      const result = await setTeacherWeeklyExceptionAction(exceptionEditor);
      if (!result.ok) throw new Error(result.message);
      setExceptionEditor(null);
      await refreshWeekly();
      toast({ title: 'Excepción guardada' });
    } catch (error) {
      toast({ title: 'No se pudo guardar la excepción', description: error instanceof Error ? error.message : 'Vuelve a intentarlo.', variant: 'destructive' });
    } finally {
      setSavingException(false);
    }
  };

  const removeException = async (teacherId: string, weekStart: string) => {
    setSavingException(true);
    try {
      const result = await clearTeacherWeeklyExceptionAction({ teacherId, weekStart });
      if (!result.ok) throw new Error(result.message);
      setExceptionEditor(null);
      await refreshWeekly();
      toast({ title: 'Excepción eliminada' });
    } catch (error) {
      toast({ title: 'No se pudo eliminar la excepción', description: error instanceof Error ? error.message : 'Vuelve a intentarlo.', variant: 'destructive' });
    } finally {
      setSavingException(false);
    }
  };

  const weekDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const weekLabel = (status: string, eligibility: string, reason?: string | null) => {
    if (status === 'excused') return 'Justificada';
    if (reason === 'inactive') return 'No aplica · inactivo';
    if (reason === 'no_assignment') return 'No aplica · sin materias';
    if (reason === 'before_registration') return 'Anterior al alta';
    if (reason === 'registration_week') return 'Semana de alta';
    if (eligibility === 'historical') return 'Histórica · informativa';
    if (eligibility === 'rollout') return 'Inicio de seguimiento';
    if (eligibility === 'partial_range') return 'Rango parcial';
    if (eligibility === 'in_progress' || status === 'in_progress') return 'En curso';
    if (status === 'met') return 'Meta alcanzada';
    if (status === 'below_goal') return 'Bajo meta';
    return 'Informativa';
  };
  const publishedLabel = (published: number, eligibility: string) => {
    if (eligibility === 'historical') return 'Sin medición';
    if (eligibility === 'rollout' || eligibility === 'partial_range') return `${published} observadas · parcial`;
    if (eligibility === 'in_progress') return `${published}/3 · en curso`;
    return `${published}/3`;
  };
  const pilotStatusLabel = (status: string) => {
    if (status === 'visible_now') return 'Tiene actividad con vínculo hoy';
    if (status === 'published_then_hidden') return 'Publicó; hoy sin vínculo activo';
    if (status === 'created_not_visible') return 'Creó, pero hoy sin vínculo activo';
    if (status === 'copy_review') return 'Posible copia · revisar origen';
    if (status === 'joined_during_pilot') return 'Ingreso reciente · revisar';
    if (status === 'exception_review') return 'Excepción registrada · revisar';
    if (status === 'not_applicable') return 'Meta no aplicable actualmente';
    return 'Sin actividad localizable';
  };
  const pilotPriority: Record<string, number> = {
    no_current_evidence: 0,
    created_not_visible: 1,
    copy_review: 2,
    published_then_hidden: 3,
    visible_now: 4,
    joined_during_pilot: 5,
    exception_review: 6,
    not_applicable: 7,
  };

  return (
    <div className="space-y-8">
      {weeklyReport?.pilotError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Corte piloto: {weeklyReport.pilotError}</p>}
      {weeklyReport?.pilot && <section aria-labelledby="pilot-activity-heading" className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="pilot-activity-heading" className="text-lg font-black text-foreground">Corte de prueba · desde el 27 de septiembre</h2>
            <p className="mt-1 text-sm text-muted-foreground">Del {weekDate(weeklyReport.pilot.from)} al {weekDate(weeklyReport.pilot.through)} · datos al {new Date(weeklyReport.pilot.asOf).toLocaleString('es-MX', { timeZone: weeklyReport.pilot.timezone, dateStyle: 'medium', timeStyle: 'short' })}.</p>
          </div>
          <button type="button" onClick={() => void downloadPdf()} disabled={exporting !== null || weeklyLoading} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Download className="h-4 w-4" /> Descargar PDF con corte
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Docentes con actividad vinculada hoy', value: weeklyReport.pilot.teachers.filter((row) => row.status === 'visible_now').length },
            { label: 'Sin actividad localizable', value: weeklyReport.pilot.teachers.filter((row) => row.status === 'no_current_evidence').length },
            { label: 'Crearon, pero sin vínculo hoy', value: weeklyReport.pilot.teachers.filter((row) => row.status === 'created_not_visible').length },
            { label: 'Origen o autoría por revisar', value: weeklyReport.pilot.unattributed.length + weeklyReport.pilot.teachers.reduce((total, teacher) => total + teacher.evidence.filter((item) => item.possibleCopy).length, 0) },
          ].map((item) => <div key={item.label} className="rounded-xl border border-amber-200 bg-white p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">{item.label}</p><p className="text-2xl font-black text-foreground">{item.value}</p></div>)}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[740px] text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground"><tr><th className="p-3">Profesor</th><th className="p-3">Creadas identificables</th><th className="p-3">Con vínculo hoy</th><th className="p-3">Publicaciones verificadas</th><th className="p-3">Lectura</th></tr></thead>
            <tbody>{weeklyReport.pilot.teachers.slice().sort((a, b) => pilotPriority[a.status] - pilotPriority[b.status] || a.name.localeCompare(b.name, 'es')).map((row) => <tr key={row.teacherId} className="border-t border-border align-top">
              <td className="p-3"><p className="font-bold text-foreground">{row.name}</p><p className="text-muted-foreground">{row.email}</p>{row.evidence.length > 0 && <details className="mt-2"><summary className="cursor-pointer font-semibold text-primary">Ver {row.evidence.length} actividad(es)</summary><ul className="mt-2 space-y-1 text-muted-foreground">{row.evidence.map((item) => <li key={item.logicalId}>{item.title} · {new Date(item.createdAt).toLocaleString('es-MX', { timeZone: weeklyReport.pilot!.timezone, dateStyle: 'short', timeStyle: 'short' })} · {item.visibleNow ? 'con vínculo hoy' : 'sin vínculo hoy'}{item.possibleCopy ? ' · posible copia; origen por revisar' : ''}{item.mixedCurrentAuthors ? ' · autoría por revisar' : ''}</li>)}</ul></details>}</td>
              <td className="p-3 text-center font-black">{row.createdExisting}</td><td className="p-3 text-center font-black">{row.visibleNow}</td><td className="p-3 text-center font-black">{row.verifiedPublications}</td>
              <td className={cn('p-3 font-bold', row.status === 'no_current_evidence' ? 'text-red-700' : row.status === 'created_not_visible' || row.status === 'copy_review' ? 'text-amber-700' : 'text-foreground')}>{pilotStatusLabel(row.status)}{row.status !== 'copy_review' && row.evidence.some((item) => item.possibleCopy) && <p className="mt-1 text-amber-700">Origen de copia por revisar</p>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs leading-relaxed text-amber-900">{weeklyReport.pilot.caveat} Los ceros significan que no hay una actividad localizable en este corte; no prueban que nunca haya existido una actividad eliminada.</p>
      </section>}
      <section className="bg-white rounded-2xl border border-border shadow-sm p-5 md:p-6 space-y-5" aria-labelledby="weekly-activity-heading">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 id="weekly-activity-heading" className="text-lg font-black text-foreground">Seguimiento semanal · 3 publicaciones por profesor</h2>
            </div>
            <p className="text-sm text-muted-foreground">Publicaciones registradas por primera vez. El histórico de 8 semanas es informativo donde no había seguimiento completo.</p>
            {weeklyReport && <p className="text-xs font-semibold text-muted-foreground mt-2">Semana actual: {weekDate(weeklyReport.currentWeek.start)} – {weekDate(weeklyReport.currentWeek.end)} · {weeklyReport.scope.timezone}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => void refreshWeekly()} disabled={weeklyLoading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50" aria-label="Actualizar actividad semanal">
              <RefreshCw className={cn('w-4 h-4', weeklyLoading && 'animate-spin')} /> Actualizar
            </button>
            <button type="button" onClick={() => void downloadPdf()} disabled={!weeklyReport || weeklyLoading || exporting !== null} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50">
              {exporting === 'general' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar PDF general
            </button>
          </div>
        </div>
        {weeklyLoading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando seguimiento semanal...</div>}
        {weeklyError && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{weeklyError}</p>}
        {!weeklyLoading && weeklyReport && <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Profesores', value: weeklyReport.teachers.length },
              { label: 'Publicaciones observadas esta semana', value: weeklyReport.teachers.reduce((sum, teacher) => sum + (teacher.weeks.find(week => week.weekStart === weeklyReport.currentWeek.start)?.published ?? 0), 0) },
              { label: 'Docentes con actividad esta semana', value: weeklyReport.teachers.filter(teacher => (teacher.weeks.find(week => week.weekStart === weeklyReport.currentWeek.start)?.published ?? 0) > 0).length },
              { label: 'Entregas por revisar hoy', value: weeklyReport.teachers.reduce((sum, teacher) => sum + teacher.pendingReviews, 0) },
              { label: 'Semanas justificadas', value: weeklyReport.teachers.reduce((sum, teacher) => sum + teacher.weeks.filter(week => week.exception).length, 0) },
            ].map(item => <div key={item.label} className="bg-muted/30 border border-border rounded-xl p-3"><p className="text-[10px] uppercase font-bold text-muted-foreground">{item.label}</p><p className="text-2xl font-black text-foreground">{item.value}</p></div>)}
          </div>
          {weeklyReport.teachers.length === 0 ? <p className="text-sm text-muted-foreground">No hay profesores registrados en el alcance.</p> : (
            <div className="space-y-3">
              {weeklyReport.teachers.map(teacher => {
                const current = teacher.weeks.find(week => week.weekStart === weeklyReport.currentWeek.start);
                return <details key={teacher.id} className="rounded-xl border border-border bg-muted/10 group">
                  <summary className="cursor-pointer px-4 py-3 flex flex-wrap items-center justify-between gap-2 font-bold text-sm text-foreground">
                    <span>{teacher.name} <span className="font-normal text-muted-foreground ml-1">{teacher.email}</span></span>
                    <span className="text-xs text-primary">Esta semana: {current?.nonApplicableReason ? `${current.published} observadas · meta no aplicable` : publishedLabel(current?.published ?? 0, weeklyReport.weeks.find(week => week.start === weeklyReport.currentWeek.start)?.eligibility ?? 'tracked')} · {teacher.weeksMet}/{teacher.trackedWeeks} semanas evaluables con meta</span>
                  </summary>
                  <div className="px-4 pb-4 space-y-4">
                    <div className="flex justify-end">
                      <button type="button" onClick={() => void downloadPdf(teacher.id)} disabled={exporting !== null} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 text-primary text-xs font-bold hover:bg-primary/5 disabled:opacity-50">
                        {exporting === teacher.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar PDF del profesor
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px]"><tr><th className="p-2">Semana</th><th className="p-2">Publicadas</th><th className="p-2">Entregas</th><th className="p-2">Revisiones</th><th className="p-2">Estado</th><th className="p-2">Excepción autorizada</th></tr></thead>
                        <tbody>{teacher.weeks.map(week => {
                          const eligibility = weeklyReport.weeks.find(item => item.start === week.weekStart)?.eligibility ?? 'tracked';
                          const canEdit = eligibility === 'tracked' || eligibility === 'in_progress';
                          const isEditing = exceptionEditor?.teacherId === teacher.id && exceptionEditor?.weekStart === week.weekStart;
                          return <React.Fragment key={week.weekStart}>
                            <tr className="border-t border-border align-top"><td className="p-2 whitespace-nowrap">{weekDate(week.weekStart)} – {weekDate(week.weekEnd)}</td><td className="p-2 font-bold">{week.nonApplicableReason ? `${week.published} observadas` : publishedLabel(week.published, eligibility)}</td><td className="p-2">{week.studentSubmissions === null ? 'Sin seguimiento' : week.studentSubmissions}</td><td className="p-2">{week.teacherReviews === null ? 'Sin seguimiento' : week.teacherReviews}</td><td className="p-2">{weekLabel(week.status, eligibility, week.nonApplicableReason)}</td><td className="p-2 min-w-40">{week.exception ? <p className="mb-1">{week.exception.kind.replaceAll('_', ' ')}{week.exception.teacherStartedOn ? ` · ingreso ${weekDate(week.exception.teacherStartedOn)}` : ''}{week.exception.note ? ` · ${week.exception.note}` : ''}</p> : null}{canEdit && <span className="flex gap-2"><button type="button" onClick={() => setExceptionEditor({ teacherId: teacher.id, weekStart: week.weekStart, kind: week.exception?.kind ?? 'vacaciones', note: week.exception?.note ?? '', teacherStartedOn: week.exception?.teacherStartedOn ?? null })} className="text-primary font-bold underline-offset-2 hover:underline">{week.exception ? 'Editar' : 'Justificar'}</button>{week.exception && <button type="button" onClick={() => void removeException(teacher.id, week.weekStart)} disabled={savingException} className="text-red-600 font-bold underline-offset-2 hover:underline disabled:opacity-50">Quitar</button>}</span>}</td></tr>
                            {isEditing && <tr className="border-t border-border bg-primary/5"><td colSpan={6} className="p-3"><div className="flex flex-col sm:flex-row gap-2 sm:items-center"><select aria-label="Motivo de excepción" value={exceptionEditor.kind} onChange={event => setExceptionEditor({ ...exceptionEditor, kind: event.target.value as typeof exceptionEditor.kind, teacherStartedOn: event.target.value === 'ingreso_tardio' ? exceptionEditor.teacherStartedOn : null })} className="rounded-lg border border-border bg-white px-2 py-2 text-xs"><option value="vacaciones">Vacaciones</option><option value="ausencia_autorizada">Ausencia autorizada</option><option value="ingreso_tardio">Ingreso a mitad de semana</option><option value="otra">Otra</option></select>{exceptionEditor.kind === 'ingreso_tardio' && <input aria-label="Fecha de ingreso" title="Fecha de ingreso en esta semana" type="date" min={week.weekStart} max={week.weekEnd} value={exceptionEditor.teacherStartedOn ?? ''} onChange={event => setExceptionEditor({ ...exceptionEditor, teacherStartedOn: event.target.value || null })} className="rounded-lg border border-border bg-white px-2 py-2 text-xs" />}<input aria-label="Nota de excepción" value={exceptionEditor.note} onChange={event => setExceptionEditor({ ...exceptionEditor, note: event.target.value })} placeholder="Motivo y autorización" className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-xs" /><button type="button" onClick={() => void saveException()} disabled={savingException || !exceptionEditor.note.trim() || (exceptionEditor.kind === 'ingreso_tardio' && !exceptionEditor.teacherStartedOn)} className="rounded-lg bg-primary text-primary-foreground px-3 py-2 font-bold disabled:opacity-50">Guardar</button><button type="button" onClick={() => setExceptionEditor(null)} className="rounded-lg border border-border px-3 py-2 font-bold">Cancelar</button></div></td></tr>}
                          </React.Fragment>;
                        })}</tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">{weeklyReport.metricNotes.studentSubmissions} {weeklyReport.metricNotes.teacherReviews} {weeklyReport.metricNotes.pendingReviews}</p>
                    {teacher.exceptions.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="font-bold text-amber-800 text-xs mb-1">Observaciones de datos</p><ul className="list-disc pl-4 text-xs text-amber-900 space-y-1">{teacher.exceptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                  </div>
                </details>;
              })}
            </div>
          )}
        </>}
      </section>

      <section aria-labelledby="legacy-coverage-heading" className="space-y-4">
        <div><h2 id="legacy-coverage-heading" className="text-lg font-black text-foreground">Cobertura temática · 5 ejercicios por tema</h2><p className="text-xs text-muted-foreground">Medición de contenido por tema, independiente de la meta semanal de publicaciones.</p></div>
        {loading ? <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Cargando cobertura temática...</div> : profesores.length === 0 ? <p className="text-sm text-muted-foreground py-6">No hay profesores activos registrados.</p> : profesores.map(prof => {
        const isOpen = expandido === prof.id;
        const tieneUrgentes = prof.metricas.urgentes > 0;
        const coberturaCumple = prof.cobertura.every((c: any) => c.cumpleTotal);

        return (
          <div key={prof.id} className={cn(
            'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md',
            tieneUrgentes ? 'border-red-300 ring-2 ring-red-100' : 'border-border'
          )}>
            <button
              onClick={() => setExpandido(isOpen ? null : prof.id)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  'h-12 w-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0',
                  tieneUrgentes ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'
                )}>
                  {prof.nombre.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-foreground text-sm">{prof.nombre}</p>
                    {tieneUrgentes && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white rounded-full text-[8px] font-black uppercase animate-pulse">
                        <Flame className="w-3 h-3" /> {prof.metricas.urgentes} Urgentes
                      </span>
                    )}
                    {!coberturaCumple && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[8px] font-black uppercase">
                        <AlertTriangle className="w-3 h-3" /> Contenido Insuficiente
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground">{prof.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-5 mr-4">
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-muted-foreground">Ejercicios</p>
                    <p className="text-lg font-black text-foreground">{prof.metricas.ejerciciosCreados}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-muted-foreground">Slides</p>
                    <p className="text-lg font-black text-foreground">{prof.metricas.slidesCreadas}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-muted-foreground">Recursos</p>
                    <p className="text-lg font-black text-foreground">{prof.metricas.recursosSubidos}</p>
                  </div>
                </div>
                <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-muted/20 p-5 space-y-6">
                {/* Grid de métricas */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Creados (30d)', value: prof.metricas.creadosRecientes, icon: Zap, color: 'text-blue-600 bg-blue-50' },
                    { label: 'Modificados (30d)', value: prof.metricas.modificadosRecientes, icon: Edit3, color: 'text-indigo-600 bg-indigo-50' },
                    { label: 'Total Slides', value: prof.metricas.slidesCreadas, icon: Presentation, color: 'text-purple-600 bg-purple-50' },
                    { label: 'Recursos', value: prof.metricas.recursosSubidos, icon: FolderOpen, color: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Calificadas', value: prof.metricas.descriptivasCalificadas, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
                    { label: 'Pendientes', value: prof.metricas.descriptivasPendientes, icon: Clock, color: prof.metricas.descriptivasPendientes > 0 ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-50' },
                  ].map((m, i) => (
                    <div key={i} className="bg-white rounded-xl border border-border p-3 text-center shadow-sm">
                      <div className={cn('mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-2', m.color)}>
                        <m.icon className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-foreground">{m.value}</p>
                      <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Asignaciones */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Materias Asignadas</p>
                  <div className="flex flex-wrap gap-2">
                    {prof.asignaciones.map((a: any, i: number) => (
                      <span key={i} className="px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-bold text-foreground">
                        {a.nombre} <span className="text-muted-foreground">({a.grupoNombre})</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Cobertura por tema */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                    Cobertura Mínima (5 ejercicios/tema)
                  </p>
                  <div className="space-y-3">
                    {prof.cobertura.map((cob: any, ci: number) => (
                      <div key={ci} className="bg-white rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-foreground">{cob.materiaNombre}</span>
                          <span className={cn(
                            'text-[9px] font-black uppercase px-2.5 py-1 rounded-lg',
                            cob.cumpleTotal ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          )}>
                            {cob.cumpleTotal ? '✅ Cumple' : '❌ No cumple'}
                          </span>
                        </div>
                        {cob.temas.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {cob.temas.map((t: any, ti: number) => (
                              <div key={ti} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg">
                                <span className="text-[10px] font-bold text-muted-foreground truncate mr-2">{t.temaTitulo}</span>
                                <span className={cn(
                                  'text-[10px] font-black shrink-0',
                                  t.cumple ? 'text-emerald-600' : 'text-red-600'
                                )}>
                                  {t.ejercicios}/5
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] italic text-muted-foreground">Sin temas creados aún</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: FECHAS DE EVALUACIÓN
// ═══════════════════════════════════════════════════════════════
function TabFechas() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [grupos, setGrupos] = useState<any[]>([]);
  const [grupoId, setGrupoId] = useState('');
  const [materias, setMaterias] = useState<any[]>([]);
  const [fechas, setFechas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Formulario
  const [fechaGlobal, setFechaGlobal] = useState('');
  const [fechasEspecificas, setFechasEspecificas] = useState<Record<string, string>>({});

  useEffect(() => {
    getGruposActivos().then(setGrupos);
  }, []);

  const cargarGrupo = async (id: string) => {
    setGrupoId(id);
    if (!id) return;
    setLoading(true);

    const [matsRes, fechasRes] = await Promise.all([
      getMateriasDeGrupo(id),
      getFechasEvaluacion(id)
    ]);

    setMaterias(matsRes);
    const fechasData = (fechasRes as any).data || [];
    setFechas(fechasData);

    // Pre-popular los formstados
    const global = fechasData.find((f: any) => f.materia_id === null);
    if (global) setFechaGlobal(global.fecha_evaluacion);
    else setFechaGlobal('');

    const especs: Record<string, string> = {};
    fechasData.filter((f: any) => f.materia_id !== null).forEach((f: any) => {
      especs[f.materia_id] = f.fecha_evaluacion;
    });
    setFechasEspecificas(especs);
    setLoading(false);
  };

  const guardarFechaGlobal = () => {
    if (!fechaGlobal || !grupoId) return;
    startTransition(async () => {
      const res = await upsertFechaEvaluacion({
        grupo_id: grupoId,
        materia_id: null,
        fecha_evaluacion: fechaGlobal,
        descripcion: 'Evaluación Final (Global)'
      });
      if (res.error) {
        toast({ title: 'Error', description: res.error, variant: 'destructive' });
      } else {
        toast({ title: '✅ Fecha global guardada', description: 'Los alumnos verán esta fecha en todas sus materias.' });
        cargarGrupo(grupoId);
      }
    });
  };

  const guardarFechaEspecifica = (materiaId: string) => {
    const fecha = fechasEspecificas[materiaId];
    if (!fecha || !grupoId) return;
    startTransition(async () => {
      const res = await upsertFechaEvaluacion({
        grupo_id: grupoId,
        materia_id: materiaId,
        fecha_evaluacion: fecha,
        descripcion: 'Evaluación Final (Específica)'
      });
      if (res.error) {
        toast({ title: 'Error', description: res.error, variant: 'destructive' });
      } else {
        toast({ title: '✅ Fecha guardada', description: 'Esta materia tiene ahora una fecha independiente.' });
        cargarGrupo(grupoId);
      }
    });
  };

  const eliminarFechaEspecifica = (materiaId: string) => {
    const fechaObj = fechas.find((f: any) => f.materia_id === materiaId);
    if (!fechaObj) return;
    startTransition(async () => {
      const res = await deleteFechaEvaluacion(fechaObj.id);
      if ((res as any).error) {
        toast({ title: 'Error', description: (res as any).error, variant: 'destructive' });
      } else {
        toast({ title: '🔄 Fecha eliminada', description: 'Esta materia usará la fecha global del grupo.' });
        const newEsp = { ...fechasEspecificas };
        delete newEsp[materiaId];
        setFechasEspecificas(newEsp);
        cargarGrupo(grupoId);
      }
    });
  };

  const getFechaActual = (materiaId: string) => {
    const especifica = fechas.find((f: any) => f.materia_id === materiaId);
    if (especifica) return { fecha: especifica.fecha_evaluacion, tipo: 'Específica' };
    const global = fechas.find((f: any) => f.materia_id === null);
    if (global) return { fecha: global.fecha_evaluacion, tipo: 'Global' };
    return { fecha: null, tipo: 'Sin asignar' };
  };

  return (
    <div className="space-y-6">
      {/* Selector de grupo */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 block">
          Seleccionar Grupo
        </label>
        <div className="relative">
          <select
            value={grupoId}
            onChange={e => cargarGrupo(e.target.value)}
            className="w-full md:w-96 h-12 px-4 pr-10 bg-white border border-border rounded-xl text-sm font-bold text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">— Selecciona un grupo —</option>
            {grupos.map((g: any) => (
              <option key={g.id} value={g.id}>
                {(g.carreras as any)?.nombre} — {g.nombre} ({g.turno})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-widest">Cargando materias...</span>
        </div>
      )}

      {grupoId && !loading && (
        <>
          {/* Fecha Global */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-600 text-white rounded-xl">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="font-black text-blue-900 text-sm uppercase tracking-wide">Fecha de Evaluación Global</p>
                <p className="text-[10px] font-bold text-blue-600">Aplica a TODAS las materias del grupo (a menos que se sobreescriba individualmente)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={fechaGlobal}
                onChange={e => setFechaGlobal(e.target.value)}
                className="h-12 px-4 bg-white border border-blue-200 rounded-xl text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              />
              <button
                onClick={guardarFechaGlobal}
                disabled={!fechaGlobal || isPending}
                className={cn(
                  'h-12 px-6 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-2 transition-all',
                  fechaGlobal && !isPending
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                )}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Global
              </button>
            </div>
          </div>

          {/* Tabla de materias */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-5 border-b border-border bg-muted/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Fechas por Materia — {materias.length} materias asignadas
              </p>
            </div>
            <div className="divide-y divide-border">
              {materias.map(mat => {
                const info = getFechaActual(mat.id);
                const tieneEspecifica = info.tipo === 'Específica';

                return (
                  <div key={mat.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <BookOpen className="w-5 h-5 text-primary shrink-0" />
                      <div>
                        <p className="font-black text-foreground text-sm">{mat.nombre}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{mat.profesor}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Fecha actual */}
                      <div className="text-right mr-2">
                        {info.fecha ? (
                          <>
                            <p className="text-sm font-black text-foreground">
                              {new Date(info.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            <p className={cn(
                              'text-[9px] font-black uppercase',
                              tieneEspecifica ? 'text-purple-600' : 'text-blue-600'
                            )}>
                              {tieneEspecifica ? '🟣 Específica' : '🔵 Global'}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs font-bold text-muted-foreground italic">Sin fecha</p>
                        )}
                      </div>

                      {/* Input fecha específica */}
                      <input
                        type="date"
                        value={fechasEspecificas[mat.id] || ''}
                        onChange={e => setFechasEspecificas(prev => ({ ...prev, [mat.id]: e.target.value }))}
                        className="h-10 px-3 bg-white border border-border rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      <button
                        onClick={() => guardarFechaEspecifica(mat.id)}
                        disabled={!fechasEspecificas[mat.id] || isPending}
                        className="h-10 px-4 bg-primary text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" /> Guardar
                      </button>

                      {tieneEspecifica && (
                        <button
                          onClick={() => eliminarFechaEspecifica(mat.id)}
                          disabled={isPending}
                          className="h-10 px-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-red-50 hover:text-red-600 transition-all flex items-center gap-1.5"
                          title="Eliminar fecha específica y usar la global"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Usar Global
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {materias.length === 0 && (
                <div className="p-10 text-center text-muted-foreground">
                  <Calendar className="w-10 h-10 mx-auto opacity-20 mb-3" />
                  <p className="text-sm font-bold">Este grupo no tiene materias asignadas</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!grupoId && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Calendar className="w-16 h-16 mx-auto opacity-20 mb-4" />
          <p className="font-bold text-lg">Selecciona un grupo para gestionar fechas de evaluación</p>
          <p className="text-sm mt-1">Las fechas se reflejarán en tiempo real en el panel de los alumnos</p>
        </div>
      )}
    </div>
  );
}
