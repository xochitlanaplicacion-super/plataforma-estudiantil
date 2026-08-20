'use server';

import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { requireTenantSession, type TenantRole } from '@/lib/tenant/context';

export type AudienciaEncuesta = 'alumno' | 'profesor';

export interface GrupoEncuesta {
  id: string;
  nombre: string;
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
  grupoId: string | null;
  grupoNombre: string | null;
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
    let grupos: GrupoEncuesta[] = [];

    if (rol === 'profesor') {
      const { data: asignaciones, error } = await admin
        .from('asignaciones_profesor')
        .select('grupo_id')
        .eq('tenant_id', tenantId)
        .eq('profesor_id', user.id)
        .eq('activo', true)
        .not('grupo_id', 'is', null);
      if (error) throw error;

      const ids = [...new Set((asignaciones || []).map((item) => item.grupo_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data, error: gruposError } = await admin
          .from('grupos')
          .select('id, nombre')
          .eq('tenant_id', tenantId)
          .eq('activo', true)
          .in('id', ids)
          .order('nombre');
        if (gruposError) throw gruposError;
        grupos = (data || []) as GrupoEncuesta[];
      }
    } else if (rol === 'superuser' || rol === 'admin') {
      const { data, error } = await admin
        .from('grupos')
        .select('id, nombre')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      grupos = (data || []) as GrupoEncuesta[];
    }

    return {
      success: true as const,
      data: {
        rol,
        grupos,
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
      .select('id, creador_id, titulo, descripcion, audiencia, grupo_id, activa, cierra_en, created_at, updated_at')
      .eq('tenant_id', tenantId);

    if (rol === 'superuser' || rol === 'admin') {
      query = query.eq('creador_id', user.id);
    } else if (rol === 'profesor') {
      query = query.or(`creador_id.eq.${user.id},audiencia.eq.profesor`);
    } else {
      query = query.eq('audiencia', 'alumno');
      query = profile.grupo_id
        ? query.or(`grupo_id.is.null,grupo_id.eq.${profile.grupo_id}`)
        : query.is('grupo_id', null);
    }

    const { data: encuestas, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    if (!encuestas?.length) return { success: true as const, data: [] as EncuestaVista[] };

    const encuestaIds = encuestas.map((item) => item.id);
    const creadorIds = [...new Set(encuestas.map((item) => item.creador_id))];
    const grupoIds = [...new Set(encuestas.map((item) => item.grupo_id).filter(Boolean))] as string[];

    const [opcionesRes, votosRes, perfilesRes, creadoresRes, gruposRes] = await Promise.all([
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
        .select('id, rol, grupo_id')
        .eq('tenant_id', tenantId)
        .eq('estatus', 'activo')
        .in('rol', ['alumno', 'profesor']),
      admin
        .from('profiles')
        .select('id, nombre, apellidos')
        .eq('tenant_id', tenantId)
        .in('id', creadorIds),
      grupoIds.length
        ? admin.from('grupos').select('id, nombre').eq('tenant_id', tenantId).in('id', grupoIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [opcionesRes, votosRes, perfilesRes, creadoresRes, gruposRes]) {
      if (result.error) throw result.error;
    }

    const opciones = opcionesRes.data || [];
    const votos = votosRes.data || [];
    const perfiles = perfilesRes.data || [];
    const creadorPorId = new Map(
      (creadoresRes.data || []).map((item) => [
        item.id,
        `${item.nombre || ''} ${item.apellidos || ''}`.trim() || 'Usuario',
      ])
    );
    const grupoPorId = new Map((gruposRes.data || []).map((item) => [item.id, item.nombre]));
    const now = Date.now();

    const data: EncuestaVista[] = encuestas.map((encuesta) => {
      const votosEncuesta = votos.filter((voto) => voto.encuesta_id === encuesta.id);
      const totalVotos = votosEncuesta.length;
      const votoUsuario = votosEncuesta.find((voto) => voto.votante_id === user.id)?.opcion_id || null;
      const puedeGestionar = encuesta.creador_id === user.id;
      const cerrada = !encuesta.activa || Boolean(encuesta.cierra_en && new Date(encuesta.cierra_en).getTime() <= now);
      const destinatarios = perfiles.filter((item) => {
        if (item.rol !== encuesta.audiencia) return false;
        return !encuesta.grupo_id || item.grupo_id === encuesta.grupo_id;
      });
      const puedeVotar = !puedeGestionar
        && !cerrada
        && rol === encuesta.audiencia
        && (!encuesta.grupo_id || profile.grupo_id === encuesta.grupo_id);

      return {
        id: encuesta.id,
        titulo: encuesta.titulo,
        descripcion: encuesta.descripcion,
        audiencia: encuesta.audiencia as AudienciaEncuesta,
        grupoId: encuesta.grupo_id,
        grupoNombre: encuesta.grupo_id ? grupoPorId.get(encuesta.grupo_id) || 'Grupo' : null,
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
