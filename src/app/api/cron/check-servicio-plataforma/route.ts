import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPlatformServiceEndDate } from '@/lib/service-countdown';

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
    const { data: features, error: featureError } = await admin.from('tenant_features')
      .select('tenant_id, timezone');
    if (featureError) throw featureError;
    const timezoneByTenant = new Map((features || []).map((feature) => [feature.tenant_id, feature.timezone]));

    const now = new Date();
    const suspended: string[] = [];
    const active: Array<{ tenantId: string; daysRemaining: number | null }> = [];
    for (const row of rows || []) {
      if (row.estado !== 'SI' || !row.fecha_inicio) {
        active.push({ tenantId: row.tenant_id, daysRemaining: null });
        continue;
      }
      const end = getPlatformServiceEndDate({
        ...row,
        timezone: timezoneByTenant.get(row.tenant_id) || 'America/Mexico_City',
      });
      if (!end) {
        active.push({ tenantId: row.tenant_id, daysRemaining: null });
        continue;
      }
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
