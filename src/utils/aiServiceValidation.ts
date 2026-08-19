import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isServiceExpired } from '@/lib/tenant/context';

export async function checkAIServiceStatus(_legacyClient?: unknown): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase.from('profiles').select('tenant_id, estatus').eq('id', user.id).single();
    if (!profile?.tenant_id || profile.estatus !== 'activo') return false;
    const { data, error } = await createSupabaseAdminClient()
      .from('pago_de_servicios')
      .select('estado, fecha_inicio, duracion_dias, ia_habilitada, bloquear_acceso_usuarios, mensaje_bloqueo')
      .eq('tenant_id', profile.tenant_id)
      .single();
    return !error && !!data && data.ia_habilitada && !isServiceExpired(data);
  } catch (error) {
    console.error("Error checking AI service status:", error);
    return false; // Fail safe: block AI if db is down
  }
}

export function aiServiceDisabledResponse() {
  return new Response("El servicio de IA no está habilitado para esta institución", { status: 402 });
}
