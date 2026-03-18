
'use server'

import { supabase, createServerClient } from './supabase'
import { redirect } from 'next/navigation'

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion, nombre, apellidos')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    await supabase.auth.signOut()
    return { success: false, error: 'Perfil no encontrado' }
  }

  if (profile.estatus !== 'activo') {
    await supabase.auth.signOut()
    return { success: false, error: 'Cuenta inactiva. Contacta al administrador.' }
  }

  const hoy = new Date().toISOString().split('T')[0]
  if (profile.fecha_expiracion && profile.fecha_expiracion < hoy) {
    await supabase.auth.signOut()
    return { success: false, error: `Tu acceso expiró el ${profile.fecha_expiracion}` }
  }

  return { 
    success: true, 
    user: data.user, 
    profile 
  }
}

export async function logout() {
  await supabase.auth.signOut()
  redirect('/')
}

export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  return { user: session.user, profile }
}
