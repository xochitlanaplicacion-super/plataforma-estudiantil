'use server';

import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { requireTenantSession, type TenantRole } from '@/lib/tenant/context';

export type AudienciaEncuesta = 'alumno' | 'profesor';

export interface NivelEncuesta {
  id: string;
  nombre: string;
}

export interface CarreraEncuesta {
  id: string;
  nombre: string;
  nivelId: string;
}

export interface GradoEncuesta {
  id: string;
  nombre: string;
  carreraId: string;
}

export interface GrupoEncuesta {
  id: string;
  nombre: string;
  turno: string | null;
  carreraId: string;
  gradoId: string;
}

export interface OpcionEncuesta {
  id: string;
  texto: string;
  posicion: number;
  votos: number;
  porcentaje: number;
}

export interface EncuestaVista {
  id: string;
  titulo: string;
  descripcion: string | null;
  audiencia: AudienciaEncuesta;
  nivelId: string | null;
  carreraId: string | null;
  gradoId: string | null;
  grupoId: string | null;
  destinoNombre: string;
  restringirAAsignaciones: boolean;
  activa: boolean;
  cierraEn: string | null;
  createdAt: string;
  updatedAt: string;
  creadorId: string;
  creadorNombre: string;
  opciones: OpcionEncuesta[];
  votoUsuario: string | null;
  totalVotos: number;
  totalDestinatarios: number;
  puedeGestionar: boolean;
  puedeVotar: boolean;
  cerrada: boolean;
  mostrarResultados: boolean;
}

export interface EncuestaInput {
  titulo: string;
  descripcion?: string | null;
  audiencia: AudienciaEncuesta;
  nivelId?: string | null;
  carreraId?: string | null;
  gradoId?: string | null;
  grupoId?: string | null;
  opciones: string[];
  cierraEn?: string | null;
  activa?: boolean;
}

const MENSAJERIA_PATHS = [
  '/dashboard/admin/crm/mensajeria',
  '/dashboard/profesor/mensajes',
  '/dashboard/alumno/mensajes',
];

function revalidarMensajeria() {
  for (const path of MENSAJERIA_PATHS) revalidatePath(path);
}

function fechaRpc(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('La fecha de cierre no es válida');
  return date.toISOString();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'No fue posible completar la operación';
}

