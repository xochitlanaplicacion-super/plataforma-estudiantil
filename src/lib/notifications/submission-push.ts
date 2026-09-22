import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Ticket = { status: string; id?: string; details?: { error?: string } };
async function expo(endpoint: string, body: unknown) {
  const response = await fetch(`https://exp.host/--/api/v2/push/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`PUSH_HTTP_${response.status}`);
  return response.json();
}
export async function dispatchSubmissionPush() {
  // Explicit rollout gate: do not contact Expo before credentials/configuration are ready.
  if (process.env.KIBO_PUSH_ENABLED !== 'true') return { enabled: false, submitted: 0 };
  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: receipts, error: receiptError } = await db.from('cola_push_entregas')
    .select('id,token,ticket_id,profesor_id,tenant_id').eq('estado','ticket').lte('next_attempt',now).limit(100);
  if (receiptError) throw receiptError;
  if (receipts?.length) {
    const response = await expo('getReceipts', { ids: receipts.map(row => row.ticket_id) });
    for (const row of receipts) {
      const receipt: Ticket | undefined = response.data?.[row.ticket_id];
      if (!receipt) continue;
      const code = receipt.details?.error ?? 'PUSH_DELIVERY_ERROR';
      if (code === 'DeviceNotRegistered' && receipt.status === 'error') {
        const { error } = await db.from('dispositivos_push_docente').delete().eq('token',row.token).eq('profesor_id',row.profesor_id).eq('tenant_id',row.tenant_id);
        if (error) throw error;
      } else {
        const { error } = await db.from('cola_push_entregas').update({ estado: receipt.status === 'ok' ? 'sent' : 'failed',
          error_code: receipt.status === 'ok' ? null : code }).eq('id',row.id).eq('estado','ticket');
        if (error) throw error;
      }
    }
  }
  const { data: rows, error } = await db.rpc('reclamar_push_entregas');
  if (error) throw error;
  if (!rows?.length) return { enabled: true, submitted: 0 };
  try {
    const response = await expo('send', rows.map((row: any) => ({
      to: row.token, title: 'KIBO · Nueva entrega', body: 'Un alumno entregó una tarea. Toca para revisarla.',
      sound: 'default', priority: 'high', channelId: 'kibo-entregas-v1',
      data: { type: 'submission', notificationId: row.id, teacherId: row.profesor_id,
        tenantId: row.tenant_id, assignmentId: row.asignacion_id, exerciseId: row.ejercicio_id },
    })));
    if (!Array.isArray(response.data) || response.data.length !== rows.length) throw new Error('PUSH_RESPONSE_INVALID');
    for (let i=0;i<rows.length;i++) {
      const row=rows[i], ticket=response.data[i] as Ticket;
      const code=ticket.details?.error ?? 'PUSH_TICKET_ERROR';
      if (ticket.status==='error' && code==='DeviceNotRegistered') {
        const result=await db.from('dispositivos_push_docente').delete().eq('token',row.token).eq('profesor_id',row.profesor_id).eq('tenant_id',row.tenant_id);
        if (result.error) throw result.error;
      } else {
        const result=await db.from('cola_push_entregas').update({
          estado: ticket.status==='ok' && ticket.id ? 'ticket' : 'failed', ticket_id: ticket.id ?? null,
          next_attempt: new Date(Date.now()+15*60*1000).toISOString(), error_code: ticket.status==='ok' ? null : code,
        }).eq('id',row.id).eq('estado','sending');
        if (result.error) throw result.error;
      }
    }
    return { enabled: true, submitted: rows.length };
  } catch {
    // Only unfinished leases are retried; accepted tickets are never deliberately resent.
    for (const row of rows) {
      await db.from('cola_push_entregas').update({estado:row.attempts>=5?'failed':'pending',
        error_code:'PUSH_TRANSPORT_RETRY',next_attempt:new Date(Date.now()+Math.min(3600000,60000*2**row.attempts)).toISOString(),
      }).eq('id',row.id).eq('estado','sending');
    }
    throw new Error('PUSH_DISPATCH_RETRY_PENDING');
  }
}
