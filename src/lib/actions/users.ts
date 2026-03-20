'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

/**
 * Cliente administrativo de Supabase. 
 * Requiere SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.
 */
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

export async function createUserWithProfile(userData: any) {
  try {
    console.log("Iniciando creación de usuario para:", userData.email);

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("ERROR: Falta SUPABASE_SERVICE_ROLE_KEY");
      return { success: false, error: "Error de configuración: Falta la llave de servicio en el servidor." };
    }

    // 1. Crear el usuario en Supabase Auth
    // Usamos una contraseña por defecto: Zapata2025!
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: userData.password || 'Zapata2025!',
      email_confirm: true,
      user_metadata: { 
        full_name: `${userData.nombre} ${userData.apellidos}` 
      }
    });

    if (authError) {
      console.error("Error en Supabase Auth:", authError.message);
      return { success: false, error: `Error de Autenticación: ${authError.message}` };
    }

    if (!authData.user) {
      return { success: false, error: "No se pudo generar el usuario de acceso." };
    }

    console.log("Usuario de Auth creado con ID:", authData.user.id);

    // 2. Crear el perfil en la tabla 'profiles'
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert([{
        id: authData.user.id,
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        email: userData.email,
        curp: (userData.curp || '').toUpperCase(),
        rol: userData.rol,
        estatus: userData.estatus,
        telefono: userData.telefono,
        matricula: userData.matricula,
        numero_empleado: userData.numero_empleado,
        fecha_expiracion: userData.fecha_expiracion,
      }]);

    if (profileError) {
      console.error("Error al crear perfil SQL:", profileError.message);
      // Revertimos la creación del usuario si falla el perfil
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: `Error de Base de Datos: ${profileError.message}` };
    }

    console.log("Perfil académico creado exitosamente.");
    revalidatePath('/dashboard/admin/usuarios');
    revalidatePath('/dashboard/admin');
    
    return { success: true };

  } catch (error: any) {
    console.error("Error inesperado en el servidor:", error);
    return { success: false, error: error.message || "Error interno del servidor." };
  }
}

export async function updateUserProfile(id: string, userData: any) {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        curp: (userData.curp || '').toUpperCase(),
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
