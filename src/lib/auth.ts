
'use server'

import { supabase, createServerClient } from './supabase'
import { redirect } from 'next/navigation'

// ✅ LOGIN DE USUARIO
export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  // Obtener perfil del usuario
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion, nombre, apellidos')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    await supabase.auth.signOut()
    return { success: false, error: 'Perfil no encontrado' }
  }

  // Validar estatus
  if (profile.estatus !== 'activo') {
    await supabase.auth.signOut()
    return { success: false, error: 'Cuenta inactiva. Contacta al administrador.' }
  }

  // Validar fecha de expiración
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

// ✅ LOGOUT
export async function logout() {
  await supabase.auth.signOut()
  redirect('/')
}

// ✅ CREAR USUARIO (Solo para superuser desde el panel)
export async function crearUsuario({
  email,
  password,
  nombre,
  apellidos,
  curp,
  rol,
  matricula,
  numero_empleado,
  fecha_expiracion,
}: {
  email: string
  password: string
  nombre: string
  apellidos: string
  curp: string
  rol: 'superuser' | 'admin' | 'profesor' | 'alumno'
  matricula?: string
  numero_empleado?: string
  fecha_expiracion?: string
}) {
  // Usar cliente de servidor con service role
  const supabaseAdmin = createServerClient()

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nombre,
      apellidos,
      curp,
      rol,
      matricula,
      numero_empleado,
    },
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  // El perfil se crea automáticamente por el trigger de la base de datos,
  // pero actualizamos los campos adicionales que no se manejan en el trigger si es necesario.
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      nombre,
      apellidos,
      curp,
      rol,
      matricula,
      numero_empleado,
      estatus: 'activo',
      fecha_inicio: new Date().toISOString().split('T')[0],
      fecha_expiracion: fecha_expiracion || null,
    })
    .eq('id', authData.user.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true, userId: authData.user.id }
}

// ✅ OBTENER USUARIO ACTUAL (para componentes de servidor)
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
