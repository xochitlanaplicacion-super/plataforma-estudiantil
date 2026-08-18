'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { parseFechaLocal } from '@/lib/utils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ────────────────────────────────────────────────────────────────────
// 1. GRUPOS ACTIVOS (con al menos 1 alumno activo vigente)
// ────────────────────────────────────────────────────────────────────
export async function getGruposActivos() {
  const hoy = new Date().toISOString().split('T')[0];

  // Obtener todos los grupos
  const { data: grupos } = await supabaseAdmin
    .from('grupos')
    .select('id, nombre, turno, carrera_id, grado_id, carreras(nombre), grados(nombre)')
    .eq('activo', true)
    .order('nombre');

  if (!grupos || grupos.length === 0) return [];

  // Obtener alumnos activos vigentes agrupados por grupo
  const { data: alumnos } = await supabaseAdmin
    .from('profiles')
    .select('grupo_id')
    .eq('rol', 'alumno')
    .eq('estatus', 'activo')
    .gte('fecha_expiracion', hoy);

  const conteoPorGrupo = new Map<string, number>();
  alumnos?.forEach(a => {
    if (a.grupo_id) {
      conteoPorGrupo.set(a.grupo_id, (conteoPorGrupo.get(a.grupo_id) || 0) + 1);
    }
  });

  return grupos
    .filter(g => (conteoPorGrupo.get(g.id) || 0) > 0)
    .map(g => ({
      ...g,
      totalAlumnos: conteoPorGrupo.get(g.id) || 0
    }));
}