export async function obtenerContextoEncuestas() {
  noStore();
  try {
    const { admin, profile, tenantId, user } = await requireTenantSession();
    const rol = profile.rol as TenantRole;
    const puedeCrear = ['superuser', 'admin', 'profesor'].includes(rol);
    let gruposPermitidos: Set<string> | null = null;
    if (rol === 'profesor') {
      const { data: asignaciones, error } = await admin
        .from('asignaciones_profesor')
        .select('grupo_id')
        .eq('tenant_id', tenantId)
        .eq('profesor_id', user.id)
        .eq('activo', true)
        .not('grupo_id', 'is', null);
      if (error) throw error;
      gruposPermitidos = new Set(
        (asignaciones || []).map((item) => item.grupo_id).filter(Boolean) as string[]
      );
    }

    const [nivelesRes, carrerasRes, gradosRes, gruposRes] = await Promise.all([
      admin.from('niveles').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre'),
      admin.from('carreras').select('id, nombre, nivel_id').eq('tenant_id', tenantId).eq('activo', true).order('nombre'),
      admin.from('grados').select('id, nombre, carrera_id').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      admin.from('grupos').select('id, nombre, turno, carrera_id, grado_id').eq('tenant_id', tenantId).eq('activo', true).order('nombre'),
    ]);
    for (const result of [nivelesRes, carrerasRes, gradosRes, gruposRes]) {
      if (result.error) throw result.error;
    }

    const gruposBase = (gruposRes.data || []).filter(
      (grupo) => !gruposPermitidos || gruposPermitidos.has(grupo.id)
    );
    const gradoIds = new Set(gruposBase.map((grupo) => grupo.grado_id).filter(Boolean));
    const gradosBase = (gradosRes.data || []).filter(
      (grado) => !gruposPermitidos || gradoIds.has(grado.id)
    );
    const carreraIds = new Set(gruposBase.map((grupo) => grupo.carrera_id).filter(Boolean));
    const carrerasBase = (carrerasRes.data || []).filter(
      (carrera) => !gruposPermitidos || carreraIds.has(carrera.id)
    );
    const nivelIds = new Set(carrerasBase.map((carrera) => carrera.nivel_id).filter(Boolean));
    const nivelesBase = (nivelesRes.data || []).filter(
      (nivel) => !gruposPermitidos || nivelIds.has(nivel.id)
    );

    return {
      success: true as const,
      data: {
        rol,
        niveles: nivelesBase as NivelEncuesta[],
        carreras: carrerasBase.map((item) => ({ id: item.id, nombre: item.nombre, nivelId: item.nivel_id })) as CarreraEncuesta[],
        grados: gradosBase.map((item) => ({ id: item.id, nombre: item.nombre, carreraId: item.carrera_id })) as GradoEncuesta[],
        grupos: gruposBase.map((item) => ({
          id: item.id,
          nombre: item.nombre,
          turno: item.turno,
          carreraId: item.carrera_id,
          gradoId: item.grado_id,
        })) as GrupoEncuesta[],
        puedeCrear,
        puedeEncuestarProfesores: rol === 'superuser' || rol === 'admin',
      },
    };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function obtenerEncuestas() {
  noStore();
  try {
    const { admin, profile, tenantId, user } = await requireTenantSession();
    const rol = profile.rol as TenantRole;

    let query = admin
      .from('encuestas')
      .select('id, creador_id, titulo, descripcion, audiencia, nivel_id, carrera_id, grado_id, grupo_id, restringir_a_asignaciones, activa, cierra_en, created_at, updated_at')
      .eq('tenant_id', tenantId);

    if (rol === 'superuser' || rol === 'admin') {
      query = query.eq('creador_id', user.id);
    } else if (rol === 'profesor') {
      query = query.or(`creador_id.eq.${user.id},audiencia.eq.profesor`);
    } else {
      query = query.eq('audiencia', 'alumno');
    }

    const { data: encuestasBase, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    if (!encuestasBase?.length) return { success: true as const, data: [] as EncuestaVista[] };

    const [perfilesRes, gruposRes, carrerasRes, gradosRes, nivelesRes, asignacionesRes] = await Promise.all([
      admin
        .from('profiles')
        .select('id, rol, carrera_id, grupo_id')
        .eq('tenant_id', tenantId)
        .eq('estatus', 'activo')
        .in('rol', ['alumno', 'profesor']),
      admin
        .from('grupos')
        .select('id, nombre, turno, carrera_id, grado_id')
        .eq('tenant_id', tenantId)
        .order('nombre'),
      admin
        .from('carreras')
        .select('id, nombre, nivel_id')
        .eq('tenant_id', tenantId)
        .order('nombre'),
      admin
        .from('grados')
        .select('id, nombre, carrera_id')
        .eq('tenant_id', tenantId)
        .order('orden'),
      admin.from('niveles').select('id, nombre').eq('tenant_id', tenantId).order('nombre'),
      admin
        .from('asignaciones_profesor')
        .select('profesor_id, nivel_id, carrera_id, grupo_id')
        .eq('tenant_id', tenantId)
        .eq('activo', true),
    ]);
    for (const result of [perfilesRes, gruposRes, carrerasRes, gradosRes, nivelesRes, asignacionesRes]) {
      if (result.error) throw result.error;
    }

    const perfiles = perfilesRes.data || [];
    const gruposPorId = new Map((gruposRes.data || []).map((item) => [item.id, item]));
    const carrerasPorId = new Map((carrerasRes.data || []).map((item) => [item.id, item]));
    const gradosPorId = new Map((gradosRes.data || []).map((item) => [item.id, item]));
    const nivelesPorId = new Map((nivelesRes.data || []).map((item) => [item.id, item]));
    const asignaciones = asignacionesRes.data || [];

    const coincideDestino = (encuesta: any, perfilDestino: any) => {
      if (perfilDestino.rol !== encuesta.audiencia) return false;

      if (encuesta.audiencia === 'alumno') {
        const grupo = perfilDestino.grupo_id ? gruposPorId.get(perfilDestino.grupo_id) : null;
        const carreraId = perfilDestino.carrera_id || grupo?.carrera_id || null;
        const carrera = carreraId ? carrerasPorId.get(carreraId) : null;
        if (encuesta.nivel_id && carrera?.nivel_id !== encuesta.nivel_id) return false;
        if (encuesta.carrera_id && carreraId !== encuesta.carrera_id) return false;
        if (encuesta.grado_id && grupo?.grado_id !== encuesta.grado_id) return false;
        if (encuesta.grupo_id && perfilDestino.grupo_id !== encuesta.grupo_id) return false;
        if (encuesta.restringir_a_asignaciones) {
          return Boolean(perfilDestino.grupo_id && asignaciones.some(
            (item) => item.profesor_id === encuesta.creador_id && item.grupo_id === perfilDestino.grupo_id
          ));
        }
        return true;
      }

      const tieneFiltro = Boolean(encuesta.nivel_id || encuesta.carrera_id || encuesta.grado_id || encuesta.grupo_id);
      if (!tieneFiltro) return true;
      return asignaciones.some((item) => {
        if (item.profesor_id !== perfilDestino.id) return false;
        const grupo = item.grupo_id ? gruposPorId.get(item.grupo_id) : null;
        const carreraId = item.carrera_id || grupo?.carrera_id || null;
        const carrera = carreraId ? carrerasPorId.get(carreraId) : null;
        if (encuesta.nivel_id && (item.nivel_id || carrera?.nivel_id) !== encuesta.nivel_id) return false;
        if (encuesta.carrera_id && carreraId !== encuesta.carrera_id) return false;
        if (encuesta.grado_id && grupo?.grado_id !== encuesta.grado_id) return false;
        if (encuesta.grupo_id && item.grupo_id !== encuesta.grupo_id) return false;
        return true;
      });
    };

    const perfilActual = perfiles.find((item) => item.id === user.id);
    const encuestas = encuestasBase.filter((encuesta) => (
      encuesta.creador_id === user.id
      || Boolean(perfilActual && coincideDestino(encuesta, perfilActual))
    ));
    if (!encuestas.length) return { success: true as const, data: [] as EncuestaVista[] };

    const encuestaIds = encuestas.map((item) => item.id);
    const creadorIds = [...new Set(encuestas.map((item) => item.creador_id))];
    const [opcionesRes, votosRes, creadoresRes] = await Promise.all([
      admin
        .from('encuesta_opciones')
        .select('id, encuesta_id, texto, posicion')
        .eq('tenant_id', tenantId)
        .in('encuesta_id', encuestaIds)
        .order('posicion'),
      admin
        .from('encuesta_votos')
        .select('encuesta_id, opcion_id, votante_id')
        .eq('tenant_id', tenantId)
        .in('encuesta_id', encuestaIds),
      admin
        .from('profiles')
        .select('id, nombre, apellidos')
        .eq('tenant_id', tenantId)
        .in('id', creadorIds),
    ]);
    for (const result of [opcionesRes, votosRes, creadoresRes]) {
      if (result.error) throw result.error;
    }

    const opciones = opcionesRes.data || [];
    const votos = votosRes.data || [];
    const creadorPorId = new Map(
      (creadoresRes.data || []).map((item) => [
        item.id,
        `${item.nombre || ''} ${item.apellidos || ''}`.trim() || 'Usuario',
      ])
    );
    const now = Date.now();

    const data: EncuestaVista[] = encuestas.map((encuesta) => {
      const votosEncuesta = votos.filter((voto) => voto.encuesta_id === encuesta.id);
      const totalVotos = votosEncuesta.length;
      const votoUsuario = votosEncuesta.find((voto) => voto.votante_id === user.id)?.opcion_id || null;
      const puedeGestionar = encuesta.creador_id === user.id;
      const cerrada = !encuesta.activa || Boolean(encuesta.cierra_en && new Date(encuesta.cierra_en).getTime() <= now);
      const destinatarios = perfiles.filter((item) => coincideDestino(encuesta, item));
      const puedeVotar = !puedeGestionar
        && !cerrada
        && Boolean(perfilActual && coincideDestino(encuesta, perfilActual));

      const destinoPartes: string[] = [];
      if (encuesta.nivel_id) destinoPartes.push(nivelesPorId.get(encuesta.nivel_id)?.nombre || 'Nivel');
      if (encuesta.carrera_id) destinoPartes.push(carrerasPorId.get(encuesta.carrera_id)?.nombre || 'Carrera');
      if (encuesta.grado_id) destinoPartes.push(gradosPorId.get(encuesta.grado_id)?.nombre || 'Grado');
      if (encuesta.grupo_id) {
        const grupo = gruposPorId.get(encuesta.grupo_id);
        destinoPartes.push(`${grupo?.nombre || 'Grupo'}${grupo?.turno ? ` · ${grupo.turno}` : ''}`);
      }
      const destinoNombre = destinoPartes.length
        ? destinoPartes.join(' › ')
        : encuesta.restringir_a_asignaciones
          ? 'Todos mis alumnos asignados'
          : `Todos los ${encuesta.audiencia === 'alumno' ? 'alumnos' : 'profesores'}`;

      return {
        id: encuesta.id,
        titulo: encuesta.titulo,
        descripcion: encuesta.descripcion,
        audiencia: encuesta.audiencia as AudienciaEncuesta,
        nivelId: encuesta.nivel_id,
        carreraId: encuesta.carrera_id,
        gradoId: encuesta.grado_id,
        grupoId: encuesta.grupo_id,
        destinoNombre,
        restringirAAsignaciones: encuesta.restringir_a_asignaciones,
        activa: encuesta.activa,
        cierraEn: encuesta.cierra_en,
        createdAt: encuesta.created_at,
        updatedAt: encuesta.updated_at,
        creadorId: encuesta.creador_id,
        creadorNombre: creadorPorId.get(encuesta.creador_id) || 'Usuario',
        opciones: opciones
          .filter((opcion) => opcion.encuesta_id === encuesta.id)
          .map((opcion) => {
            const cantidad = votosEncuesta.filter((voto) => voto.opcion_id === opcion.id).length;
            return {
              id: opcion.id,
              texto: opcion.texto,
              posicion: opcion.posicion,
              votos: cantidad,
              porcentaje: totalVotos ? Math.round((cantidad / totalVotos) * 100) : 0,
            };
          }),
        votoUsuario,
        totalVotos,
        totalDestinatarios: destinatarios.length,
        puedeGestionar,
        puedeVotar,
        cerrada,
        mostrarResultados: puedeGestionar || Boolean(votoUsuario) || cerrada,
      };
    });

    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: errorMessage(error), data: [] as EncuestaVista[] };
  }
}

export async function crearEncuesta(input: EncuestaInput) {
  try {
    const { supabase } = await requireTenantSession(['superuser', 'admin', 'profesor']);
    const { data, error } = await (supabase as any).rpc('crear_encuesta', {
      p_titulo: input.titulo,
      p_descripcion: input.descripcion || null,
      p_audiencia: input.audiencia,
      p_nivel_id: input.nivelId || null,
      p_carrera_id: input.carreraId || null,
      p_grado_id: input.gradoId || null,
      p_grupo_id: input.grupoId || null,
      p_opciones: input.opciones,
      p_cierra_en: fechaRpc(input.cierraEn),
    });
    if (error) throw error;
    revalidarMensajeria();
    return { success: true as const, id: data as string };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function editarEncuesta(encuestaId: string, input: EncuestaInput) {
  try {
    const { supabase } = await requireTenantSession(['superuser', 'admin', 'profesor']);
    const { data, error } = await (supabase as any).rpc('actualizar_encuesta', {
      p_encuesta_id: encuestaId,
      p_titulo: input.titulo,
      p_descripcion: input.descripcion || null,
      p_audiencia: input.audiencia,
      p_nivel_id: input.nivelId || null,
      p_carrera_id: input.carreraId || null,
      p_grado_id: input.gradoId || null,
      p_grupo_id: input.grupoId || null,
      p_opciones: input.opciones,
      p_cierra_en: fechaRpc(input.cierraEn),
      p_activa: input.activa ?? true,
    });
    if (error) throw error;
    revalidarMensajeria();
    return { success: true as const, votosReiniciados: Boolean(data) };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function borrarEncuesta(encuestaId: string) {
  try {
    const { supabase } = await requireTenantSession(['superuser', 'admin', 'profesor']);
    const { error } = await (supabase as any).rpc('eliminar_encuesta', { p_encuesta_id: encuestaId });
    if (error) throw error;
    revalidarMensajeria();
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function votarEncuesta(encuestaId: string, opcionId: string) {
  try {
    const { supabase } = await requireTenantSession(['alumno', 'profesor']);
    const { error } = await (supabase as any).rpc('votar_encuesta', {
      p_encuesta_id: encuestaId,
      p_opcion_id: opcionId,
    });
    if (error) throw error;
    revalidarMensajeria();
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errorMessage(error) };
  }
}
