import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: rows, error } = await admin.from('pago_de_servicios')
      .select('id, tenant_id, estado, fecha_inicio, duracion_dias');
    if (error) throw error;

    const now = new Date();
    const suspended: string[] = [];
    const active: Array<{ tenantId: string; daysRemaining: number | null }> = [];
    for (const row of rows || []) {
      if (row.estado !== 'SI' || !row.fecha_inicio) {
        active.push({ tenantId: row.tenant_id, daysRemaining: null });
        continue;
      }
      const end = new Date(`${row.fecha_inicio}T00:00:00`);
      end.setDate(end.getDate() + Number(row.duracion_dias || 30));
      if (now >= end) {
        const { error: updateError } = await admin.from('pago_de_servicios')
          .update({ estado: 'NO', updated_at: now.toISOString() })
          .eq('tenant_id', row.tenant_id).eq('id', row.id);
        if (updateError) throw updateError;
        suspended.push(row.tenant_id);
        await admin.from('platform_audit').insert({
          tenant_id: row.tenant_id,
          accion: 'service.expired_automatically',
          detalles: { fecha_inicio: row.fecha_inicio, duracion_dias: row.duracion_dias, fecha_fin: end.toISOString() },
        });
      } else {
        active.push({ tenantId: row.tenant_id, daysRemaining: Math.ceil((end.getTime() - now.getTime()) / 86400000) });
      }
    }
    return NextResponse.json({ checked: rows?.length || 0, suspended, active, timestamp: now.toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
