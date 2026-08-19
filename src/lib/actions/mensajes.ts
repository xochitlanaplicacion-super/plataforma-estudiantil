
'use server';

import { requireTenantSession } from '@/lib/tenant/context';

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

// ─── TIPOS ──────────────────────────────────────────────────────────────────

export type TipoDestino = 'INDIVIDUAL' | 'NIVEL' | 'CARRERA' | 'GRUPO' | 'GLOBAL';

// ─── OBTENER ID DEL ADMIN/SUPERUSUARIO ──────────────────────────────────────

export async function obtenerAdminId() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos')
      .in('rol', ['superuser', 'admin'])
      .limit(1)
      .single();
    return { success: true, id: data?.id || '', nombre: data ? `${data.nombre} ${data.apellidos}` : 'Administración' };
  } catch {
    return { success: false, id: '', nombre: 'Administración' };
  }
}

// ─── ENVIAR MENSAJE ─────────────────────────────────────────────────────────

export async function enviarMensaje({
  remitente_id,
  destinatario_id,
  tipo_destino,
  destino_id,
  contenido,
}: {
  remitente_id: string;
  destinatario_id?: string | null;
  tipo_destino: TipoDestino;
  destino_id?: string | null;
  contenido: string;
}) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { data, error } = await supabaseAdmin
      .from('mensajes_internos')
      .insert({
        remitente_id,
        destinatario_id: destinatario_id || null,
        tipo_destino,
        destino_id: destino_id || null,
        contenido,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    console.error('Error enviando mensaje:', err);
    return { success: false, error: err.message };
  }
}

// ─── OBTENER CONVERSACIÓN INDIVIDUAL (chat entre 2 personas) ────────────────

export async function obtenerConversacion(userId1: string, userId2: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { data, error } = await supabaseAdmin
      .from('mensajes_internos')
      .select('*')
      .eq('tipo_destino', 'INDIVIDUAL')
      .or(`and(remitente_id.eq.${userId1},destinatario_id.eq.${userId2}),and(remitente_id.eq.${userId2},destinatario_id.eq.${userId1})`)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    console.error('Error obteniendo conversación:', err);
    return { success: false, data: [], error: err.message };
  }
}

// ─── OBTENER LISTA DE CHATS PARA EL ADMIN ──────────────────────────────────

