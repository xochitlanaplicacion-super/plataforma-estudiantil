import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DURACION_SERVICIO_DIAS = 30;

export async function GET(request: NextRequest) {
  try {
    // 1. Obtener el registro de pago de servicios
    const { data, error } = await supabaseAdmin
      .from('pago_de_servicios')
      .select('id, estado, fecha_inicio')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('[CRON check-servicio] Error leyendo pago_de_servicios:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ message: 'No se encontró registro de pago de servicios' }, { status: 404 });
    }

    // 2. Si el estado ya es NO, no hay nada que hacer
    if (data.estado !== 'SI') {
      return NextResponse.json({
        message: 'El servicio ya está suspendido, no se requiere acción.',
        estado: data.estado,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Si no tiene fecha_inicio, no podemos calcular vigencia
    if (!data.fecha_inicio) {
      return NextResponse.json({
        message: 'El servicio está activo pero no tiene fecha_inicio configurada. No se puede verificar vigencia.',
        estado: data.estado,
        timestamp: new Date().toISOString(),
      });
    }

    // 4. Calcular si ya venció (fecha_inicio + 30 días)
    const fechaInicio = new Date(data.fecha_inicio + 'T00:00:00');
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaFin.getDate() + DURACION_SERVICIO_DIAS);

    const ahora = new Date();

    if (ahora >= fechaFin) {
      // ¡Venció! Cambiar estado a NO
      const { error: updateError } = await supabaseAdmin
        .from('pago_de_servicios')
        .update({ estado: 'NO' })
        .eq('id', 1);

      if (updateError) {
        console.error('[CRON check-servicio] Error actualizando estado a NO:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      const resultado = {
        message: '⛔ Servicio de plataforma SUSPENDIDO automáticamente por vencimiento de vigencia.',
        fecha_inicio: data.fecha_inicio,
        fecha_fin: fechaFin.toISOString().split('T')[0],
        estado_anterior: 'SI',
        estado_nuevo: 'NO',
        timestamp: ahora.toISOString(),
      };

      console.log('[CRON check-servicio]', resultado);
      return NextResponse.json(resultado);
    }

    // 5. Aún vigente
    const diasRestantes = Math.ceil((fechaFin.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      message: `Servicio activo. Quedan ${diasRestantes} día(s).`,
      fecha_inicio: data.fecha_inicio,
      fecha_fin: fechaFin.toISOString().split('T')[0],
      dias_restantes: diasRestantes,
      estado: 'SI',
      timestamp: ahora.toISOString(),
    });

  } catch (err: any) {
    console.error('[CRON check-servicio] Error inesperado:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