// ────────────────────────────────────────────────────────────────────
// 2. RENDIMIENTO DE ALUMNOS POR GRUPO
// ────────────────────────────────────────────────────────────────────
export async function getRendimientoAlumnos(grupoId: string) {
  const hoy = new Date().toISOString().split('T')[0];

  // 1. Alumnos activos del grupo
  const { data: alumnos } = await supabaseAdmin
    .from('profiles')
    .select('id, nombre, apellidos, matricula, estatus, grupo_id')
    .eq('grupo_id', grupoId)
    .eq('rol', 'alumno')
    .eq('estatus', 'activo')
    .gte('fecha_expiracion', hoy)
    .order('apellidos');

  if (!alumnos || alumnos.length === 0) return { alumnos: [], materias: [], resumen: null };

  // 2. Materias asignadas al grupo
  const { data: asignaciones } = await supabaseAdmin
    .from('asignaciones_profesor')
    .select('materia_id, materias(id, nombre)')
    .eq('grupo_id', grupoId)
    .eq('activo', true);

  const materias = asignaciones?.map((a: any) => ({
    id: a.materias?.id,
    nombre: a.materias?.nombre
  })).filter(m => m.id) || [];

  const materiaIds = materias.map(m => m.id);

  // 3. Obtener todos los ejercicios de esas materias (cadena: materia → unidad → tema → ejercicio)
  const { data: unidades } = await supabaseAdmin
    .from('unidades')
    .select('id, materia_id')
    .in('materia_id', materiaIds)
    .eq('activo', true);

  const unidadIds = unidades?.map(u => u.id) || [];

  const { data: temas } = await supabaseAdmin
    .from('temas')
    .select('id, unidad_id')
    .in('unidad_id', unidadIds.length > 0 ? unidadIds : ['__none__']);

  const temaIds = temas?.map(t => t.id) || [];

  const { data: ejercicios } = await supabaseAdmin
    .from('ejercicios')
    .select('id, tema_id, tipo, titulo, fecha_entrega')
    .in('tema_id', temaIds.length > 0 ? temaIds : ['__none__']);

  // Crear mapa tema → materia
  const temaToUnidad = new Map(temas?.map(t => [t.id, t.unidad_id]) || []);
  const unidadToMateria = new Map(unidades?.map(u => [u.id, u.materia_id]) || []);

  const ejercicioToMateria = new Map<string, string>();
  ejercicios?.forEach(ej => {
    const unidadId = temaToUnidad.get(ej.tema_id);
    const materiaId = unidadId ? unidadToMateria.get(unidadId) : null;
    if (materiaId) ejercicioToMateria.set(ej.id, materiaId);
  });

  const totalEjercicios = ejercicios?.length || 0;

  // Ejercicios por materia
  const ejerciciosPorMateria = new Map<string, number>();
  ejercicios?.forEach(ej => {
    const mId = ejercicioToMateria.get(ej.id);
    if (mId) ejerciciosPorMateria.set(mId, (ejerciciosPorMateria.get(mId) || 0) + 1);
  });

  // 4. Resultados de todos los alumnos del grupo
  const alumnoIds = alumnos.map(a => a.id);
  const { data: resultados } = await supabaseAdmin
    .from('resultados_ejercicios')
    .select('alumno_id, ejercicio_id, calificacion, bloqueado, intentos, calificacion_manual, estado')
    .in('alumno_id', alumnoIds);

  // 5. Estado de pagos
  const { data: pagos } = await supabaseAdmin
    .from('pagos_alumno')
    .select('alumno_id, estatus')
    .in('alumno_id', alumnoIds);

  // 6. Construir datos por alumno
  const ahora = new Date();
  const alumnosConRendimiento = alumnos.map(alumno => {
    // BUG 1: Filtrar resultados para que solo sean de las materias de este grupo
    const misResultados = resultados?.filter(r => r.alumno_id === alumno.id && ejercicioToMateria.has(r.ejercicio_id)) || [];
    const completados = misResultados.filter(r => r.estado === 'completado' || r.calificacion !== null || r.calificacion_manual !== null);
    
    // Total de ejercicios asignados al grupo
    const ejerciciosDelGrupo = ejercicios?.filter(ej => ejercicioToMateria.has(ej.id)) || [];

    const progresoGlobal = ejerciciosDelGrupo.length > 0
      ? Math.round((completados.length / ejerciciosDelGrupo.length) * 100)
      : 0;

    // BUG 2, 3 y 4: Calcular promedio correctamente (base completados + vencidos, y usando calificacion_manual)
    let sumaCalificacionesGlobal = 0;
    let evaluablesGlobal = 0;

    ejerciciosDelGrupo.forEach(ej => {
      const resultado = misResultados.find(r => r.ejercicio_id === ej.id);
      const estaCompletado = resultado && (resultado.estado === 'completado' || resultado.calificacion !== null || resultado.calificacion_manual !== null);
      const estaVencido = ej.fecha_entrega ? parseFechaLocal(ej.fecha_entrega) < ahora : false;

      if (estaCompletado) {
        evaluablesGlobal++;
        const cal = resultado?.calificacion ?? resultado?.calificacion_manual ?? 0;
        sumaCalificacionesGlobal += cal;
      } else if (estaVencido) {
        evaluablesGlobal++;
      }
    });

    const promedioGeneralBase100 = evaluablesGlobal > 0 ? sumaCalificacionesGlobal / evaluablesGlobal : 0;
    // BUG 5: Estandarizar a escala base 10
    const promedioGeneral = evaluablesGlobal > 0 ? Math.round((promedioGeneralBase100 / 10) * 10) / 10 : 0;

    const notasPerfectas = misResultados.filter(r => r.bloqueado === true).length;
    const intentosArr = misResultados.map(r => r.intentos || 1);
    const intentosPromedio = intentosArr.length > 0
      ? Math.round((intentosArr.reduce((s, i) => s + i, 0) / intentosArr.length) * 10) / 10
      : 0;

    // Desglose por materia
    const desgloseMateria = materias.map(mat => {
      const ejsDeMateria = ejerciciosDelGrupo.filter(ej => ejercicioToMateria.get(ej.id) === mat.id);
      
      let sumaMateria = 0;
      let evaluablesMateria = 0;
      let completadosMateria = 0;

      ejsDeMateria.forEach(ej => {
        const resultado = misResultados.find(r => r.ejercicio_id === ej.id);
        const estaCompletado = resultado && (resultado.estado === 'completado' || resultado.calificacion !== null || resultado.calificacion_manual !== null);
        const estaVencido = ej.fecha_entrega ? parseFechaLocal(ej.fecha_entrega) < ahora : false;

        if (estaCompletado) {
          evaluablesMateria++;
          completadosMateria++;
          const cal = resultado?.calificacion ?? resultado?.calificacion_manual ?? 0;
          sumaMateria += cal;
        } else if (estaVencido) {
          evaluablesMateria++;
        }
      });

      const promMateriaBase100 = evaluablesMateria > 0 ? sumaMateria / evaluablesMateria : 0;
      const promMateria = evaluablesMateria > 0 ? Math.round((promMateriaBase100 / 10) * 10) / 10 : 0;

      return {
        materiaId: mat.id,
        materiaNombre: mat.nombre,
        completados: completadosMateria,
        total: ejsDeMateria.length,
        promedio: promMateria
      };
    });

    // Pagos
    const misPagos = pagos?.filter(p => p.alumno_id === alumno.id) || [];
    const pagosPagados = misPagos.filter(p => p.estatus === 'pagado').length;

    return {
      id: alumno.id,
      nombre: `${alumno.nombre} ${alumno.apellidos}`,
      matricula: alumno.matricula,
      progresoGlobal,
      promedioGeneral,
      notasPerfectas,
      intentosPromedio,
      desgloseMateria,
      pagos: { pagados: pagosPagados, total: misPagos.length }
    };
  });

  // 7. Resumen del grupo
  const promedios = alumnosConRendimiento.map(a => a.promedioGeneral);
  const promedioGrupo = promedios.length > 0
    ? Math.round((promedios.reduce((s, p) => s + p, 0) / promedios.length) * 10) / 10
    : 0;

  const mejorAlumno = alumnosConRendimiento.reduce(
    (best, a) => a.promedioGeneral > best.promedioGeneral ? a : best,
    alumnosConRendimiento[0]
  );
  const peorAlumno = alumnosConRendimiento.reduce(
    (worst, a) => a.promedioGeneral < worst.promedioGeneral ? a : worst,
    alumnosConRendimiento[0]
  );

  return {
    alumnos: alumnosConRendimiento,
    materias,
    resumen: {
      promedioGrupo,
      totalAlumnos: alumnos.length,
      mejorAlumno: mejorAlumno ? { nombre: mejorAlumno.nombre, promedio: mejorAlumno.promedioGeneral } : null,
      peorAlumno: peorAlumno ? { nombre: peorAlumno.nombre, promedio: peorAlumno.promedioGeneral } : null
    }
  };
}

