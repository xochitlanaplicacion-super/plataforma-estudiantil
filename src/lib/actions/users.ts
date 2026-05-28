
'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { sendWelcomeEmail, sendDocumentReminderEmail } from '@/lib/email';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuuohbztrxxneozagecr.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '', 
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const emptyToNull = (val: any) => {
  if (typeof val === 'string' && val.trim() === '') return null;
  if (val === undefined) return null;
  return val;
};

export async function createUserWithProfile(userData: any, aspiranteId?: string) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { success: false, error: "Error de configuración: Falta la llave de servicio." };
    }

    const email = userData.email.toLowerCase().trim();
    const curp = (userData.curp || '').toUpperCase().trim();

    const { data: existingEmail } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    
    if (existingEmail) {
      return { success: false, error: `El correo ${email} ya está registrado en el sistema.` };
    }

    const { data: existingCurp } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('curp', curp)
      .maybeSingle();
    
    if (existingCurp) {
      return { success: false, error: `La CURP ${curp} ya está asignada a otro usuario.` };
    }

    // ─── VALIDACIÓN DE CUOTA DE PROFESORES (LÍMITE: 15) ─────────────────────
    // Esta validación ocurre en el servidor para que no pueda saltarse por Postman u otras herramientas.
    if (userData.rol === 'profesor') {
      const PROFESSOR_LIMIT = 15;
      const { count, error: countError } = await supabaseAdmin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('rol', 'profesor');

      if (countError) {
        return { success: false, error: 'No se pudo verificar la cuota de profesores. Intenta de nuevo.' };
      }

      if ((count ?? 0) >= PROFESSOR_LIMIT) {
        return {
          success: false,
          error: `⛔ Límite de plantilla alcanzado: Ya tienes ${count} profesores registrados (máximo ${PROFESSOR_LIMIT} del plan actual). Elimina o desactiva profesores inactivos, o solicita un incremento de cuota.`
        };
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: userData.password,
      email_confirm: true,
      user_metadata: { 
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        curp: curp,
        rol: userData.rol
      }
    });

    if (authError) {
      return { success: false, error: `Error en Autenticación: ${authError.message}` };
    }

    const profileData = {
      id: authData.user.id,
      nombre: userData.nombre.toUpperCase().trim(),
      apellidos: userData.apellidos.toUpperCase().trim(),
      email: email,
      curp: curp,
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      fecha_nacimiento: emptyToNull(userData.fecha_nacimiento),
      genero: emptyToNull(userData.genero),
      carrera_id: emptyToNull(userData.carrera_id),
      password_plain: userData.password,
      doc_acta_nacimiento: !!userData.doc_acta_nacimiento,
      doc_certificado_estudios: !!userData.doc_certificado_estudios,
      doc_curp: !!userData.doc_curp,
      doc_ine: !!userData.doc_ine,
    };

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: `Error en Perfil: ${profileError.message}` };
    }

    if (aspiranteId) {
      await supabaseAdmin.from('aspirantes').update({ estatus: 'inscrito' }).eq('id', aspiranteId);
    }

    // Obtener nombre de carrera y nombre de nivel para el correo
    let carreraNombre = null;
    let nivelNombre: string | null = null;
    
    if (userData.carrera_id) {
      const { data: carreraData } = await supabaseAdmin
        .from('carreras')
        .select('nombre, niveles(id, nombre)')
        .eq('id', userData.carrera_id)
        .single();
      
      if (carreraData) {
        carreraNombre = carreraData.nombre;
        nivelNombre = (carreraData as any).niveles?.nombre || null;
      }
    }
    
    // Si no se resolvió por carrera, intentar buscar el nivel directamente por su ID (nivel_estudios es UUID)
    if (!nivelNombre && userData.nivel_estudios) {
      const { data: nivelData } = await supabaseAdmin
        .from('niveles')
        .select('nombre')
        .eq('id', userData.nivel_estudios)
        .single();
      if (nivelData) nivelNombre = nivelData.nombre;
    }

    const emailResult = await sendWelcomeEmail({
      to: email,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      rol: userData.rol,
      matricula: emptyToNull(userData.matricula),
      password: userData.password,
      genero: userData.genero,
      nivel: nivelNombre,
      carreraNombre: carreraNombre,
    }).catch(err => ({ success: false, error: err.message || "Error al enviar correo" }));

    revalidatePath('/dashboard/admin/crm/aspirantes');
    revalidatePath('/dashboard/admin/usuarios');

    if (emailResult && !emailResult.success) {
      return { success: true, warning: emailResult.error };
    }
    return { success: true };

  } catch (error: any) {
    console.error("Error crítico en registro:", error);
    return { success: false, error: error.message || "Ocurrió un error inesperado al crear el usuario." };
  }
}

