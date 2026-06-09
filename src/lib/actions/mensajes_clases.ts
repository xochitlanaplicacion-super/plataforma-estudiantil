'use server';

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type TipoMensajeClase = 'INDIVIDUAL' | 'AVISO' | 'CHAT_GRUPAL';

export async function enviarMensajeClase({
  remitente_id,
  destinatario_id,
  materia_id,
  grupo_id,
  tipo_mensaje,
  contenido,
}: {
  remitente_id: string;
  destinatario_id?: string | null;
  materia_id?: string | null;
  grupo_id?: string | null;
  tipo_mensaje: TipoMensajeClase;
  contenido: string;
}) {
  try {
    const { data, error } = await supabaseAdmin
      .from('mensajes_clases')
      .insert({
        remitente_id,
        destinatario_id: destinatario_id || null,
        materia_id: materia_id || null,
        grupo_id: grupo_id || null,
        tipo_mensaje,
        contenido,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    console.error('Error enviando mensaje clase:', err);
    return { success: false, error: err.message };
  }
}

export async function obtenerAvisosClase(userId: string, rol: string) {
  noStore();
  try {
    let orConditions: string[] = [];
    
    if (rol === 'profesor') {
      const { data: asig } = await supabaseAdmin.from('asignaciones_profesor').select('grupo_id, materia_id').eq('profesor_id', userId).eq('activo', true);
      if (!asig || asig.length === 0) return { success: true, data: [] };
      const asigConds = asig.map(a => `and(grupo_id.eq.${a.grupo_id},materia_id.eq.${a.materia_id})`);
      orConditions = asigConds;
    } else if (rol === 'alumno') {
      const { data: profile } = await supabaseAdmin.from('profiles').select('grupo_id').eq('id', userId).single();
      if (!profile || !profile.grupo_id) return { success: true, data: [] };
      orConditions = [`grupo_id.eq.${profile.grupo_id}`];
    } else {
      return { success: true, data: [] };
    }

    const { data: avisos, error } = await supabaseAdmin
      .from('mensajes_clases')
      .select(`
        *,
        remitente:remitente_id(nombre, apellidos),
        materia:materia_id(nombre),
        grupo:grupo_id(nombre)
      `)
      .eq('tipo_mensaje', 'AVISO')
      .or(orConditions.join(','))
      .order('created_at', { ascending: false });

    if (error) throw error;

    const avisosIds = (avisos || []).map(a => a.id);
    let vistosSet = new Set<string>();
    let conteoVistos: Record<string, number> = {};
    
    if (avisosIds.length > 0) {
      const { data: vistos } = await supabaseAdmin
        .from('mensajes_clases_vistos')
        .select('mensaje_id, usuario_id')
        .in('mensaje_id', avisosIds);

      vistosSet = new Set((vistos || []).filter(v => v.usuario_id === userId).map(v => v.mensaje_id));
      
      (vistos || []).forEach(v => {
        conteoVistos[v.mensaje_id] = (conteoVistos[v.mensaje_id] || 0) + 1;
      });
    }

    // Contar total de alumnos por grupo
    let totalAlumnosPorGrupo: Record<string, number> = {};
    const grupoIds = [...new Set((avisos || []).map(a => a.grupo_id).filter(Boolean))];
    if (grupoIds.length > 0) {
      const { data: conteoAlumnos } = await supabaseAdmin
        .from('profiles')
        .select('grupo_id')
        .in('grupo_id', grupoIds)
        .eq('rol', 'alumno');
        
      (conteoAlumnos || []).forEach(a => {
        if (a.grupo_id) {
          totalAlumnosPorGrupo[a.grupo_id] = (totalAlumnosPorGrupo[a.grupo_id] || 0) + 1;
        }
      });
    }

    const result = (avisos || []).map(a => ({
      ...a,
      remitente_nombre: a.remitente ? `${(a.remitente as any).nombre} ${(a.remitente as any).apellidos}` : 'Usuario',
      materia_nombre: (a.materia as any)?.nombre || '',
      grupo_nombre: (a.grupo as any)?.nombre || '',
      yaVisto: vistosSet.has(a.id),
      vistosCount: conteoVistos[a.id] || 0,
      totalAlumnos: totalAlumnosPorGrupo[a.grupo_id] || 0
    }));

    return { success: true, data: result };
  } catch (err: any) {
    console.error('Error obteniendo avisos clase:', err);
    return { success: false, data: [], error: err.message };
  }
}

export async function obtenerDetalleVistosAviso(avisoId: string, grupoId: string) {
  noStore();
  try {
    // Obtener todos los alumnos del grupo
    const { data: alumnos } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos')
      .eq('grupo_id', grupoId)
      .eq('rol', 'alumno')
      .order('nombre', { ascending: true });

    if (!alumnos) return { success: true, data: [] };

    // Obtener los registros de quiénes han visto este aviso
    const { data: vistos } = await supabaseAdmin
      .from('mensajes_clases_vistos')
      .select('usuario_id')
      .eq('mensaje_id', avisoId);

    const vistosSet = new Set((vistos || []).map(v => v.usuario_id));

    const detalle = alumnos.map(a => ({
      id: a.id,
      nombre: `${a.nombre} ${a.apellidos}`,
      visto: vistosSet.has(a.id)
    }));

    return { success: true, data: detalle };
  } catch (err: any) {
    return { success: false, data: [], error: err.message };
  }
}

export async function eliminarMensajeClase(mensajeId: string) {
  noStore();
  try {
    const { error } = await supabaseAdmin.from('mensajes_clases').delete().eq('id', mensajeId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function obtenerChatGrupal(materia_id: string, grupo_id: string) {
  noStore();
  try {
    const { data, error } = await supabaseAdmin
      .from('mensajes_clases')
      .select(`
        *,
        remitente:remitente_id(nombre, apellidos, rol)
      `)
      .eq('tipo_mensaje', 'CHAT_GRUPAL')
      .eq('materia_id', materia_id)
      .eq('grupo_id', grupo_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    const result = (data || []).map(m => ({
      ...m,
      remitente_nombre: m.remitente ? `${(m.remitente as any).nombre} ${(m.remitente as any).apellidos}` : 'Usuario',
      remitente_rol: (m.remitente as any)?.rol || ''
    }));

    return { success: true, data: result };
  } catch (err: any) {
    console.error('Error obteniendo chat grupal:', err);
    return { success: false, data: [], error: err.message };
  }
}

export async function obtenerChatIndividual(userId1: string, userId2: string) {
  noStore();
  try {
    const { data, error } = await supabaseAdmin
      .from('mensajes_clases')
      .select('*')
      .eq('tipo_mensaje', 'INDIVIDUAL')
      .or(`and(remitente_id.eq.${userId1},destinatario_id.eq.${userId2}),and(remitente_id.eq.${userId2},destinatario_id.eq.${userId1})`)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    console.error('Error obteniendo chat individual:', err);
    return { success: false, data: [], error: err.message };
  }
}

export async function obtenerContactosProfesor(profesorId: string) {
  noStore();
  try {
    // Obtener las asignaciones activas del profesor (grupos y materias)
    const { data: asig } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        materia_id, grupo_id,
        materias:materia_id(nombre),
        grupos:grupo_id(nombre)
      `)
      .eq('profesor_id', profesorId)
      .eq('activo', true);

    if (!asig || asig.length === 0) return { success: true, data: [] };

    // Obtener los grupo_ids únicos del profesor
    const grupoIds = [...new Set(asig.map(a => a.grupo_id))];

    // Buscar alumnos directamente desde profiles (igual que Listas de Grupos)
    const { data: alumnos } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos, matricula, grupo_id')
      .in('grupo_id', grupoIds)
      .eq('rol', 'alumno')
      .eq('estatus', 'activo');

    if (!alumnos || alumnos.length === 0) return { success: true, data: [] };

    // Crear un mapa de grupo_id -> grupo_nombre
    const grupoNombresMap = new Map<string, string>();
    asig.forEach(a => {
      if (!grupoNombresMap.has(a.grupo_id)) {
        grupoNombresMap.set(a.grupo_id, (a.grupos as any)?.nombre || '');
      }
    });

    // Construir la lista de contactos agrupados por alumno
    const contactos = alumnos.map(al => ({
      alumno_id: al.id,
      alumno_nombre: `${al.nombre || ''} ${al.apellidos || ''}`.trim(),
      matricula: al.matricula || '',
      grupo_id: al.grupo_id,
      grupo_nombre: grupoNombresMap.get(al.grupo_id) || '',
      materia_nombre: '' // No se diferencia por materia en chat directo
    }));

    // Ordenar por grupo y luego por nombre
    contactos.sort((a, b) => {
      const gComp = a.grupo_nombre.localeCompare(b.grupo_nombre);
      if (gComp !== 0) return gComp;
      return a.alumno_nombre.localeCompare(b.alumno_nombre);
    });

    return { success: true, data: contactos };
  } catch (err: any) {
    console.error('Error obteniendo contactos profesor:', err);
    return { success: false, data: [], error: err.message };
  }
}

export async function obtenerGruposProfesor(profesorId: string) {
  noStore();
  try {
    const { data: asig } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('materia_id, grupo_id, materias(nombre), grupos(nombre)')
      .eq('profesor_id', profesorId)
      .eq('activo', true);

    if (!asig) return { success: true, data: [] };

    const gruposMap = new Map();
    asig.forEach(a => {
      const key = `${a.materia_id}_${a.grupo_id}`;
      if (!gruposMap.has(key)) {
        gruposMap.set(key, {
          materia_id: a.materia_id,
          materia_nombre: (a.materias as any)?.nombre || '',
          grupo_id: a.grupo_id,
          grupo_nombre: (a.grupos as any)?.nombre || ''
        });
      }
    });

    return { success: true, data: Array.from(gruposMap.values()) };
  } catch (err: any) {
    return { success: false, data: [], error: err.message };
  }
}

export async function obtenerContactosAlumno(alumnoId: string) {
  noStore();
  try {
    // Alumno: obtener grupo_id directamente de su perfil, igual que en Mis Materias
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('grupo_id, grupos(nombre)')
      .eq('id', alumnoId)
      .single();

    if (!profile || !profile.grupo_id) return { success: true, data: [] };
    
    // Obtener profesores asignados a ese grupo
    const { data: asig } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        profesor_id, materia_id, grupo_id,
        profesor:profesor_id(id, nombre, apellidos),
        materias:materia_id(nombre)
      `)
      .eq('grupo_id', profile.grupo_id)
      .eq('activo', true);

    const contactosMap = new Map<string, any>();
    const grupoNombre = (profile.grupos as any)?.nombre || 'Mi Grupo';
    
    (asig || []).forEach(a => {
      const materiaNombre = (a.materias as any)?.nombre;
      
      if(a.profesor) {
        const profId = (a.profesor as any).id;
        if (!contactosMap.has(profId)) {
          contactosMap.set(profId, {
            profesor_id: profId,
            profesor_nombre: `${(a.profesor as any).nombre} ${(a.profesor as any).apellidos}`,
            materias: [materiaNombre],
            grupo_nombre: grupoNombre
          });
        } else {
          const existing = contactosMap.get(profId);
          if (!existing.materias.includes(materiaNombre)) {
            existing.materias.push(materiaNombre);
          }
        }
      }
    });

    const contactos = Array.from(contactosMap.values()).map(c => ({
      ...c,
      materia_nombre: c.materias.join(', ')
    }));

    return { success: true, data: contactos };
  } catch (err: any) {
    console.error('Error obteniendo contactos alumno:', err);
    return { success: false, data: [], error: err.message };
  }
}

export async function obtenerGruposAlumno(alumnoId: string) {
  noStore();
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('grupo_id, grupos(nombre)')
      .eq('id', alumnoId)
      .single();

    if (!profile || !profile.grupo_id) return { success: true, data: [] };

    const { data: asig } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('materia_id, materias(nombre)')
      .eq('grupo_id', profile.grupo_id)
      .eq('activo', true);

    if (!asig) return { success: true, data: [] };

    const gruposMap = new Map();
    const grupo_nombre = (profile.grupos as any)?.nombre || 'Mi Grupo';
    
    asig.forEach(a => {
      const key = `${a.materia_id}_${profile.grupo_id}`;
      if (!gruposMap.has(key)) {
        gruposMap.set(key, {
          materia_id: a.materia_id,
          materia_nombre: (a.materias as any)?.nombre || '',
          grupo_id: profile.grupo_id,
          grupo_nombre: grupo_nombre
        });
      }
    });

    return { success: true, data: Array.from(gruposMap.values()) };
  } catch (err: any) {
    return { success: false, data: [], error: err.message };
  }
}

export async function marcarMensajeClaseLeido(mensajeId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('mensajes_clases')
      .update({ leido: true })
      .eq('id', mensajeId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function marcarAvisoClaseVisto(mensajeId: string, usuarioId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('mensajes_clases_vistos')
      .upsert({ mensaje_id: mensajeId, usuario_id: usuarioId }, { onConflict: 'mensaje_id,usuario_id' });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Obtiene el conteo de mensajes grupales no vistos, agrupados por materia_id+grupo_id
export async function obtenerUnreadGrupales(userId: string, grupoIds: { materia_id: string; grupo_id: string }[]) {
  noStore();
  try {
    if (grupoIds.length === 0) return { success: true, data: {} };

    // Obtener todos los mensajes grupales de los grupos del usuario
    const orConditions = grupoIds.map(g => `and(grupo_id.eq.${g.grupo_id},materia_id.eq.${g.materia_id})`);
    
    const { data: mensajes, error } = await supabaseAdmin
      .from('mensajes_clases')
      .select('id, materia_id, grupo_id')
      .eq('tipo_mensaje', 'CHAT_GRUPAL')
      .neq('remitente_id', userId)
      .or(orConditions.join(','));

    if (error) throw error;
    if (!mensajes || mensajes.length === 0) return { success: true, data: {} };

    // Obtener cuáles ya vio el usuario
    const { data: vistos } = await supabaseAdmin
      .from('mensajes_clases_vistos')
      .select('mensaje_id')
      .eq('usuario_id', userId)
      .in('mensaje_id', mensajes.map(m => m.id));

    const vistosSet = new Set((vistos || []).map(v => v.mensaje_id));

    // Contar no vistos por grupo
    const counts: Record<string, number> = {};
    for (const m of mensajes) {
      if (!vistosSet.has(m.id)) {
        const key = `${m.materia_id}_${m.grupo_id}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    }

    return { success: true, data: counts };
  } catch (err: any) {
    console.error('Error obteniendo unread grupales:', err);
    return { success: false, data: {} };
  }
}

// Marca todos los mensajes grupales de un grupo como vistos por el usuario
export async function marcarGrupalVisto(userId: string, materia_id: string, grupo_id: string) {
  try {
    // Obtener mensajes no vistos de este grupo
    const { data: mensajes } = await supabaseAdmin
      .from('mensajes_clases')
      .select('id')
      .eq('tipo_mensaje', 'CHAT_GRUPAL')
      .eq('materia_id', materia_id)
      .eq('grupo_id', grupo_id)
      .neq('remitente_id', userId);

    if (!mensajes || mensajes.length === 0) return { success: true };

    // Obtener cuáles ya están vistos
    const { data: yaVistos } = await supabaseAdmin
      .from('mensajes_clases_vistos')
      .select('mensaje_id')
      .eq('usuario_id', userId)
      .in('mensaje_id', mensajes.map(m => m.id));

    const vistosSet = new Set((yaVistos || []).map(v => v.mensaje_id));
    const nuevos = mensajes.filter(m => !vistosSet.has(m.id));

    if (nuevos.length > 0) {
      const rows = nuevos.map(m => ({ mensaje_id: m.id, usuario_id: userId }));
      await supabaseAdmin.from('mensajes_clases_vistos').upsert(rows, { onConflict: 'mensaje_id,usuario_id' });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function verificarMensajesClasePendientes(userId: string, rol: string) {
  noStore();
  try {
    // 1. Revisar mensajes directos sin leer
    const { count: directos } = await supabaseAdmin
      .from('mensajes_clases')
      .select('*', { count: 'exact', head: true })
      .eq('tipo_mensaje', 'INDIVIDUAL')
      .eq('destinatario_id', userId)
      .eq('leido', false);
      
    if (directos && directos > 0) return { success: true, hasUnread: true };

    // 2. Revisar avisos y grupales no vistos
    let orConditions: string[] = [];
    if (rol === 'profesor') {
      const { data: asig } = await supabaseAdmin.from('asignaciones_profesor').select('grupo_id, materia_id').eq('profesor_id', userId).eq('activo', true);
      if (asig && asig.length > 0) {
        orConditions = asig.map(a => `and(grupo_id.eq.${a.grupo_id},materia_id.eq.${a.materia_id})`);
      }
    } else if (rol === 'alumno') {
      const { data: profile } = await supabaseAdmin.from('profiles').select('grupo_id').eq('id', userId).single();
      if (profile && profile.grupo_id) {
        orConditions = [`grupo_id.eq.${profile.grupo_id}`];
      }
    }

    if (orConditions.length > 0) {
      const { data: mensajes } = await supabaseAdmin
        .from('mensajes_clases')
        .select('id')
        .in('tipo_mensaje', ['AVISO', 'CHAT_GRUPAL'])
        .neq('remitente_id', userId)
        .or(orConditions.join(','));

      if (mensajes && mensajes.length > 0) {
        const { data: vistos } = await supabaseAdmin
          .from('mensajes_clases_vistos')
          .select('mensaje_id')
          .eq('usuario_id', userId)
          .in('mensaje_id', mensajes.map(m => m.id));
        
        if (!vistos || vistos.length < mensajes.length) {
          return { success: true, hasUnread: true };
        }
      }
    }

    return { success: true, hasUnread: false };
  } catch (err) {
    return { success: false, hasUnread: false };
  }
}

export async function obtenerMensajesGrupalesPendientes(userId: string, rol: string) {
  noStore();
  try {
    let orConditions: string[] = [];
    if (rol === 'profesor') {
      const { data: asig } = await supabaseAdmin.from('asignaciones_profesor').select('grupo_id, materia_id').eq('profesor_id', userId).eq('activo', true);
      if (asig && asig.length > 0) {
        orConditions = asig.map(a => `and(grupo_id.eq.${a.grupo_id},materia_id.eq.${a.materia_id})`);
      }
    } else if (rol === 'alumno') {
      const { data: profile } = await supabaseAdmin.from('profiles').select('grupo_id').eq('id', userId).single();
      if (profile && profile.grupo_id) {
        orConditions = [`grupo_id.eq.${profile.grupo_id}`];
      }
    }

    if (orConditions.length > 0) {
      const { data: mensajes } = await supabaseAdmin
        .from('mensajes_clases')
        .select('*, profiles:remitente_id(nombre, apellidos, rol), materias(nombre)')
        .in('tipo_mensaje', ['AVISO', 'CHAT_GRUPAL'])
        .neq('remitente_id', userId)
        .or(orConditions.join(','));

      if (mensajes && mensajes.length > 0) {
        const { data: vistos } = await supabaseAdmin
          .from('mensajes_clases_vistos')
          .select('mensaje_id')
          .eq('usuario_id', userId)
          .in('mensaje_id', mensajes.map(m => m.id));
        
        const vistosIds = new Set((vistos || []).map(v => v.mensaje_id));
        const noVistos = mensajes.filter(m => !vistosIds.has(m.id));
        
        if (noVistos.length > 0) {
           return { success: true, data: noVistos };
        }
      }
    }

    return { success: true, data: [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

