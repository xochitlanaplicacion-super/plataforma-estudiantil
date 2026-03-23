'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Limpia los datos eliminando el campo ID si es una cadena vacía o nulo,
 * evitando errores de tipo UUID en PostgreSQL al realizar un upsert.
 * Además, convierte cualquier cadena vacía en null para campos opcionales.
 */
const prepareForUpsert = (data: any) => {
  const cleanData = { ...data };
  
  // Manejo del ID principal
  if (!cleanData.id || cleanData.id === '' || cleanData.id === 'new') {
    delete cleanData.id;
  }

  // Convertir todas las demás cadenas vacías a null (vital para UUIDs opcionales como grado_id)
  Object.keys(cleanData).forEach(key => {
    if (cleanData[key] === '') {
      cleanData[key] = null;
    }
  });

  return cleanData;
};

// --- NIVELES ---
export async function getNiveles() {
  const { data, error } = await supabaseAdmin.from('niveles').select('*').order('nombre');
  return { data, error };
}

export async function upsertNivel(nivel: any) {
  const cleanData = prepareForUpsert(nivel);
  const { data, error } = await supabaseAdmin.from('niveles').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/estructura');
  return { data, error };
}

export async function deleteNivel(id: string) {
  const { error } = await supabaseAdmin.from('niveles').delete().eq('id', id);
  revalidatePath('/dashboard/admin/estructura');
  return { error };
}

// --- CARRERAS ---
export async function getCarreras(nivelId?: string) {
  let query = supabaseAdmin.from('carreras').select('*, niveles(nombre)');
  if (nivelId) query = query.eq('nivel_id', nivelId);
  const { data, error } = await query.order('nombre');
  return { data, error };
}

export async function upsertCarrera(carrera: any) {
  const cleanData = prepareForUpsert(carrera);
  const { data, error } = await supabaseAdmin.from('carreras').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/estructura');
  revalidatePath('/dashboard/admin/grupos');
  return { data, error };
}

export async function deleteCarrera(id: string) {
  const { error } = await supabaseAdmin.from('carreras').delete().eq('id', id);
  revalidatePath('/dashboard/admin/estructura');
  return { error };
}

// --- GRADOS ---
export async function getGrados(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('grados').select('*').eq('carrera_id', carreraId).order('orden');
  return { data, error };
}

export async function upsertGrado(grado: any) {
  const cleanData = prepareForUpsert(grado);
  const { data, error } = await supabaseAdmin.from('grados').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/grupos');
  return { data, error };
}

export async function deleteGrado(id: string) {
  const { error } = await supabaseAdmin.from('grados').delete().eq('id', id);
  revalidatePath('/dashboard/admin/grupos');
  return { error };
}

// --- GRUPOS ---
export async function getGrupos(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('grupos').select('*, grados(nombre)').eq('carrera_id', carreraId).order('nombre');
  return { data, error };
}

export async function upsertGrupo(grupo: any) {
  const cleanData = prepareForUpsert(grupo);
  const { data, error } = await supabaseAdmin.from('grupos').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/grupos');
  return { data, error };
}

export async function deleteGrupo(id: string) {
  const { error } = await supabaseAdmin.from('grupos').delete().eq('id', id);
  revalidatePath('/dashboard/admin/grupos');
  return { error };
}

// --- MATERIAS ---
export async function getMaterias(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('materias').select('*').eq('carrera_id', carreraId).order('nombre');
  return { data, error };
}

export async function upsertMateria(materia: any) {
  const cleanData = prepareForUpsert(materia);
  const { data, error } = await supabaseAdmin.from('materias').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

export async function deleteMateria(id: string) {
  const { error } = await supabaseAdmin.from('materias').delete().eq('id', id);
  revalidatePath('/dashboard/admin/materias');
  return { error };
}

// --- UNIDADES ---
export async function getUnidades(materiaId: string) {
  const { data, error } = await supabaseAdmin.from('unidades').select('*').eq('materia_id', materiaId).order('orden');
  return { data, error };
}

export async function upsertUnidad(unidad: any) {
  const cleanData = prepareForUpsert(unidad);
  const { data, error } = await supabaseAdmin.from('unidades').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

export async function deleteUnidad(id: string) {
  const { error } = await supabaseAdmin.from('unidades').delete().eq('id', id);
  revalidatePath('/dashboard/admin/materias');
  return { error };
}

// --- TEMAS ---
export async function getTemas(unidadId: string) {
  const { data, error } = await supabaseAdmin.from('temas').select('*').eq('unidad_id', unidadId).order('orden');
  return { data, error };
}

export async function upsertTema(tema: any) {
  const cleanData = prepareForUpsert(tema);
  const { data, error } = await supabaseAdmin.from('temas').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

export async function deleteTema(id: string) {
  const { error } = await supabaseAdmin.from('temas').delete().eq('id', id);
  revalidatePath('/dashboard/admin/materias');
  return { error };
}

// --- EJERCICIOS ---
export async function getEjercicios(temaId: string) {
  const { data, error } = await supabaseAdmin.from('ejercicios').select('*').eq('tema_id', temaId).order('orden');
  return { data, error };
}

export async function upsertEjercicio(ejercicio: any) {
  const cleanData = prepareForUpsert(ejercicio);
  const { data, error } = await supabaseAdmin.from('ejercicios').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

export async function deleteEjercicio(id: string) {
  const { error } = await supabaseAdmin.from('ejercicios').delete().eq('id', id);
  revalidatePath('/dashboard/admin/materias');
  return { error };
}
