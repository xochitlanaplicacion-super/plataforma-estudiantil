'use server';

import { createServerSupabaseClient } from '../supabase/server';
import { revalidatePath } from 'next/cache';

export async function uploadProfilePicture(formData: FormData) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'No autorizado' };
    }

    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, error: 'No se envió ningún archivo' };
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // 1. Obtener perfil actual para borrar la imagen anterior
    const { data: profile } = await supabase
      .from('profiles')
      .select('foto_perfil')
      .eq('id', user.id)
      .single();

    // 2. Subir nueva imagen
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading avatar:', uploadError);
      return { success: false, error: 'Error al subir la imagen al bucket' };
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // 3. Actualizar el perfil en la base de datos
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ foto_perfil: publicUrl })
      .eq('id', user.id);

    if (updateError) {
      return { success: false, error: 'Error al actualizar el perfil en la base de datos' };
    }

    // 4. Borrar la imagen anterior si existe en el bucket
    if (profile?.foto_perfil) {
      try {
        const urlObj = new URL(profile.foto_perfil);
        const pathParts = urlObj.pathname.split('/avatars/');
        if (pathParts.length > 1) {
          const oldFilePath = pathParts[1];
          await supabase.storage.from('avatars').remove([oldFilePath]);
        }
      } catch (e) {
        console.error('Failed to parse old avatar URL to delete:', e);
      }
    }

    // Refrescar las rutas para que la UI se actualice
    revalidatePath('/dashboard/alumno/perfil');
    revalidatePath('/dashboard', 'layout'); 
    
    return { success: true, url: publicUrl };
  } catch (error: any) {
    console.error('Upload profile picture error:', error);
    return { success: false, error: error.message || 'Error inesperado' };
  }
}
