
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value }) =>
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

  // Permitir siempre acceso a login, página de expiración, PREREGISTRO y endpoints de mantenimiento (cron)
  if (pathname === '/' || pathname === '/expired' || pathname === '/preregistro' || pathname.startsWith('/api/cron/')) {
    return supabaseResponse;
  }

  // Redirigir a login si no hay sesión iniciada en rutas protegidas
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, estatus, fecha_expiracion')
    .eq('id', user.id)
    .single();

  // SI EL ESTATUS NO ES ACTIVO -> Redirigir a página de aviso institucional
  if (!profile || profile.estatus !== 'activo') {
    const url = request.nextUrl.clone();
    url.pathname = '/expired';
    return NextResponse.redirect(url);
  }

  // VERIFICACIÓN DE VIGENCIA POR FECHA
  if (profile.rol !== 'superuser' && profile.fecha_expiracion) {
    const hoy = new Date().toISOString().split('T')[0];
    if (profile.fecha_expiracion < hoy) {
      const url = request.nextUrl.clone();
      url.pathname = '/expired';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
