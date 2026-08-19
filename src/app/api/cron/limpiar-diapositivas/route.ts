import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'diapositivas-assets';

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const ahora = new Date().toISOString();

    // 1. Obtener todas las URL/Paths activos de la base de datos (recursos)
    // Extraemos todo el contenido de la tabla recursos y lo pasamos por la expresión regular
    const { data: recursos, error: dbError } = await supabaseAdmin.from('recursos').select('*');

    if (dbError) {
      console.error('[CRON DIAPOSITIVAS] Error obteniendo recursos:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const allDbContent = JSON.stringify(recursos);
    const activeUrls = new Set<string>();
    const regex = new RegExp(`/${BUCKET}/([^"\\s?\\#]+)`, 'g');
    
    let match;
    while ((match = regex.exec(allDbContent)) !== null) {
      if (match[1]) activeUrls.add(match[1]);
    }
    
    // Convertimos a array para compatibilidad con la lógica de filtrado de abajo
    const activeUrlsArray = Array.from(activeUrls);
    
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id');
    const filesInBucket: Array<any & { fullPath: string }> = [];
    for (const tenant of tenants || []) {
      const { data: files, error: storageError } = await supabaseAdmin.storage.from(BUCKET)
        .list(tenant.id, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (storageError) throw storageError;
      for (const file of files || []) filesInBucket.push({ ...file, fullPath: `${tenant.id}/${file.name}` });
    }

    if (!filesInBucket || filesInBucket.length === 0) {
      return NextResponse.json({ message: 'El bucket está vacío.', eliminados: 0 });
    }

    // 3. Filtrar los archivos huérfanos
    // Importante: ignorar .emptyFolderPlaceholder u otros archivos del sistema si existen
    const orphanedFiles = filesInBucket.filter(file => {
      // Ignorar placeholders
      if (file.name === '.emptyFolderPlaceholder') return false;
      
      // GRACIA DE 12 HORAS: Evitar borrar imágenes que un profesor está subiendo ahora mismo
      // y que aún no ha guardado en la base de datos.
      if (file.created_at) {
        const createdAt = new Date(file.created_at).getTime();
        const now = new Date().getTime();
        const horasAntiguedad = (now - createdAt) / (1000 * 60 * 60);
        if (horasAntiguedad < 12) return false;
      }

      // Checar si el nombre del archivo está contenido en alguna de las active URLs
      const isUsed = activeUrlsArray.some((url: string) => url.includes(file.name));
      return !isUsed;
    });

    // 4. Eliminar del storage los huérfanos
    let storageEliminados = 0;
    if (orphanedFiles.length > 0) {
      const pathsToRemove = orphanedFiles.map(f => f.fullPath);
      const { data: removedFiles, error: removeError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove(pathsToRemove);
      
      if (removeError) {
        console.error('[CRON DIAPOSITIVAS] Error removing orphaned files:', removeError);
      } else {
        storageEliminados = removedFiles?.length || 0;
      }
    }

    const resultado = {
      message: 'Limpieza de diapositivas huérfanas completada',
      totalArchivosEnBucket: filesInBucket.length,
      urlsActivasEnBd: activeUrlsArray.length,
      huerfanosEncontrados: orphanedFiles.length,
      archivosEliminadosStorage: storageEliminados,
      timestamp: ahora,
    };

    console.log('[CRON DIAPOSITIVAS] Resultado:', resultado);
    return NextResponse.json(resultado);

  } catch (err: any) {
    console.error('[CRON DIAPOSITIVAS] Error inesperado:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
