
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

    sendWelcomeEmail({
      to: email,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      rol: userData.rol,
      matricula: emptyToNull(userData.matricula),
      password: userData.password,
    }).catch(err => console.error("Error envío correo bienvenida:", err));

    revalidatePath('/dashboard/admin/crm/aspirantes');
    revalidatePath('/dashboard/admin/usuarios');
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
      .select('estatus, password_plain, email, nombre, apellidos, rol, matricula')
      .eq('id', id)
      .single();

    const finalPassword = userData.password || currentProfile?.password_plain || userData.password_plain;
    const hoy = new Date().toISOString().split('T')[0];

    const updateData: any = {
      nombre: userData.nombre.toUpperCase().trim(),
      apellidos: userData.apellidos.toUpperCase().trim(),
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
      sendWelcomeEmail({
        to: userData.email || currentProfile?.email,
        nombre: userData.nombre || currentProfile?.nombre,
        apellidos: userData.apellidos || currentProfile?.apellidos,
        rol: userData.rol || currentProfile?.rol,
        matricula: updateData.matricula || currentProfile?.matricula,
        password: finalPassword,
        isReactivation: isReactivated,
        isExpiration: isExpiring
      }).catch(err => console.error("Error envío notificación de acceso:", err));
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
    
    return await sendWelcomeEmail({
      to: profile.email,
      nombre: profile.nombre,
      apellidos: profile.apellidos,
      rol: profile.rol,
      matricula: profile.matricula,
      password: profile.password_plain,
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
