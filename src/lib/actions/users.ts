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

    // 1. Crear el usuario en Auth
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

    if (authError) return { success: false, error: authError.message };

    // 2. Crear el perfil en DB
    const profileData = {
      id: authData.user.id,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      email: email,
      curp: curp,
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      fecha_nacimiento: emptyToNull(userData.fecha_nacimiento),
      password_plain: userData.password,
      doc_acta_nacimiento: !!userData.doc_acta_nacimiento,
      doc_certificado_estudios: !!userData.doc_certificado_estudios,
      doc_curp: !!userData.doc_curp,
      doc_ine: !!userData.doc_ine,
    };

    const { error: profileError } = await supabaseAdmin.from('profiles').insert(profileData);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: profileError.message };
    }

    // 3. Si viene de un aspirante, marcarlo como inscrito
    if (aspiranteId) {
      await supabaseAdmin.from('aspirantes').update({ estatus: 'inscrito' }).eq('id', aspiranteId);
    }

    // 4. Enviar correo
    sendWelcomeEmail({
      to: email,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      rol: userData.rol,
      matricula: emptyToNull(userData.matricula),
      password: userData.password,
    }).catch(console.error);

    revalidatePath('/dashboard/admin/crm/aspirantes');
    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateUserProfile(id: string, userData: any) {
  try {
    const updateData: any = {
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      curp: (userData.curp || '').toUpperCase().trim(),
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      fecha_nacimiento: emptyToNull(userData.fecha_nacimiento),
      password_plain: emptyToNull(userData.password),
      doc_acta_nacimiento: !!userData.doc_acta_nacimiento,
      doc_certificado_estudios: !!userData.doc_certificado_estudios,
      doc_curp: !!userData.doc_curp,
      doc_ine: !!userData.doc_ine,
    };

    if (userData.password) {
      await supabaseAdmin.auth.admin.updateUserById(id, { password: userData.password });
    }

    const { error } = await supabaseAdmin.from('profiles').update(updateData).eq('id', id);
    if (error) throw error;

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
    return await sendWelcomeEmail({
      to: profile.email,
      nombre: profile.nombre,
      apellidos: profile.apellidos,
      rol: profile.rol,
      matricula: profile.matricula,
      password: profile.password_plain || '********',
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