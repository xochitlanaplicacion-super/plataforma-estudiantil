'use server';

import { requireTenantSession } from '@/lib/tenant/context';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

// --- OBTENER NIVELES ---
export async function getNiveles() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const { data, error } = await supabaseAdmin.from('niveles').select('*').order('nombre');
  return { data, error };
}

// --- OBTENER MATERIALES ---
export async function getTodosLosMateriales() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const { data, error } = await supabaseAdmin
    .from('material_apoyo')
    .select('*, niveles(nombre), profiles(nombre, apellidos)')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function getMaterialPorNivel(nivelId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const { data, error } = await supabaseAdmin
    .from('material_apoyo')
    .select('*, perfiles:created_by(nombre, apellidos)')
    .eq('nivel_id', nivelId)
    .order('created_at', { ascending: false });
  return { data, error };
}

// --- MATERIAL PÚBLICO PARA ALUMNOS (solo publicado=true) ---
export async function getMaterialPublicoPorNivel(nivelId: string, carreraId?: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    let query = supabaseAdmin
      .from('material_apoyo')
      .select('id, titulo, categoria, descripcion, archivo_url, tipo_archivo, tamano_bytes, carreras_ids, created_at')
      .eq('nivel_id', nivelId)
      .eq('publicado', true);

    if (carreraId) {
      // Verifica si el array contiene la carrera OR si es nulo/vacío (global)
      query = query.or(`carreras_ids.cs.{${carreraId}},carreras_ids.is.null,carreras_ids.eq.{}`);
    }

    const { data, error } = await query
      .order('categoria')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error: any) {
    console.error('Error getMaterialPublicoPorNivel:', error.message);
    return { data: [], error: error.message };
  }
}

