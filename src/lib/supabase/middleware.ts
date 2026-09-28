
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getHostnameCandidates, normalizeHostname } from '@/lib/tenant/hostname';
import { getPlatformServiceEndDate } from '@/lib/service-countdown';

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
  const hostname = normalizeHostname(request.headers.get('x-forwarded-host') || request.headers.get('host'));
  const platformHosts = (process.env.PLATFORM_HOSTNAMES || process.env.PLATFORM_HOSTNAME || 'plataforma-estudiantil.vercel.app')
    .split(',').map((host) => host.trim().toLowerCase());
  const isPlatformHost = platformHosts.includes(hostname) || hostname === 'localhost' || hostname === '127.0.0.1';

  // Arneses visuales locales de los Pasos 10/11/13. En producción las rutas
  // conservan la autenticación normal y sus páginas responden 404.
  if (
    process.env.NODE_ENV !== 'production'
    && (
      pathname.startsWith('/academic-step10-evidence')
      || pathname.startsWith('/academic-step11-evidence')
      || pathname.startsWith('/academic-step13-evidence')
    )
    && (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    return supabaseResponse;
  }

  // Permitir siempre acceso a login, página de expiración, PREREGISTRO y endpoints de mantenimiento (cron)
  if (pathname === '/' || pathname === '/expired' || pathname === '/preregistro' || pathname.startsWith('/registro-familia/') || pathname.startsWith('/api/cron/')) {
    return supabaseResponse;
  }

  // Redirigir a login si no hay sesión iniciada en rutas protegidas
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/platform')) {
    const { data: platformAdmin } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!platformAdmin || !isPlatformHost) {
      const url = request.nextUrl.clone();
      url.pathname = platformAdmin ? '/dashboard/admin' : '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Identity and profile are independent lookups. On a school domain the
  // platform-admin check is unnecessary; it only guards the platform host.
  const [{ data: platformAdmin }, { data: profile }] = await Promise.all([
    isPlatformHost
      ? supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('profiles')
      .select('tenant_id, rol, estatus, fecha_expiracion')
      .eq('id', user.id)
      .single(),
  ]);

  // Una identidad global no hereda acceso a los datos de ninguna escuela.
  if (platformAdmin && isPlatformHost) {
    const url = request.nextUrl.clone();
    url.pathname = '/platform';
    return NextResponse.redirect(url);
  }

  // SI EL ESTATUS NO ES ACTIVO -> Redirigir a página de aviso institucional
  if (!profile || profile.estatus !== 'activo') {
    const url = request.nextUrl.clone();
    url.pathname = '/expired';
    return NextResponse.redirect(url);
  }

  const checkService = profile.rol === 'profesor' || profile.rol === 'alumno';
  const checkFilterFeature = profile.rol === 'encargado_filtro' || pathname.startsWith('/dashboard/filtro');
  // All four checks depend on the profile, but not on one another. Running
  // them together removes several network round trips from every navigation.
  const [tenantResult, domainsResult, serviceResult, featureResult] = await Promise.all([
    supabase.from('tenants').select('estado').eq('id', profile.tenant_id).single(),
    isPlatformHost
      ? Promise.resolve({ data: [] as { hostname: string }[] })
      : supabase.from('tenant_domains').select('hostname')
        .eq('tenant_id', profile.tenant_id).eq('estado', 'verificado'),
    checkService
      ? supabase.from('pago_de_servicios')
        .select('estado, fecha_inicio, duracion_dias, bloquear_acceso_usuarios')
        .eq('tenant_id', profile.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    checkService || checkFilterFeature
      ? supabase.from('tenant_features').select('primary_filter_enabled, timezone')
        .eq('tenant_id', profile.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const tenant = tenantResult.data;
  if (!tenant || tenant.estado !== 'activo') {
    const url = request.nextUrl.clone();
    url.pathname = '/expired';
    url.searchParams.set('reason', 'tenant');
    return NextResponse.redirect(url);
  }

  const domains = domainsResult.data;
  const allowedHostnames = new Set((domains || []).map((domain) => normalizeHostname(domain.hostname)));
  const domainMatches = getHostnameCandidates(hostname).some((candidate) => allowedHostnames.has(candidate));
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


  const service = serviceResult.data;
  const feature = featureResult.data;
  const serviceEndsAt = service
    ? getPlatformServiceEndDate({ ...service, timezone: feature?.timezone || 'America/Mexico_City' })
    : null;
  const serviceUnavailable = !service || service.estado !== 'SI' || (serviceEndsAt ? new Date() >= serviceEndsAt : false);
  if (serviceUnavailable && service?.bloquear_acceso_usuarios && ['profesor', 'alumno'].includes(profile.rol)) {
    const url = request.nextUrl.clone();
    url.pathname = '/expired';
    url.searchParams.set('reason', 'service');
    return NextResponse.redirect(url);
  }

  if (profile.rol === 'encargado_filtro') {
    if (!feature?.primary_filter_enabled) {
      const url = request.nextUrl.clone(); url.pathname = '/expired'; url.searchParams.set('reason', 'feature');
      return NextResponse.redirect(url);
    }
    if (!pathname.startsWith('/dashboard/filtro')) {
      const url = request.nextUrl.clone(); url.pathname = '/dashboard/filtro/retardos';
      return NextResponse.redirect(url);
    }
  } else if (pathname.startsWith('/dashboard/filtro')) {
    if (!['superuser', 'admin'].includes(profile.rol)) {
      const url = request.nextUrl.clone();
      url.pathname = profile.rol === 'profesor' ? '/dashboard/profesor' : '/dashboard/alumno';
      return NextResponse.redirect(url);
    }
    if (!feature?.primary_filter_enabled) {
      const url = request.nextUrl.clone(); url.pathname = '/dashboard/admin';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
