'use server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveTenantFromHostname } from '@/lib/tenant/context';

async function publicTenantContext() {
  const tenant = await resolveTenantFromHostname();
  if (!tenant || tenant.estado !== 'activo') throw new Error('Institución no disponible para preregistro');
  return { tenant, admin: createSupabaseAdminClient() };
}

export async function createAspiranteRecord(aspiranteData: any) {
  try {
    const { tenant, admin } = await publicTenantContext();
    if (aspiranteData.carrera_id) {
      const { data: career } = await admin.from('carreras').select('id')
        .eq('tenant_id', tenant.id).eq('id', aspiranteData.carrera_id).eq('activo', true).maybeSingle();
      if (!career) throw new Error('La carrera seleccionada no pertenece a esta institución');
    }
    const { error } = await admin
      .from('aspirantes')
      .insert({
        tenant_id: tenant.id,
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
    const { tenant, admin } = await publicTenantContext();
    const { data, error } = await admin
      .from('carreras')
      .select('id, nombre, niveles(id, nombre)')
      .eq('tenant_id', tenant.id)
      .eq('activo', true);
    
    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getPublicLevels() {
  try {
    const { tenant, admin } = await publicTenantContext();
    const { data, error } = await admin
      .from('niveles')
      .select('id, nombre')
      .eq('tenant_id', tenant.id)
      .eq('activo', true)
      .order('nombre');
    
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, data: [], error: error.message };
  }
}
