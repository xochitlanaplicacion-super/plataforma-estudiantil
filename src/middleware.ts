
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
  if (pathname === '/' || pathname === '/expired') {
    return res
  }

  // Si no hay sesión, al login
  if (!session) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Obtener perfil para validaciones de acceso
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.estatus !== 'activo') {
    // Si no hay perfil, forzamos logout y redirigimos
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/?error=perfil_invalido', req.url))
  }

  // Verificación de expiración (Superusuario es inmune)
  if (profile.rol !== 'superuser' && profile.fecha_expiracion) {
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
