
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Obtener la sesión correctamente desestructurando la propiedad 'data'
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = req.nextUrl.pathname

  // Rutas públicas (la raíz '/' es el login)
  const publicPaths = ['/', '/expired']
  if (publicPaths.some(path => pathname === path)) {
    return res
  }

  // Si no hay sesión y no es ruta pública → redirigir a login (/)
  if (!session) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Obtener perfil para verificar rol y estatus
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', session.user.id)
    .single()

  // Validar estatus
  if (profile?.estatus !== 'activo') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/?inactive=true', req.url))
  }

  // Validar expiración
  const hoy = new Date().toISOString().split('T')[0]
  if (profile?.fecha_expiracion && profile.fecha_expiracion < hoy) {
    // Redirigir a página de expiración si no está ya en ella
    if (pathname !== '/expired') {
      return NextResponse.redirect(new URL('/expired', req.url))
    }
  }

  // Protección por rol para las rutas de dashboard
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
