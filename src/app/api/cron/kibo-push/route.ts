import { NextRequest, NextResponse } from 'next/server';
import { dispatchSubmissionPush } from '@/lib/notifications/submission-push';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try { return NextResponse.json(await dispatchSubmissionPush()); }
  catch { return NextResponse.json({ error: 'Hay notificaciones pendientes de reintento.' }, { status: 503 }); }
}
