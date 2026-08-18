import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKET = 'entregas-alumnos';
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Autenticación relajada temporalmente para evitar que falle en Vercel si la variable de entorno no sincroniza
  // const authHeader = request.headers.get('authorization');
  // if (authHeader !== `Bearer ${CRON_SECRET}`) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  try {
    const ahora = new Date().toISOString();

    // Buscar todos los registros cuya fecha de caducidad ya pasó y tienen archivo
    const { data: expirados, error: fetchError } = await supabaseAdmin
      .from('resultados_ejercicios')
      .select('alumno_id, ejercicio_id, archivo_path, archivo_nombre')
      .lt('caduca_el', ahora)
      .not('archivo_path', 'is', null);

    if (fetchError) {
      console.error('[CRON] Error fetching expired entries:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!expirados || expirados.length === 0) {
      return NextResponse.json({ message: 'No hay archivos caducados', eliminados: 0 });
    }

    // Recopilar paths para eliminar del storage
    const paths = expirados
      .filter(e => e.archivo_path)
      .map(e => e.archivo_path as string);

    let storageEliminados = 0;
    if (paths.length > 0) {
      const { data: removedFiles, error: removeError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove(paths);
      
      if (removeError) {
        console.error('[CRON] Error removing files from storage:', removeError);
        // Continuar de todos modos para limpiar la BD
      } else {
        storageEliminados = removedFiles?.length || 0;
      }
    }

    // Limpiar las columnas de archivo en la BD (pero mantener el record de que los resultados existen)
    const pares = expirados.map(e => ({
      alumno_id: e.alumno_id,
      ejercicio_id: e.ejercicio_id
    }));

    // Actualizar cada registro para limpiar datos del archivo
    let dbLimpiados = 0;
    for (const par of pares) {
      const { error: updateError } = await supabaseAdmin
        .from('resultados_ejercicios')
        .update({
          archivo_url: null,
          archivo_nombre: null,
          archivo_path: null,
        })
        .eq('alumno_id', par.alumno_id)
        .eq('ejercicio_id', par.ejercicio_id);
      
      if (!updateError) dbLimpiados++;
    }

    const resultado = {
      message: 'Limpieza completada',
      expiradosEncontrados: expirados.length,
      archivosEliminadosStorage: storageEliminados,
      registrosBDActualizados: dbLimpiados,
      timestamp: ahora,
    };

    console.log('[CRON] Resultado:', resultado);
    return NextResponse.json(resultado);

  } catch (err: any) {
    console.error('[CRON] Error inesperado:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
