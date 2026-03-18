
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

  // Permitir acceso a la raíz y a la página de expiración siempre
  if (pathname === '/' || pathname === '/expired') {
    return res
  }

  // Si no hay sesión y la ruta es protegida, al login
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Obtener perfil para validaciones
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', session.user.id)
    .single()

  // Si no hay perfil o está inactivo
  if (!profile || profile.estatus !== 'activo') {
    await supabase.auth.signOut()
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('error', 'acceso_denegado')
    return NextResponse.redirect(url)
  }

  // Verificación de expiración (Superusuario es inmune)
  if (profile.rol !== 'superuser' && profile.fecha_expiracion) {
    const hoy = new Date().toISOString().split('T')[0]
    if (profile.fecha_expiracion < hoy && pathname !== '/expired') {
      const url = req.nextUrl.clone()
      url.pathname = '/expired'
      return NextResponse.redirect(url)
    }
  }

  return res
}

export const config = {
  matcher: [
    '/dashboard/:path*',
  ],
}
