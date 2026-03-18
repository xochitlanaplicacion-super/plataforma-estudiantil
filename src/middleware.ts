
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Obtenemos la sesión correctamente desestructurando el objeto 'data'
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = req.nextUrl.pathname

  // Rutas públicas que no requieren autenticación
  const publicPaths = ['/', '/expired']
  if (publicPaths.some(path => pathname === path)) {
    return res
  }

  // Si no hay sesión, redirigimos al login
  if (!session) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Obtenemos el perfil del usuario para validar permisos y vigencia
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', session.user.id)
    .single()

  // Validamos si la cuenta está activa
  if (profile?.estatus !== 'activo') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/?inactive=true', req.url))
  }

  // Validamos la fecha de expiración
  const hoy = new Date().toISOString().split('T')[0]
  if (profile?.fecha_expiracion && profile.fecha_expiracion < hoy) {
    if (pathname !== '/expired') {
      return NextResponse.redirect(new URL('/expired', req.url))
    }
  }

  // Protección de rutas por rol
  if (pathname.startsWith('/dashboard/admin') && !['superuser', 'admin'].includes(profile?.rol || '')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  if (pathname.startsWith('/dashboard/profesor') && !['superuser', 'admin', 'profesor'].includes(profile?.rol || '')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  if (pathname.startsWith('/dashboard/alumno') && profile?.rol !== 'alumno') {
    return NextResponse.redirect(new URL('/', req.url))
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
