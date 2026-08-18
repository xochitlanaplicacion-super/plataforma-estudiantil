import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuuohbztrxxneozagecr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKET = 'diapositivas-assets';

export async function GET(request: NextRequest) {
  try {
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
    
    // 2. Obtener todos los archivos del bucket en la raíz
    const { data: filesInBucket, error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

    if (storageError) {
      console.error('[CRON DIAPOSITIVAS] Error fetching storage list:', storageError);
      return NextResponse.json({ error: storageError.message }, { status: 500 });
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
      const pathsToRemove = orphanedFiles.map(f => f.name);
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
