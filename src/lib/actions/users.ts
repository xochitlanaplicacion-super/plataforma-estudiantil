
'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { sendWelcomeEmail } from '@/lib/email';

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
  return val;
};

export async function createUserWithProfile(userData: any) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { success: false, error: "Error de configuración: Falta la llave de servicio." };
    }

    const email = userData.email.toLowerCase().trim();
    const curp = (userData.curp || '').toUpperCase().trim();

    // 1. VERIFICACIÓN PREVIA DE DUPLICADOS
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('email, curp')
      .or(`email.eq.${email},curp.eq.${curp}`)
      .maybeSingle();

    if (existingUser) {
      if (existingUser.email === email) {
        return { success: false, error: "Este correo electrónico ya está registrado en el sistema." };
      }
      if (existingUser.curp === curp) {
        return { success: false, error: "La CURP ingresada ya existe en los registros académicos." };
      }
    }

    // 2. Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: userData.password,
      email_confirm: true,
      user_metadata: { 
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        curp: curp,
        rol: userData.rol,
        matricula: emptyToNull(userData.matricula),
        numero_empleado: emptyToNull(userData.numero_empleado)
      }
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        return { success: false, error: "Este correo electrónico ya está registrado en el acceso." };
      }
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: "No se pudo generar el usuario de acceso." };
    }

    // 3. Llenar el perfil
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
      password_plain: userData.password,
    };

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: `Error en Base de Datos: ${profileError.message}` };
    }

    // 4. ENVIAR CORREO DE BIENVENIDA (NO BLOQUEA)
    sendWelcomeEmail({
      to: email,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      rol: userData.rol,
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      password: userData.password,
    }).then((result) => {
      if (result.success) {
        console.log('✅ Correo de bienvenida enviado a:', email);
      } else {
        console.warn('⚠️ No se pudo enviar el correo de bienvenida:', result.error);
      }
    }).catch((err) => {
      console.warn('⚠️ Error al intentar enviar correo:', err);
    });

    revalidatePath('/dashboard/admin/usuarios');
    revalidatePath('/dashboard/admin');
    
    return { success: true };

  } catch (error: any) {
    return { success: false, error: error.message || "Error interno del servidor." };
  }
}

export async function updateUserProfile(id: string, userData: any) {
  try {
    const curp = (userData.curp || '').toUpperCase().trim();
    
    const updateData: any = {
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      curp: curp,
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      password_plain: emptyToNull(userData.password),
    };

    if (userData.password) {
      await supabaseAdmin.auth.admin.updateUserById(id, {
        password: userData.password
      });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: "La CURP ya pertenece a otro usuario registrado." };
      }
      throw error;
    }

    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
