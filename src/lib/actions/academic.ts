
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

// --- NIVELES ---
export async function getNiveles() {
  const { data, error } = await supabaseAdmin.from('niveles').select('*').order('nombre');
  return { data, error };
}

export async function upsertNivel(nivel: any) {
  const { data, error } = await supabaseAdmin.from('niveles').upsert(nivel).select().single();
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
  const { data, error } = await supabaseAdmin.from('carreras').upsert(carrera).select().single();
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
  const { data, error } = await supabaseAdmin.from('grados').upsert(grado).select().single();
  revalidatePath('/dashboard/admin/grupos');
  return { data, error };
}

// --- GRUPOS ---
export async function getGrupos(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('grupos').select('*, grados(nombre)').eq('carrera_id', carreraId).order('nombre');
  return { data, error };
}

export async function upsertGrupo(grupo: any) {
  const { data, error } = await supabaseAdmin.from('grupos').upsert(grupo).select().single();
  revalidatePath('/dashboard/admin/grupos');
  return { data, error };
}

// --- MATERIAS ---
export async function getMaterias(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('materias').select('*').eq('carrera_id', carreraId).order('nombre');
  return { data, error };
}

export async function upsertMateria(materia: any) {
  const { data, error } = await supabaseAdmin.from('materias').upsert(materia).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

// --- UNIDADES ---
export async function getUnidades(materiaId: string) {
  const { data, error } = await supabaseAdmin.from('unidades').select('*').eq('materia_id', materiaId).order('orden');
  return { data, error };
}

export async function upsertUnidad(unidad: any) {
  const { data, error } = await supabaseAdmin.from('unidades').upsert(unidad).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

// --- TEMAS ---
export async function getTemas(unidadId: string) {
  const { data, error } = await supabaseAdmin.from('temas').select('*').eq('unidad_id', unidadId).order('orden');
  return { data, error };
}

export async function upsertTema(tema: any) {
  const { data, error } = await supabaseAdmin.from('temas').upsert(tema).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

// --- EJERCICIOS ---
export async function getEjercicios(temaId: string) {
  const { data, error } = await supabaseAdmin.from('ejercicios').select('*').eq('tema_id', temaId).order('orden');
  return { data, error };
}

export async function upsertEjercicio(ejercicio: any) {
  const { data, error } = await supabaseAdmin.from('ejercicios').upsert(ejercicio).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}
