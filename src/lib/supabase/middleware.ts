
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Permitir acceso a la raíz y a la página de expiración siempre
  if (pathname === '/' || pathname === '/expired') {
    return supabaseResponse;
  }

  // Si no hay sesión y la ruta es protegida, al login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Obtener perfil para validaciones
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', user.id)
    .single();

  // Si no hay perfil o está inactivo
  if (!profile || profile.estatus !== 'activo') {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('error', 'acceso_denegado');
    return NextResponse.redirect(url);
  }

  // Verificación de expiración (Superusuario es inmune)
  if (profile.rol !== 'superuser' && profile.fecha_expiracion) {
    const hoy = new Date().toISOString().split('T')[0];
    if (profile.fecha_expiracion < hoy && pathname !== '/expired') {
      const url = request.nextUrl.clone();
      url.pathname = '/expired';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
