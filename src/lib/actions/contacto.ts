'use server';

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveTenantFromHostname } from '@/lib/tenant/context';

export async function createContactoRecord(data: { nombre: string, email: string, telefono: string, mensaje?: string }) {
  try {
    const tenant = await resolveTenantFromHostname();
    if (!tenant || tenant.estado !== 'activo') throw new Error('Institución no disponible');
    const { error } = await createSupabaseAdminClient()
      .from('mensajes_contacto')
      .insert({
        tenant_id: tenant.id,
        nombre: data.nombre.toUpperCase().trim(),
        email: data.email.toLowerCase().trim(),
        telefono: data.telefono.trim(),
        mensaje: data.mensaje ? data.mensaje.trim() : null,
      });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Error creating contacto record:", error);
    return { success: false, error: error.message || "Error al enviar el mensaje." };
  }
}
