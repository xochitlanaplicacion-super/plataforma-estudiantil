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
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Primero elimina cargas directas que nunca llegaron a registrarse. El
    // cambio condicional a expired reclama el intento y evita competir con una
    // confirmación activa del alumno.
    const { data: staleIntents, error: intentFetchError } = await supabaseAdmin
      .from('student_submission_upload_intents')
      .select('id, tenant_id, alumno_id, ejercicio_id, object_path, status')
      .in('status', ['pending', 'processing', 'cancelled'])
      .lt('expires_at', ahora)
      .lt('updated_at', staleBefore)
      .order('expires_at', { ascending: true })
      .limit(BATCH_SIZE);
    if (intentFetchError) throw intentFetchError;

    let intentosHuerfanosEliminados = 0;
    let intentosReferenciados = 0;
    let intentosOmitidosPorCambio = 0;
    const erroresIntentos: Array<{ path: string; error: string }> = [];
    for (const intent of staleIntents || []) {
      const { data: claimed } = await supabaseAdmin
        .from('student_submission_upload_intents')
        .update({ status: 'expired', updated_at: ahora })
        .eq('id', intent.id)
        .eq('tenant_id', intent.tenant_id)
        .in('status', ['pending', 'processing', 'cancelled'])
        .lt('expires_at', ahora)
        .lt('updated_at', staleBefore)
        .select('id')
        .maybeSingle();
      if (!claimed) {
        intentosOmitidosPorCambio++;
        continue;
      }

      const { data: reference, error: referenceError } = await supabaseAdmin
        .from('resultados_ejercicios')
        .select('id')
        .eq('tenant_id', intent.tenant_id)
        .eq('archivo_path', intent.object_path)
        .limit(1)
        .maybeSingle();
      if (referenceError) {
        erroresIntentos.push({ path: intent.object_path, error: referenceError.message });
        await supabaseAdmin
          .from('student_submission_upload_intents')
          .update({ status: 'cancelled', updated_at: ahora })
          .eq('id', intent.id)
          .eq('status', 'expired');
        continue;
      }
      if (reference) {
        await supabaseAdmin
          .from('student_submission_upload_intents')
          .update({ status: 'confirmed', confirmed_at: ahora, updated_at: ahora })
          .eq('id', intent.id)
          .eq('status', 'expired');
        intentosReferenciados++;
        continue;
      }

      const expectedPrefix = `${intent.tenant_id}/entregas/${intent.alumno_id}/${intent.ejercicio_id}/`;
      if (!intent.object_path.startsWith(expectedPrefix)) {
        erroresIntentos.push({ path: intent.object_path, error: 'Ruta fuera del espacio del intento' });
        continue;
      }
      const { error: orphanRemoveError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([intent.object_path]);
      if (orphanRemoveError) {
        erroresIntentos.push({ path: intent.object_path, error: orphanRemoveError.message });
        await supabaseAdmin
          .from('student_submission_upload_intents')
          .update({ status: 'cancelled', updated_at: ahora })
          .eq('id', intent.id)
          .eq('status', 'expired');
      } else {
        intentosHuerfanosEliminados++;
      }
    }

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

    let storageEliminados = 0;
    let dbLimpiados = 0;
    let omitidosPorCambio = 0;
    let rutasInvalidas = 0;
    const errores: Array<{ path: string; error: string }> = [];

    // El borrado se hace por objeto para no perder la referencia en BD si Storage falla.
    // La actualización exige el mismo archivo_path: si el alumno reemplazó el archivo
    // durante la ejecución, el cron nunca borra la referencia nueva.
    for (const entrega of expirados || []) {
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
      expiradosEncontrados: expirados?.length || 0,
      archivosEliminadosStorage: storageEliminados,
      registrosBDActualizados: dbLimpiados,
      omitidosPorCambioConcurrente: omitidosPorCambio,
      rutasInvalidas,
      errores: errores.length,
      intentosHuerfanosEliminados,
      intentosReferenciados,
      intentosOmitidosPorCambio,
      erroresIntentos,
      quedanPendientes: (expirados?.length || 0) === BATCH_SIZE || (staleIntents?.length || 0) === BATCH_SIZE,
      timestamp: ahora,
    };

    console.log('[CRON] Resultado:', resultado);
    return NextResponse.json(resultado);

  } catch (err: any) {
    console.error('[CRON] Error inesperado:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
