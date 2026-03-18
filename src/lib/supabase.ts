import { createClient } from '@supabase/supabase-js'

// Durante el build de Vercel, estas variables pueden no estar presentes.
// Usamos fallbacks para evitar que el proceso de compilación falle.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Cliente público para uso en componentes de cliente (Browser)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Cliente para servidor (con service role - solo backend)
 * Esta función debe llamarse únicamente en Server Actions o API Routes.
 * Permite saltar las políticas RLS para tareas administrativas.
 */
export const createServerClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
  
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
