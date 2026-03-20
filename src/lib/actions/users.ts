
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

// Función auxiliar para normalizar cadenas vacías a null
const emptyToNull = (val: any) => {
  if (typeof val === 'string' && val.trim() === '') return null;
  return val;
};

export async function createUserWithProfile(userData: any) {
  try {
    console.log("Iniciando creación de usuario para:", userData.email);

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("ERROR: Falta SUPABASE_SERVICE_ROLE_KEY");
      return { success: false, error: "Error de configuración: Falta la llave de servicio en el servidor." };
    }

    // 1. Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: userData.password || 'Zapata2025!',
      email_confirm: true,
      user_metadata: { 
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        curp: (userData.curp || '').toUpperCase(),
        rol: userData.rol,
        matricula: emptyToNull(userData.matricula),
        numero_empleado: emptyToNull(userData.numero_empleado)
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

    // 2. Preparar datos para el perfil (Upsert)
    const profileData = {
      id: authData.user.id,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      email: userData.email,
      curp: (userData.curp || '').toUpperCase(),
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      password_plain: userData.password,
    };

    // 3. Crear o actualizar el perfil en la tabla 'profiles'
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
      console.error("Error al gestionar perfil SQL:", profileError.message);
      // Opcional: Podrías querer borrar el usuario de Auth aquí si el perfil falla
      // await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: `Error de Base de Datos: ${profileError.message}. Asegúrate de que la CURP y Email sean únicos.` };
    }

    console.log("Perfil académico gestionado exitosamente.");
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
    const updateData: any = {
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      curp: (userData.curp || '').toUpperCase(),
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
    };

    if (userData.password) {
      updateData.password_plain = userData.password;
      await supabaseAdmin.auth.admin.updateUserById(id, {
        password: userData.password
      });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
