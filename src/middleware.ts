
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

  // 1. Manejo de Rutas Públicas
  const publicPaths = ['/', '/expired']
  const isPublicPath = publicPaths.some(path => pathname === path)

  if (isPublicPath) {
    // Si ya hay sesión y está en el login, no redirigimos aquí para evitar bucles.
    // Dejamos que el useEffect del login lo maneje si es necesario.
    return res
  }

  // 2. Si no hay sesión, al login
  if (!session) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // 3. Validación de perfil para rutas protegidas
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', session.user.id)
    .single()

  // Si no hay perfil o está inactivo, cerrar sesión
  if (!profile || profile.estatus !== 'activo') {
    return NextResponse.redirect(new URL('/?error=perfil_no_valido', req.url))
  }

  // 4. Verificación de expiración (solo si existe fecha y no es superusuario)
  if (profile.fecha_expiracion && profile.rol !== 'superuser') {
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
