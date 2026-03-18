import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
     { session },
  } = await supabase.auth.getSession()

  // Rutas públicas
  const publicPaths = ['/login', '/recuperar-password']
  if (publicPaths.some(path => req.nextUrl.pathname.startsWith(path))) {
    if (session) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return res
  }

  // Si no hay sesión y la ruta es protegida → redirigir a login
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Obtener perfil para verificar rol
  const {  profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', session.user.id)
    .single()

  // Validar estatus
  if (profile?.estatus !== 'activo') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?inactive=true', req.url))
  }

  // Validar expiración
  const hoy = new Date().toISOString().split('T')[0]
  if (profile?.fecha_expiracion && profile.fecha_expiracion < hoy) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?expired=true', req.url))
  }

  // Protección por rol
  const pathname = req.nextUrl.pathname

  if (pathname.startsWith('/superadmin') && profile?.rol !== 'superuser') {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  if (pathname.startsWith('/admin') && !['superuser', 'admin'].includes(profile?.rol || '')) {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  if (pathname.startsWith('/profesor') && !['superuser', 'admin', 'profesor'].includes(profile?.rol || '')) {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  if (pathname.startsWith('/alumno') && profile?.rol !== 'alumno') {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/superadmin/:path*',
    '/admin/:path*',
    '/profesor/:path*',
    '/alumno/:path*',
    '/login',
    '/recuperar-password',
  ],
}