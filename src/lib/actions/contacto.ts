'use server';

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function createContactoRecord(data: { nombre: string, email: string, telefono: string, mensaje?: string }) {
  try {
    const { error } = await supabaseAdmin
      .from('mensajes_contacto')
      .insert({
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
