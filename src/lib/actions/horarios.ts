"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js"; // fallback
import { revalidatePath } from "next/cache";

const DAYS_ORDER = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export interface HorarioBloque {
  dias: string[];
  hora_inicio: string;
  hora_fin: string;
}

export interface ConfiguracionGlobal {
  horarios_atencion: HorarioBloque[];
  telefono_contacto: string;
}

export async function updateConfiguracion(bloques: HorarioBloque[], telefono: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (!profile || !["admin", "superuser"].includes(profile.rol)) {
    return { success: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("configuracion_sistema")
    .upsert({ id: 1, horarios_atencion: bloques, telefono_contacto: telefono, updated_at: new Date().toISOString() });

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
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("configuracion_sistema").select("horarios_atencion, telefono_contacto").eq("id", 1).single();
  if (error || !data) return { horarios_atencion: [], telefono_contacto: "735 2826206" };
  return {
    horarios_atencion: data.horarios_atencion as HorarioBloque[],
    telefono_contacto: data.telefono_contacto
  };
}

export async function getTelefonoFormateado(): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase.from("configuracion_sistema").select("telefono_contacto").eq("id", 1).single();
  if (data && data.telefono_contacto) return data.telefono_contacto;
  return "7352826206"; // Fallback de contingencia
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
export async function getHorariosFormateados(): Promise<string> {
  // Usar createClient directo (rol admin o público) para no depender de auth/cookies en background jobs
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase.from("configuracion_sistema").select("horarios_atencion").eq("id", 1).single();
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
