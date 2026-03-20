'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

/**
 * Cliente administrativo de Supabase. 
 * Requiere SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuuohbztrxxneozagecr.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '', // Esta llave NUNCA debe exponerse en el cliente
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function createUserWithProfile(userData: any) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
    }

    // 1. Crear el usuario en Supabase Auth
    // Usamos una contraseña genérica o el email como base (puedes cambiar esto)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: 'Zapata' + Math.random().toString(36).slice(-4) + '!', // Contraseña temporal
      email_confirm: true,
      user_metadata: { 
        full_name: `${userData.nombre} ${userData.apellidos}` 
      }
    });

    if (authError) {
      return { success: false, error: `Auth Error: ${authError.message}` };
    }

    if (!authData.user) {
      return { success: false, error: "No se pudo crear el usuario de autenticación." };
    }

    // 2. Crear el perfil en la tabla 'profiles' vinculado al ID de Auth
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert([{
        id: authData.user.id,
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        email: userData.email,
        curp: userData.curp.toUpperCase(),
        rol: userData.rol,
        estatus: userData.estatus,
        telefono: userData.telefono,
        matricula: userData.matricula,
        numero_empleado: userData.numero_empleado,
        fecha_expiracion: userData.fecha_expiracion,
      }]);

    if (profileError) {
      // Si falla el perfil, borramos el usuario de auth para mantener integridad
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: `Profile Error: ${profileError.message}` };
    }

    revalidatePath('/dashboard/admin/usuarios');
    return { success: true, data: authData.user };

  } catch (error: any) {
    console.error("Error en createUserWithProfile:", error);
    return { success: false, error: error.message };
  }
}

export async function updateUserProfile(id: string, userData: any) {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        curp: userData.curp.toUpperCase(),
        rol: userData.rol,
        estatus: userData.estatus,
        telefono: userData.telefono,
        matricula: userData.matricula,
        numero_empleado: userData.numero_empleado,
        fecha_expiracion: userData.fecha_expiracion,
      })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
