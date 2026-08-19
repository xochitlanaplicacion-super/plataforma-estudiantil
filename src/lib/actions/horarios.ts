"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js"; // fallback
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTenantSession, resolveTenantFromHostname } from "@/lib/tenant/context";

const DAYS_ORDER = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export interface HorarioBloque {
  dias: string[];
  hora_inicio: string;
  hora_fin: string;
}

export interface ConfiguracionGlobal {
  horarios_atencion: HorarioBloque[];
  telefono_contacto: string;
  correo_contacto: string;
}

export async function updateConfiguracion(bloques: HorarioBloque[], telefono: string, correo: string) {
  const { supabase, tenantId } = await requireTenantSession(["admin", "superuser"]);

  const { error } = await supabase
    .from("configuracion_sistema")
    .update({ horarios_atencion: bloques, telefono_contacto: telefono, correo_contacto: correo, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/alumno/pagos");
  revalidatePath("/acerca-de-nosotros"); // forzar refetch
  revalidatePath("/expired"); // forzar refetch
  return { success: true };
}

export async function getConfiguracionBruta(): Promise<ConfiguracionGlobal> {
  const tenant = await resolveTenantFromHostname();
  if (!tenant) return { horarios_atencion: [], telefono_contacto: "", correo_contacto: "" };
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("configuracion_sistema").select("horarios_atencion, telefono_contacto, correo_contacto").eq("tenant_id", tenant.id).single();
  if (error || !data) return { horarios_atencion: [], telefono_contacto: "", correo_contacto: "" };
  return {
    horarios_atencion: data.horarios_atencion as HorarioBloque[],
    telefono_contacto: data.telefono_contacto,
    correo_contacto: data.correo_contacto || ""
  };
}

export async function getDatosContactoFormateados(): Promise<{telefono: string, correo: string, direccion: string}> {
  const tenant = await resolveTenantFromHostname();
  const supabase = createSupabaseAdminClient();
  const { data } = tenant ? await supabase.from("configuracion_sistema").select("telefono_contacto, correo_contacto, direccion").eq("tenant_id", tenant.id).single() : { data: null };
  
  return {
    telefono: data?.telefono_contacto || "7352826206",
    correo: data?.correo_contacto || "",
    direccion: data?.direccion || "Yautepec Morelos México"
  };
}

function formatTime12h(timeStr: string) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(':');
  const date = new Date();
  date.setHours(parseInt(h, 10));
  date.setMinutes(parseInt(m, 10));
  // Ej: 09:00 a. m. -> 09:00 AM
  return date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}

function formatDaysList(dias: string[]) {
  if (!dias || dias.length === 0) return "";
  if (dias.length <= 2) return dias.join(" y ");

  // Ordenamos los días que el usuario seleccionó basándonos en nuestra constante DAYS_ORDER
  const indices = dias.map(d => DAYS_ORDER.indexOf(d)).filter(i => i !== -1).sort((a,b)=>a-b);
  
  if(indices.length === 0) return dias.join(", "); // fallback por si hay días no reconocidos

  let isContiguous = true;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i-1] + 1) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous && indices.length > 2) {
    return `${DAYS_ORDER[indices[0]]} a ${DAYS_ORDER[indices[indices.length - 1]]}`;
  }

  // Not contiguous, just comma separated for the start and 'y' for the last one
  const lastIndex = dias.length - 1;
  return dias.slice(0, lastIndex).join(", ") + " y " + dias[lastIndex];
}

// Función libre de contexto de cookies para que pueda usarla el trigger de email o Server Components
export async function getHorariosFormateados(tenantId?: string): Promise<string> {
  // Usar createClient directo (rol admin o público) para no depender de auth/cookies en background jobs
  const resolvedTenant = tenantId ? { id: tenantId } : await resolveTenantFromHostname();
  const supabase = createSupabaseAdminClient();
  const { data } = resolvedTenant ? await supabase.from("configuracion_sistema").select("horarios_atencion").eq("tenant_id", resolvedTenant.id).single() : { data: null };
  let bloques: HorarioBloque[] = [];
  
  if (data && data.horarios_atencion) {
    bloques = data.horarios_atencion as HorarioBloque[];
  }

  if (bloques.length === 0) {
    // Fallback de contingencia si no hay datos en la DB
    return "de Lunes a Viernes en un horario de 09:00 AM a 06:00 PM"; 
  }

  const parts = bloques.map(b => {
    const daysStr = formatDaysList(b.dias);
    const start = formatTime12h(b.hora_inicio);
    const end = formatTime12h(b.hora_fin);
    return `de ${daysStr} en un horario de ${start} a ${end}`;
  });

  return parts.join(", y ");
}
