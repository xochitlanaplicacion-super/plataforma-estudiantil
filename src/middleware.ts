
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = req.nextUrl.pathname

  // Rutas públicas
  const publicPaths = ['/', '/expired']
  if (publicPaths.some(path => pathname === path)) {
    // Si ya tiene sesión y está en /, mandarlo al dashboard
    if (session && pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard/admin', req.url))
    }
    return res
  }

  // Si no hay sesión, al login
  if (!session) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Validación de perfil (solo para rutas protegidas)
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', session.user.id)
    .single()

  // Si no hay perfil o está inactivo, cerrar sesión
  if (!profile || profile.estatus !== 'activo') {
    return NextResponse.redirect(new URL('/?error=perfil_no_activo', req.url))
  }

  // Verificación de expiración
  if (profile.fecha_expiracion) {
    const hoy = new Date().toISOString().split('T')[0]
    if (profile.fecha_expiracion < hoy && pathname !== '/expired') {
      return NextResponse.redirect(new URL('/expired', req.url))
    }
  }

  return res
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/',
    '/expired',
  ],
}
