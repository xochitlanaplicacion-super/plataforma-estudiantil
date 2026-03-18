
'use server'

import { supabase } from './supabase'
import { redirect } from 'next/navigation'

/**
 * Lógica de servidor para autenticación.
 * Nota: Es preferible usar supabase.auth.signInWithPassword en el cliente
 * para que el navegador maneje las cookies automáticamente en el middleware.
 */
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