export async function updateUserProfile(id: string, userData: any) {
  try {
    const { data: currentProfile } = await supabaseAdmin
      .from('profiles')
      .select('estatus, password_plain, email, nombre, apellidos, rol, matricula, genero, carrera_id')
      .eq('id', id)
      .single();

    const finalPassword = userData.password || currentProfile?.password_plain || userData.password_plain;
    const hoy = new Date().toISOString().split('T')[0];

    const incomingEmail = userData.email?.toLowerCase().trim();
    const isEmailChanging = incomingEmail && incomingEmail !== currentProfile?.email;

    if (isEmailChanging) {
      const { data: existingEmail } = await supabaseAdmin.from('profiles').select('id').eq('email', incomingEmail).maybeSingle();
      if (existingEmail && existingEmail.id !== id) {
        throw new Error(`El correo ${incomingEmail} ya está registrado para otro usuario.`);
      }
      
      const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        email: incomingEmail,
        email_confirm: true
      });
      if (authEmailError) throw new Error(`Error al actualizar el correo de acceso raíz: ${authEmailError.message}`);
    }

    const updateData: any = {
      nombre: userData.nombre.toUpperCase().trim(),
      apellidos: userData.apellidos.toUpperCase().trim(),
      email: incomingEmail || currentProfile?.email,
      curp: (userData.curp || '').toUpperCase().trim(),
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      fecha_nacimiento: emptyToNull(userData.fecha_nacimiento),
      genero: emptyToNull(userData.genero),
      carrera_id: emptyToNull(userData.carrera_id),
      password_plain: finalPassword,
      doc_acta_nacimiento: !!userData.doc_acta_nacimiento,
      doc_certificado_estudios: !!userData.doc_certificado_estudios,
      doc_curp: !!userData.doc_curp,
      doc_ine: !!userData.doc_ine,
    };

    // LÓGICA DE SINCRONIZACIÓN AUTOMÁTICA DE ESTADO
    if (userData.fecha_expiracion) {
      if (userData.fecha_expiracion < hoy) {
        updateData.estatus = 'inactivo';
      } else if (userData.fecha_expiracion >= hoy && currentProfile?.estatus === 'inactivo') {
        updateData.estatus = 'activo';
      }
    }

    if (userData.password) {
      await supabaseAdmin.auth.admin.updateUserById(id, { password: userData.password });
    }

    const { error } = await supabaseAdmin.from('profiles').update(updateData).eq('id', id);
    if (error) throw error;

    // LÓGICA DE NOTIFICACIONES POR CORREO
    const isReactivated = currentProfile?.estatus === 'inactivo' && updateData.estatus === 'activo';
    const isExpiring = currentProfile?.estatus === 'activo' && updateData.estatus === 'inactivo';
    const passwordManuallyChanged = userData.password && userData.password !== currentProfile?.password_plain;

    if (isReactivated || isExpiring || passwordManuallyChanged) {
      // Obtener nivel y carrera para el correo
      let carreraNombre = null;
      let nivelNombre: string | null = null;
      
      const targetCarreraId = userData.carrera_id || currentProfile?.carrera_id;
      if (targetCarreraId) {
        const { data: cData } = await supabaseAdmin.from('carreras').select('nombre, niveles(id, nombre)').eq('id', targetCarreraId).single();
        if (cData) {
          carreraNombre = cData.nombre;
          nivelNombre = (cData as any).niveles?.nombre || null;
        }
      }
      
      // Si no se resolvió por carrera, buscar el nivel por su UUID
      if (!nivelNombre && userData.nivel_estudios) {
        const { data: nivelData } = await supabaseAdmin.from('niveles').select('nombre').eq('id', userData.nivel_estudios).single();
        if (nivelData) nivelNombre = nivelData.nombre;
      }

      const emailResult = await sendWelcomeEmail({
        to: userData.email || currentProfile?.email,
        nombre: userData.nombre || currentProfile?.nombre,
        apellidos: userData.apellidos || currentProfile?.apellidos,
        rol: userData.rol || currentProfile?.rol,
        matricula: updateData.matricula || currentProfile?.matricula,
        password: finalPassword,
        genero: userData.genero || currentProfile?.genero,
        nivel: nivelNombre,
        carreraNombre: carreraNombre,
        isReactivation: isReactivated,
        isExpiration: isExpiring
      }).catch(err => ({ success: false, error: err.message || "Error al enviar correo" }));

      revalidatePath('/dashboard/admin/usuarios');
      
      if (emailResult && !emailResult.success) {
        return { success: true, warning: emailResult.error };
      }
      return { success: true };
    }

    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCRMStatus(table: 'mensajes_contacto' | 'aspirantes', id: string, data: { estatus?: string, notas?: string }) {
  try {
    const { error } = await supabaseAdmin.from(table).update(data).eq('id', id);
    if (error) throw error;
    revalidatePath(`/dashboard/admin/crm/${table === 'mensajes_contacto' ? 'mensajes' : 'aspirantes'}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteUserAccount(id: string) {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw error;
    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resendWelcomeEmailAction(id: string) {
  try {
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', id).single();
    if (!profile) return { success: false, error: "Perfil no encontrado" };
    if (!profile.password_plain) return { success: false, error: "No hay una contraseña guardada para este perfil." };
    
    // Obtener nivel y carrera para reenvío
    let carreraNombre = null;
    let nivelNombre: string | null = null;
    
    if (profile.carrera_id) {
      const { data: cData } = await supabaseAdmin.from('carreras').select('nombre, niveles(id, nombre)').eq('id', profile.carrera_id).single();
      if (cData) {
        carreraNombre = cData.nombre;
        nivelNombre = (cData as any).niveles?.nombre || null;
      }
    }
    
    return await sendWelcomeEmail({
      to: profile.email,
      nombre: profile.nombre,
      apellidos: profile.apellidos,
      rol: profile.rol,
      matricula: profile.matricula,
      password: profile.password_plain,
      genero: profile.genero,
      nivel: nivelNombre,
      carreraNombre: carreraNombre,
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendDocReminderAction(id: string) {
  try {
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', id).single();
    if (!profile) return { success: false, error: "No se encontró el perfil" };
    const faltantes = [];
    if (!profile.doc_acta_nacimiento) faltantes.push("Acta de Nacimiento");
    if (!profile.doc_certificado_estudios) faltantes.push("Certificado de Estudios");
    if (!profile.doc_curp) faltantes.push("CURP (Documento)");
    if (!profile.doc_ine) faltantes.push("Identificación Oficial (INE)");
    if (faltantes.length === 0) return { success: false, error: "El usuario ya entregó todo." };
    return await sendDocumentReminderEmail({ to: profile.email, nombre: `${profile.nombre} ${profile.apellidos}`, faltantes });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
