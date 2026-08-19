
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;

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
  const hostname = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  const platformHosts = (process.env.PLATFORM_HOSTNAMES || process.env.PLATFORM_HOSTNAME || 'plataforma-estudiantil.vercel.app')
    .split(',').map((host) => host.trim().toLowerCase());
  const isPlatformHost = platformHosts.includes(hostname) || hostname === 'localhost' || hostname === '127.0.0.1';

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

  const { data: platformAdmin } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (pathname.startsWith('/platform')) {
    if (!platformAdmin || !isPlatformHost) {
      const url = request.nextUrl.clone();
      url.pathname = platformAdmin ? '/dashboard/admin' : '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Una identidad global no hereda acceso a los datos de ninguna escuela.
  if (platformAdmin && isPlatformHost) {
    const url = request.nextUrl.clone();
    url.pathname = '/platform';
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, rol, estatus, fecha_expiracion')
    .eq('id', user.id)
    .single();

  // SI EL ESTATUS NO ES ACTIVO -> Redirigir a página de aviso institucional
  if (!profile || profile.estatus !== 'activo') {
    const url = request.nextUrl.clone();
    url.pathname = '/expired';
    return NextResponse.redirect(url);
  }

  const { data: tenant } = await supabase.from('tenants')
    .select('estado').eq('id', profile.tenant_id).single();
  if (!tenant || tenant.estado !== 'activo') {
    const url = request.nextUrl.clone();
    url.pathname = '/expired';
    url.searchParams.set('reason', 'tenant');
    return NextResponse.redirect(url);
  }

  const { data: domains } = await supabase.from('tenant_domains')
    .select('hostname').eq('tenant_id', profile.tenant_id).eq('estado', 'verificado');
  const domainMatches = (domains || []).some((domain) => domain.hostname === hostname);
  if (!domainMatches && !isPlatformHost) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('error', 'wrong_domain');
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


  const { data: service } = await supabase.from('pago_de_servicios')
    .select('estado, fecha_inicio, duracion_dias, bloquear_acceso_usuarios')
    .eq('tenant_id', profile.tenant_id).maybeSingle();
  const serviceEndsAt = service?.fecha_inicio
    ? new Date(`${service.fecha_inicio}T00:00:00`)
    : null;
  if (serviceEndsAt) serviceEndsAt.setDate(serviceEndsAt.getDate() + Number(service?.duracion_dias || 30));
  const serviceUnavailable = !service || service.estado !== 'SI' || (serviceEndsAt ? new Date() >= serviceEndsAt : false);
  if (serviceUnavailable && service?.bloquear_acceso_usuarios && ['profesor', 'alumno'].includes(profile.rol)) {
    const url = request.nextUrl.clone();
    url.pathname = '/expired';
    url.searchParams.set('reason', 'service');
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
