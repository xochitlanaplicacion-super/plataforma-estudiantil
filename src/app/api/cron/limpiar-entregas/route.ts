import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'entregas-alumnos';
const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 100;

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const ahora = new Date().toISOString();

    // Buscar todos los registros cuya fecha de caducidad ya pasó y tienen archivo
    const { data: expirados, error: fetchError } = await supabaseAdmin
      .from('resultados_ejercicios')
      .select('tenant_id, alumno_id, ejercicio_id, archivo_path, archivo_nombre, caduca_el')
      .lt('caduca_el', ahora)
      .not('archivo_path', 'is', null)
      .order('caduca_el', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[CRON] Error fetching expired entries:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!expirados || expirados.length === 0) {
      return NextResponse.json({ message: 'No hay archivos caducados', eliminados: 0 });
    }

    let storageEliminados = 0;
    let dbLimpiados = 0;
    let omitidosPorCambio = 0;
    let rutasInvalidas = 0;
    const errores: Array<{ path: string; error: string }> = [];

    // El borrado se hace por objeto para no perder la referencia en BD si Storage falla.
    // La actualización exige el mismo archivo_path: si el alumno reemplazó el archivo
    // durante la ejecución, el cron nunca borra la referencia nueva.
    for (const entrega of expirados) {
      const path = entrega.archivo_path as string;
      if (!path.startsWith(`${entrega.tenant_id}/entregas/${entrega.alumno_id}/`)) {
        rutasInvalidas++;
        errores.push({ path, error: 'Ruta fuera del espacio esperado para la entrega' });
        continue;
      }

      const { data: removedFiles, error: removeError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([path]);

      if (removeError) {
        console.error('[CRON] Error removing file from storage:', path, removeError);
        errores.push({ path, error: removeError.message });
        continue;
      }
      storageEliminados += removedFiles?.length || 0;

      const { data: limpiados, error: updateError } = await supabaseAdmin
        .from('resultados_ejercicios')
        .update({
          archivo_url: null,
          archivo_nombre: null,
          archivo_path: null,
        })
        .eq('alumno_id', entrega.alumno_id)
        .eq('ejercicio_id', entrega.ejercicio_id)
        .eq('tenant_id', entrega.tenant_id)
        .eq('archivo_path', path)
        .lt('caduca_el', ahora)
        .select('alumno_id');

      if (updateError) {
        errores.push({ path, error: updateError.message });
      } else if (limpiados?.length) {
        dbLimpiados += limpiados.length;
      } else {
        omitidosPorCambio++;
      }
    }

    const resultado = {
      message: 'Limpieza completada',
      expiradosEncontrados: expirados.length,
      archivosEliminadosStorage: storageEliminados,
      registrosBDActualizados: dbLimpiados,
      omitidosPorCambioConcurrente: omitidosPorCambio,
      rutasInvalidas,
      errores: errores.length,
      quedanPendientes: expirados.length === BATCH_SIZE,
      timestamp: ahora,
    };

    console.log('[CRON] Resultado:', resultado);
    return NextResponse.json(resultado);

  } catch (err: any) {
    console.error('[CRON] Error inesperado:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