// --- GENERAR URL FIRMADA PARA PREVIEW (más corta, sin forzar descarga) ---
export async function generateSignedUrlPreview(path: string) {
  const { supabase: supabaseAdmin, tenantId } = await requireTenantSession();
  try {
    if (!path.startsWith(`${tenantId}/`)) throw new Error('Archivo fuera de la institución');
    const { data, error } = await supabaseAdmin.storage
      .from('material-apoyo')
      .createSignedUrl(path, 3600); // Sin opción download, para abrir inline

    if (error) throw error;
    return { success: true, signedUrl: data.signedUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- SUBIR MATERIAL (CARGA MASIVA) ---
export async function uploadMaterial(formData: FormData, userId: string) {
  const { supabase: supabaseAdmin, tenantId, user } = await requireTenantSession(['superuser', 'admin', 'profesor']);
  try {
    const files = formData.getAll('files') as File[];
    const categoria = formData.get('categoria') as string;
    const descripcion = formData.get('descripcion') as string;
    const nivelId = formData.get('nivel_id') as string;
    const carrerasIdsStr = formData.get('carreras_ids') as string;

    if (!files || files.length === 0 || !categoria || !nivelId) {
      return { success: false, error: 'Faltan datos requeridos (archivos, categoría, nivel).' };
    }

    let carreras_ids: string[] = [];
    if (carrerasIdsStr) {
      try { carreras_ids = JSON.parse(carrerasIdsStr); } catch(e) {}
    }

    const maxFileSize = 20971520; // 20 MB

    const insertDataArray: any[] = [];
    const uploadedPaths: string[] = [];

    for (const file of files) {
      if (file.size > maxFileSize) {
        // Rollback already uploaded files
        for (const path of uploadedPaths) {
          await supabaseAdmin.storage.from('material-apoyo').remove([path]);
        }
        return { success: false, error: `El archivo ${file.name} excede el límite de 20MB.` };
      }

      let tipoArchivo: 'pdf' | 'word' | 'excel' | 'powerpoint' = 'pdf';
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (['doc', 'docx'].includes(ext || '')) tipoArchivo = 'word';
      else if (['xls', 'xlsx'].includes(ext || '')) tipoArchivo = 'excel';
      else if (['ppt', 'pptx'].includes(ext || '')) tipoArchivo = 'powerpoint';
      else if (ext === 'pdf') tipoArchivo = 'pdf';
      else {
        for (const path of uploadedPaths) {
          await supabaseAdmin.storage.from('material-apoyo').remove([path]);
        }
        return { success: false, error: `El formato de ${file.name} no es soportado.` };
      }

      const timestamp = Date.now();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const filePath = `${tenantId}/material/${nivelId}/${timestamp}_${cleanFileName}`;

      const { data: storageData, error: storageError } = await supabaseAdmin.storage
        .from('material-apoyo')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (storageError) {
        for (const path of uploadedPaths) {
          await supabaseAdmin.storage.from('material-apoyo').remove([path]);
        }
        throw storageError;
      }

      uploadedPaths.push(storageData.path);

      insertDataArray.push({
        nivel_id: nivelId,
        titulo: file.name, // El nombre original del archivo individual
        categoria,          // El agrupador global
        descripcion: descripcion || null,
        archivo_url: storageData.path,
        tipo_archivo: tipoArchivo,
        tamano_bytes: file.size,
        publicado: true,
        carreras_ids: carreras_ids.length > 0 ? carreras_ids : null,
        created_by: user.id,
        tenant_id: tenantId,
      });
    }

    // Insertar registros en batch
    const { error: dbError } = await supabaseAdmin.from('material_apoyo').insert(insertDataArray);

    if (dbError) {
      // Rollback
      await supabaseAdmin.storage.from('material-apoyo').remove(uploadedPaths);
      throw dbError;
    }

    revalidatePath('/dashboard/admin/material');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- GUARDAR REGISTROS (CUANDO LA CARGA STORAGE SE HIZO EN CLIENTE) ---
export async function guardarRegistrosMaterialMasivo(insertDataArray: any[]) {
  const { supabase: supabaseAdmin, tenantId, user } = await requireTenantSession(['superuser', 'admin', 'profesor']);
  try {
    if (insertDataArray.some((row) => !String(row.archivo_url || '').startsWith(`${tenantId}/`))) throw new Error('Ruta de archivo fuera de la institución');
    const rows = insertDataArray.map((row) => ({ ...row, tenant_id: tenantId, created_by: user.id }));
    const { error } = await supabaseAdmin.from('material_apoyo').insert(rows);
    if (error) throw error;
    
    revalidatePath('/dashboard/admin/material');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


// --- ELIMINAR MATERIAL ---
export async function deleteMaterial(id: string, archivoUrl: string) {
  const { supabase: supabaseAdmin, tenantId } = await requireTenantSession(['superuser', 'admin', 'profesor']);
  try {
    if (!archivoUrl.startsWith(`${tenantId}/`)) throw new Error('Archivo fuera de la institución');
    const { error: dbError } = await supabaseAdmin.from('material_apoyo').delete().eq('id', id);
    if (dbError) throw dbError;

    const { error: storageError } = await supabaseAdmin.storage.from('material-apoyo').remove([archivoUrl]);
    if (storageError) throw storageError;

    revalidatePath('/dashboard/admin/material');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- EDITAR CATEGORÍA COMPLETA ---
export async function updateCategoriaCompleta(
  oldNivelId: string, 
  oldCategoria: string, 
  newNivelId: string, 
  newCategoria: string, 
  newDescripcion: string | null,
  newCarrerasIds?: string[] | null
) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { error } = await supabaseAdmin
      .from('material_apoyo')
      .update({ 
        categoria: newCategoria,
        nivel_id: newNivelId,
        descripcion: newDescripcion,
        carreras_ids: newCarrerasIds && newCarrerasIds.length > 0 ? newCarrerasIds : null
      })
      .match({ nivel_id: oldNivelId, categoria: oldCategoria });
    if (error) throw error;
    
    revalidatePath('/dashboard/admin/material');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ELIMINAR CATEGORÍA COMPLETA (CASCADA) ---
export async function deleteCategoria(nivel_id: string, categoria: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    // 1. Obtener todos los archivos para borrar de storage
    const { data: archivos, error: fetchError } = await supabaseAdmin
      .from('material_apoyo')
      .select('archivo_url')
      .match({ nivel_id, categoria });
      
    if (fetchError) throw fetchError;

    // 2. Borrar del Storage (Bucket)
    if (archivos && archivos.length > 0) {
      const urlsToDelete = archivos.map(a => a.archivo_url);
      const { error: storageError } = await supabaseAdmin.storage.from('material-apoyo').remove(urlsToDelete);
      if (storageError) throw storageError;
    }

    // 3. Borrar de la BD (Cascada)
    const { error: dbError } = await supabaseAdmin
      .from('material_apoyo')
      .delete()
      .match({ nivel_id, categoria });
    if (dbError) throw dbError;

    revalidatePath('/dashboard/admin/material');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- TOGGLE PUBLICADO ---
export async function togglePublicado(id: string, isPublicado: boolean) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { error } = await supabaseAdmin
      .from('material_apoyo')
      .update({ publicado: isPublicado })
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/dashboard/admin/material');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- URL FIRMADA PARA DESCARGA (URL válida por 1 hora) ---
export async function generateSignedUrl(path: string, downloadName?: string) {
  const { supabase: supabaseAdmin, tenantId } = await requireTenantSession();
  try {
    if (!path.startsWith(`${tenantId}/`)) throw new Error('Archivo fuera de la institución');
    const { data, error } = await supabaseAdmin.storage
      .from('material-apoyo')
      .createSignedUrl(path, 3600, {
        download: downloadName || true, // Usar el nombre original si se proporciona
      });

    if (error) throw error;
    return { success: true, signedUrl: data.signedUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- CONSULTAR ESPACIO USADO ---
export async function getStorageUsed() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    const { data, error } = await supabaseAdmin.storage
      .from('material-apoyo')
      .list(`${(await requireTenantSession()).tenantId}/material`, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
        search: ''
      });
      
    // Nota: El list de supabase.storage por defecto no escanea carpetas recursivamente, 
    // pero para nuestro cálculo exacto, vamos a usar mejor la suma total desde la BD 
    // que ya guarda "tamano_bytes" de cada archivo, lo cual es mucho más seguro y rápido.

    const { data: records, error: dbError } = await supabaseAdmin
      .from('material_apoyo')
      .select('tamano_bytes');

    if (dbError) throw dbError;

    const totalBytes = records.reduce((acc, curr) => acc + (curr.tamano_bytes || 0), 0);
    const totalMb = totalBytes / (1024 * 1024);
    
    return { success: true, usedMb: Number(totalMb.toFixed(2)) };
  } catch (error: any) {
    return { success: false, usedMb: 0 };
  }
}