// ────────────────────────────────────────────────────────────────────
// 3. ACTIVIDAD DE PROFESORES
// ────────────────────────────────────────────────────────────────────
export async function getActividadProfesores() {
  const hace30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Profesores activos
  const { data: profesores } = await supabaseAdmin
    .from('profiles')
    .select('id, nombre, apellidos, email, estatus')
    .eq('rol', 'profesor')
    .eq('estatus', 'activo')
    .order('apellidos');

  if (!profesores || profesores.length === 0) return [];

  const profIds = profesores.map(p => p.id);

  // Asignaciones
  const { data: asignaciones } = await supabaseAdmin
    .from('asignaciones_profesor')
    .select('profesor_id, materia_id, grupo_id, materias(id, nombre), grupos(id, nombre)')
    .in('profesor_id', profIds)
    .eq('activo', true);

  // Ejercicios (creados por profesores)
  const { data: ejercicios } = await supabaseAdmin
    .from('ejercicios')
    .select('id, tema_id, created_by, created_at, updated_at, tipo')
    .in('created_by', profIds);

  // Slides
  const { data: slides } = await supabaseAdmin
    .from('slides')
    .select('id, created_by, created_at')
    .in('created_by', profIds);

  // Resources
  const { data: resources } = await supabaseAdmin
    .from('resources')
    .select('id, created_by, created_at')
    .in('created_by', profIds);

  // Para verificar cobertura: temas por materia de cada profesor
  // Necesitamos: materia → unidades → temas → ejercicios
  const materiasIds = [...new Set(asignaciones?.map(a => a.materia_id).filter(Boolean) || [])];

  const { data: unidades } = await supabaseAdmin
    .from('unidades')
    .select('id, materia_id')
    .in('materia_id', materiasIds.length > 0 ? materiasIds : ['__none__'])
    .eq('activo', true);

  const unidadIds = unidades?.map(u => u.id) || [];

  const { data: temas } = await supabaseAdmin
    .from('temas')
    .select('id, unidad_id, titulo')
    .in('unidad_id', unidadIds.length > 0 ? unidadIds : ['__none__']);

  // Mapa: tema → unidad → materia
  const temaToUnidad = new Map(temas?.map(t => [t.id, t.unidad_id]) || []);
  const unidadToMateria = new Map(unidades?.map(u => [u.id, u.materia_id]) || []);

  // Resultados de descriptivas para calificadas/pendientes
  const ejerciciosDescriptivos = ejercicios?.filter(e => e.tipo === 'actividad_descriptiva') || [];
  const ejDescIds = ejerciciosDescriptivos.map(e => e.id);

  const { data: resultadosDesc } = await supabaseAdmin
    .from('resultados_ejercicios')
    .select('ejercicio_id, calificacion_manual, caduca_el, estado')
    .in('ejercicio_id', ejDescIds.length > 0 ? ejDescIds : ['__none__']);

  const ahora = new Date();

  // Construir datos por profesor
  return profesores.map(prof => {
    const misAsignaciones = asignaciones?.filter(a => a.profesor_id === prof.id) || [];
    const misEjercicios = ejercicios?.filter(e => e.created_by === prof.id) || [];
    const misSlides = slides?.filter(s => s.created_by === prof.id) || [];
    const misResources = resources?.filter(r => r.created_by === prof.id) || [];

    // Ejercicios últimos 30 días
    const creadosRecientes = misEjercicios.filter(e => e.created_at && e.created_at >= hace30d).length;
    const modificadosRecientes = misEjercicios.filter(e =>
      e.updated_at && e.updated_at >= hace30d && e.updated_at !== e.created_at
    ).length;

    // Cobertura por materia → tema (mínimo 5 ejercicios por tema)
    const materiasAsignadas = misAsignaciones.map((a: any) => ({
      id: a.materias?.id,
      nombre: a.materias?.nombre,
      grupoNombre: a.grupos?.nombre
    })).filter(m => m.id);

    const cobertura = materiasAsignadas.map(mat => {
      const unidsDeMateria = unidades?.filter(u => u.materia_id === mat.id) || [];
      const temasDeMateria = temas?.filter(t => unidsDeMateria.some(u => u.id === t.unidad_id)) || [];

      const detallesTemas = temasDeMateria.map(tema => {
        const ejDelTema = misEjercicios.filter(e => e.tema_id === tema.id).length;
        return { temaId: tema.id, temaTitulo: tema.titulo, ejercicios: ejDelTema, cumple: ejDelTema >= 5 };
      });

      return {
        materiaId: mat.id,
        materiaNombre: mat.nombre,
        grupoNombre: mat.grupoNombre,
        temas: detallesTemas,
        cumpleTotal: detallesTemas.length > 0 && detallesTemas.every(t => t.cumple)
      };
    });

    // Descriptivas calificadas y pendientes
    const misDescriptivos = ejerciciosDescriptivos.filter(e => e.created_by === prof.id);
    const misDescIds = misDescriptivos.map(e => e.id);
    const resultadosMios = resultadosDesc?.filter(r => misDescIds.includes(r.ejercicio_id)) || [];

    const calificadasCount = resultadosMios.filter(r => r.calificacion_manual !== null).length;
    const pendientesCount = resultadosMios.filter(r =>
      r.calificacion_manual === null && r.estado === 'completado'
    ).length;

    // Urgentes: pendientes + caducidad < 3 días
    const tresDias = new Date(ahora.getTime() + 3 * 24 * 60 * 60 * 1000);
    const urgentes = resultadosMios.filter(r =>
      r.calificacion_manual === null &&
      r.estado === 'completado' &&
      r.caduca_el &&
      new Date(r.caduca_el) < tresDias
    ).length;

    return {
      id: prof.id,
      nombre: `${prof.nombre} ${prof.apellidos}`,
      email: prof.email,
      asignaciones: materiasAsignadas,
      metricas: {
        ejerciciosCreados: misEjercicios.length,
        creadosRecientes,
        modificadosRecientes,
        slidesCreadas: misSlides.length,
        recursosSubidos: misResources.length,
        descriptivasCalificadas: calificadasCount,
        descriptivasPendientes: pendientesCount,
        urgentes
      },
      cobertura
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// 4. FECHAS DE EVALUACIÓN
// ────────────────────────────────────────────────────────────────────
export async function getFechasEvaluacion(grupoId: string) {
  const { data, error } = await supabaseAdmin
    .from('fechas_evaluacion')
    .select('id, grupo_id, materia_id, fecha_evaluacion, descripcion, materias(nombre)')
    .eq('grupo_id', grupoId)
    .order('fecha_evaluacion');

  if (error) return { error: error.message };
  return { data: data || [] };
}

export async function upsertFechaEvaluacion(input: {
  id?: string;
  grupo_id: string;
  materia_id: string | null;
  fecha_evaluacion: string;
  descripcion?: string;
  created_by?: string;
}) {
  const payload: any = {
    grupo_id: input.grupo_id,
    materia_id: input.materia_id,
    fecha_evaluacion: input.fecha_evaluacion,
    descripcion: input.descripcion || 'Evaluación Final',
    updated_at: new Date().toISOString()
  };

  if (input.created_by) payload.created_by = input.created_by;
  if (input.id) payload.id = input.id;

  const { data, error } = await supabaseAdmin
    .from('fechas_evaluacion')
    .upsert(payload, { onConflict: 'grupo_id, materia_id' })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath('/dashboard/admin/auditoria');
  revalidatePath('/dashboard/alumno/materias');
  return { data };
}

export async function deleteFechaEvaluacion(id: string) {
  const { error } = await supabaseAdmin
    .from('fechas_evaluacion')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard/admin/auditoria');
  revalidatePath('/dashboard/alumno/materias');
  return { success: true };
}

// ────────────────────────────────────────────────────────────────────
// 5. OBTENER MATERIAS DE UN GRUPO
// ────────────────────────────────────────────────────────────────────
export async function getMateriasDeGrupo(grupoId: string) {
  const { data } = await supabaseAdmin
    .from('asignaciones_profesor')
    .select('materia_id, materias(id, nombre), profiles!asignaciones_profesor_profesor_id_fkey(nombre, apellidos)')
    .eq('grupo_id', grupoId)
    .eq('activo', true);

  return (data || []).map((a: any) => ({
    id: a.materias?.id,
    nombre: a.materias?.nombre,
    profesor: a.profiles ? `${a.profiles.nombre} ${a.profiles.apellidos}` : 'Sin asignar'
  })).filter(m => m.id);
}
