
'use server';

import { createClient } from '@supabase/supabase-js';

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

export async function createAspiranteRecord(aspiranteData: any) {
  try {
    const { error } = await supabaseAdmin
      .from('aspirantes')
      .insert({
        nombre: aspiranteData.nombre.toUpperCase().trim(),
        apellidos: aspiranteData.apellidos.toUpperCase().trim(),
        email: aspiranteData.email.toLowerCase().trim(),
        curp: aspiranteData.curp.toUpperCase().trim(),
        telefono: aspiranteData.telefono.trim(),
        fecha_nacimiento: aspiranteData.fecha_nacimiento,
        genero: aspiranteData.genero,
        nivel: aspiranteData.nivel,
        carrera_id: aspiranteData.carrera_id || null,
      });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: "Ya existe un registro con esta CURP o correo electrónico." };
      }
      throw error;
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error creating aspirante:", error);
    return { success: false, error: error.message || "Error al procesar el preregistro." };
  }
}

export async function getPublicCareers() {
  try {
    const { data, error } = await supabaseAdmin
      .from('carreras')
      .select('id, nombre, niveles(id, nombre)')
      .eq('activo', true);
    
    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