export async function obtenerListaChats(adminId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    // Obtener todos los mensajes individuales donde el admin es parte
    const { data, error } = await supabaseAdmin
      .from('mensajes_internos')
      .select('remitente_id, destinatario_id, contenido, created_at, leido')
      .eq('tipo_destino', 'INDIVIDUAL')
      .or(`remitente_id.eq.${adminId},destinatario_id.eq.${adminId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Agrupar por el "otro" usuario para obtener la lista de conversaciones
    const chatMap = new Map<string, { userId: string; ultimoMensaje: string; fecha: string; noLeidos: number }>();
    for (const msg of data || []) {
      const otroId = msg.remitente_id === adminId ? msg.destinatario_id : msg.remitente_id;
      if (!otroId) continue;
      if (!chatMap.has(otroId)) {
        chatMap.set(otroId, {
          userId: otroId,
          ultimoMensaje: msg.contenido,
          fecha: msg.created_at,
          noLeidos: 0,
        });
      }
      // Contar no leídos (mensajes que el otro le mandó al admin y no están leídos)
      if (msg.remitente_id !== adminId && !msg.leido) {
        const entry = chatMap.get(otroId)!;
        entry.noLeidos++;
      }
    }

    // Obtener perfiles de los usuarios
    const userIds = Array.from(chatMap.keys());
    if (userIds.length === 0) return { success: true, data: [] };

    const { data: perfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos, rol, matricula, carreras(nombre)')
      .in('id', userIds);

    const result = userIds.map(uid => {
      const chat = chatMap.get(uid)!;
      const perfil = perfiles?.find(p => p.id === uid);
      return {
        ...chat,
        nombre: perfil ? `${perfil.nombre} ${perfil.apellidos}` : 'Usuario',
        rol: perfil?.rol || '',
        matricula: perfil?.matricula || '',
        carrera: (perfil?.carreras as any)?.nombre || '',
      };
    });

    result.sort((a, b) => {
      if (b.noLeidos !== a.noLeidos) return b.noLeidos - a.noLeidos;
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
    });

    return { success: true, data: result };
  } catch (err: any) {
    console.error('Error obteniendo lista de chats:', err);
    return { success: false, data: [], error: err.message };
  }
}

// ─── OBTENER COMUNICADOS GLOBALES (para el admin) ───────────────────────────

export async function obtenerComunicados() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  noStore();
  try {
    const { data, error } = await supabaseAdmin
      .from('mensajes_internos')
      .select('*')
      .neq('tipo_destino', 'INDIVIDUAL')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Para cada comunicado, obtener el % de vistos
    const comunicadosConStats = await Promise.all((data || []).map(async (msg) => {
      // Contar vistos
      const { count: vistosCount } = await supabaseAdmin
        .from('mensajes_vistos')
        .select('*', { count: 'exact', head: true })
        .eq('mensaje_id', msg.id);

      // Contar destinatarios potenciales
      let totalDestinatarios = 0;
      if (msg.tipo_destino === 'GLOBAL') {
        const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).in('rol', ['alumno', 'profesor']);
        totalDestinatarios = count || 0;
      } else if (msg.tipo_destino === 'NIVEL') {
        const { data: carreras } = await supabaseAdmin.from('carreras').select('id').eq('nivel_id', msg.destino_id);
        const carreraIds = (carreras || []).map(c => c.id);
        if (carreraIds.length > 0) {
          const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).in('carrera_id', carreraIds);
          totalDestinatarios = count || 0;
        }
      } else if (msg.tipo_destino === 'CARRERA') {
        const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('carrera_id', msg.destino_id);
        totalDestinatarios = count || 0;
      } else if (msg.tipo_destino === 'GRUPO') {
        const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('grupo_id', msg.destino_id);
        totalDestinatarios = count || 0;
      }

      const destinoNombre = await resolverNombreDestino(msg.tipo_destino, msg.destino_id);

      return {
        ...msg,
        vistos: vistosCount || 0,
        totalDestinatarios,
        pctVistos: totalDestinatarios > 0 ? Math.round(((vistosCount || 0) / totalDestinatarios) * 100) : 0,
        destinoNombre,
      };
    }));

    return { success: true, data: comunicadosConStats };
  } catch (err: any) {
    console.error('Error obteniendo comunicados:', err);
    return { success: false, data: [], error: err.message };
  }
}

// ─── RESOLVER NOMBRE DEL DESTINO ────────────────────────────────────────────

async function resolverNombreDestino(tipo: string, id: string | null): Promise<string> {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  if (!id) return tipo === 'GLOBAL' ? 'Todos los usuarios' : 'Desconocido';
  try {
    if (tipo === 'NIVEL') {
      const { data } = await supabaseAdmin.from('niveles').select('nombre').eq('id', id).single();
      return data?.nombre || 'Nivel';
    }
    if (tipo === 'CARRERA') {
      const { data } = await supabaseAdmin.from('carreras').select('nombre').eq('id', id).single();
      return data?.nombre || 'Carrera';
    }
    if (tipo === 'GRUPO') {
      const { data } = await supabaseAdmin.from('grupos').select('nombre').eq('id', id).single();
      return data?.nombre || 'Grupo';
    }
    return tipo;
  } catch {
    return tipo;
  }
}

// ─── OBTENER MENSAJES PARA UN USUARIO (globales + individuales) ─────────────

export async function obtenerMensajesUsuario(userId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    // Obtener el perfil del usuario para saber su carrera, grupo, nivel
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('id, carrera_id, grupo_id, carreras(nivel_id)')
      .eq('id', userId)
      .single();

    if (!perfil) return { success: false, data: [], error: 'Perfil no encontrado' };

    const nivelId = (perfil.carreras as any)?.nivel_id;
    const carreraId = perfil.carrera_id;
    const grupoId = perfil.grupo_id;

    // Construir filtro OR para mensajes globales que aplican al usuario
    const orConditions: string[] = [
      `and(tipo_destino.eq.INDIVIDUAL,destinatario_id.eq.${userId})`,
      `and(tipo_destino.eq.INDIVIDUAL,remitente_id.eq.${userId})`,
      `tipo_destino.eq.GLOBAL`,
    ];
    if (nivelId) orConditions.push(`and(tipo_destino.eq.NIVEL,destino_id.eq.${nivelId})`);
    if (carreraId) orConditions.push(`and(tipo_destino.eq.CARRERA,destino_id.eq.${carreraId})`);
    if (grupoId) orConditions.push(`and(tipo_destino.eq.GRUPO,destino_id.eq.${grupoId})`);

    const { data, error } = await supabaseAdmin
      .from('mensajes_internos')
      .select('*')
      .or(orConditions.join(','))
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Separar en globales e individuales
    const globales = (data || []).filter(m => m.tipo_destino !== 'INDIVIDUAL');
    const individuales = (data || []).filter(m => m.tipo_destino === 'INDIVIDUAL');

    // Marcar cuáles globales ya fueron vistos por este usuario
    const globalIds = globales.map(m => m.id);
    let vistosSet = new Set<string>();
    if (globalIds.length > 0) {
      const { data: vistos } = await supabaseAdmin
        .from('mensajes_vistos')
        .select('mensaje_id')
        .eq('usuario_id', userId)
        .in('mensaje_id', globalIds);
      vistosSet = new Set((vistos || []).map(v => v.mensaje_id));
    }

    const globalesConVisto = globales.map(m => ({ ...m, yaVisto: vistosSet.has(m.id) }));

    return { success: true, data: { globales: globalesConVisto, individuales } };
  } catch (err: any) {
    console.error('Error obteniendo mensajes del usuario:', err);
    return { success: false, data: { globales: [], individuales: [] }, error: err.message };
  }
}

// ─── MARCAR MENSAJE INDIVIDUAL COMO LEÍDO ───────────────────────────────────

export async function marcarComoLeido(mensajeId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { error } = await supabaseAdmin
      .from('mensajes_internos')
      .update({ leido: true })
      .eq('id', mensajeId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── MARCAR COMUNICADO GLOBAL COMO VISTO ────────────────────────────────────

export async function marcarComunicadoVisto(mensajeId: string, usuarioId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { error } = await supabaseAdmin
      .from('mensajes_vistos')
      .upsert({ mensaje_id: mensajeId, usuario_id: usuarioId }, { onConflict: 'mensaje_id,usuario_id' });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── ELIMINAR MENSAJE (solo admin/superusuario) ─────────────────────────────

export async function eliminarMensaje(mensajeId: string, hardDelete: boolean = false) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    if (hardDelete) {
      const { error } = await supabaseAdmin
        .from('mensajes_internos')
        .delete()
        .eq('id', mensajeId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('mensajes_internos')
        .update({ contenido: '🚫 Este mensaje fue eliminado' })
        .eq('id', mensajeId);
      if (error) throw error;
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── OBTENER CONTEO DE NO LEÍDOS ───────────────────────────────────────────

export async function obtenerNoLeidos(userId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    // Mensajes individuales no leídos dirigidos a este usuario
    const { count: directos } = await supabaseAdmin
      .from('mensajes_internos')
      .select('*', { count: 'exact', head: true })
      .eq('tipo_destino', 'INDIVIDUAL')
      .eq('destinatario_id', userId)
      .eq('leido', false);

    // Mensajes globales no vistos
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('carrera_id, grupo_id, carreras(nivel_id)')
      .eq('id', userId)
      .single();

    const nivelId = (perfil?.carreras as any)?.nivel_id;
    const carreraId = perfil?.carrera_id;
    const grupoId = perfil?.grupo_id;

    const orConds: string[] = ['tipo_destino.eq.GLOBAL'];
    if (nivelId) orConds.push(`and(tipo_destino.eq.NIVEL,destino_id.eq.${nivelId})`);
    if (carreraId) orConds.push(`and(tipo_destino.eq.CARRERA,destino_id.eq.${carreraId})`);
    if (grupoId) orConds.push(`and(tipo_destino.eq.GRUPO,destino_id.eq.${grupoId})`);

    const { data: globales } = await supabaseAdmin
      .from('mensajes_internos')
      .select('id')
      .or(orConds.join(','));

    const globalIds = (globales || []).map(m => m.id);
    let globalesNoVistos = 0;
    if (globalIds.length > 0) {
      const { data: vistos } = await supabaseAdmin
        .from('mensajes_vistos')
        .select('mensaje_id')
        .eq('usuario_id', userId)
        .in('mensaje_id', globalIds);
      const vistosSet = new Set((vistos || []).map(v => v.mensaje_id));
      globalesNoVistos = globalIds.filter(id => !vistosSet.has(id)).length;
    }

    return { success: true, directos: directos || 0, globales: globalesNoVistos, total: (directos || 0) + globalesNoVistos };
  } catch (err: any) {
    return { success: false, directos: 0, globales: 0, total: 0 };
  }
}

// ─── OBTENER ESTRUCTURA ACADÉMICA (para seleccionar destinatarios) ──────────

export async function obtenerEstructuraAcademica() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { data: niveles } = await supabaseAdmin.from('niveles').select('id, nombre').eq('activo', true).order('nombre');
    const { data: carreras } = await supabaseAdmin.from('carreras').select('id, nombre, nivel_id').eq('activo', true).order('nombre');
    const { data: grupos } = await supabaseAdmin.from('grupos').select('id, nombre, turno, carrera_id').order('nombre');
    const { data: usuarios } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos, rol, matricula, carreras(nombre)')
      .in('rol', ['alumno', 'profesor', 'admin'])
      .eq('estatus', 'activo')
      .order('nombre');

    return {
      success: true,
      niveles: niveles || [],
      carreras: carreras || [],
      grupos: grupos || [],
      usuarios: (usuarios || []).map(u => ({
        id: u.id,
        nombre: `${u.nombre} ${u.apellidos}`,
        rol: u.rol,
        matricula: u.matricula,
        carrera: (u.carreras as any)?.nombre || '',
      })),
    };
  } catch (err: any) {
    return { success: false, niveles: [], carreras: [], grupos: [], usuarios: [], error: err.message };
  }
}

// ─── MARCAR CHAT ENTERO COMO LEÍDO (Para el Admin) ──────────────────────────

export async function marcarChatComoLeido(adminId: string, remitenteId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { error } = await supabaseAdmin
      .from('mensajes_internos')
      .update({ leido: true })
      .eq('tipo_destino', 'INDIVIDUAL')
      .eq('destinatario_id', adminId)
      .eq('remitente_id', remitenteId)
      .eq('leido', false);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Error marcando chat como leído:', err);
    return { success: false, error: err.message };
  }
}
