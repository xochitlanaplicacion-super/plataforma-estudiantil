
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
    // Pasamos toda la metadata para que el Trigger handle_new_user tenga datos
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email.toLowerCase().trim(),
      password: userData.password || 'Zapata2025!',
      email_confirm: true,
      user_metadata: { 
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        curp: (userData.curp || '').toUpperCase().trim(),
        rol: userData.rol,
        matricula: emptyToNull(userData.matricula),
        numero_empleado: emptyToNull(userData.numero_empleado)
      }
    });

    if (authError) {
      console.error("Error en Supabase Auth:", authError.message);
      if (authError.message.includes("already registered")) {
        return { success: false, error: "Este correo electrónico ya está registrado en el sistema." };
      }
      return { success: false, error: `Error de Autenticación: ${authError.message}` };
    }

    if (!authData.user) {
      return { success: false, error: "No se pudo generar el usuario de acceso." };
    }

    // 2. Preparar datos para el perfil (Upsert para manejar el trigger)
    const profileData = {
      id: authData.user.id,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      email: userData.email.toLowerCase().trim(),
      curp: (userData.curp || '').toUpperCase().trim(),
      rol: userData.rol,
      estatus: userData.estatus,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      password_plain: userData.password,
    };

    // 3. Actualizar el perfil (el trigger ya debió crear uno básico)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
      console.error("Error al gestionar perfil SQL:", profileError);
      
      // Manejo específico de duplicados en SQL (Código 23505)
      if (profileError.code === '23505') {
        // Borramos el usuario de Auth si falló el perfil por duplicidad para permitir re-intento
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        
        if (profileError.message.includes('curp')) {
          return { success: false, error: "La CURP ingresada ya existe en los registros." };
        }
        if (profileError.message.includes('email')) {
          return { success: false, error: "El correo electrónico ya existe en los registros." };
        }
      }

      return { success: false, error: `Error de Base de Datos: ${profileError.message}.` };
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
      curp: (userData.curp || '').toUpperCase().trim(),
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
        if (error.message.includes('curp')) return { success: false, error: "La CURP ya pertenece a otro usuario." };
        if (error.message.includes('email')) return { success: false, error: "El correo ya pertenece a otro usuario." };
      }
      throw error;
    }

    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
