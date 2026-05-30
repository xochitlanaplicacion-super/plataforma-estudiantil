import { createClient } from "@supabase/supabase-js";

export async function checkAIServiceStatus(supabaseAdmin?: ReturnType<typeof createClient>): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client = supabaseAdmin || createClient(url, key);

  try {
    const { data, error } = await client
      .from("pago_de_servicios")
      .select("estado")
      .eq("id", 1)
      .single();

    if (error || !data || data.estado !== "SI") {
      return false; // Not active
    }
    return true; // Active
  } catch (error) {
    console.error("Error checking AI service status:", error);
    return false; // Fail safe: block AI if db is down
  }
}

export function aiServiceDisabledResponse() {
  return new Response("El servicio IA está fuera de servicio por cuota", { status: 402 });
}
