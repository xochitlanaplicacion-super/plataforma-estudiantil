import 'server-only';

import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type TenantRole = 'superuser' | 'admin' | 'profesor' | 'alumno';

export interface TenantRecord {
  id: string;
  slug: string;
  nombre: string;
  estado: 'provisionando' | 'activo' | 'suspendido' | 'cancelado';
  initial_superuser_id?: string | null;
}

export interface TenantServiceState {
  estado: 'SI' | 'NO';
  fecha_inicio: string | null;
  duracion_dias: number;
  ia_habilitada: boolean;
  bloquear_acceso_usuarios: boolean;
  mensaje_bloqueo: string | null;
}

export function normalizeHostname(value?: string | null): string {
  const first = (value || '').split(',')[0].trim().toLowerCase();
  return first
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export async function getRequestHostname(): Promise<string> {
  const requestHeaders = await headers();
  return normalizeHostname(
    requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
  );
}

export function isPlatformHostname(hostnameInput: string) {
  const hostname = normalizeHostname(hostnameInput);
  const configured = (process.env.PLATFORM_HOSTNAMES || process.env.PLATFORM_HOSTNAME || 'plataforma-estudiantil.vercel.app')
    .split(',').map(normalizeHostname).filter(Boolean);
  return isDevelopmentHostname(hostname) || configured.includes(hostname);
}

function isDevelopmentHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
}

export async function resolveTenantFromHostname(hostnameInput?: string | null): Promise<TenantRecord | null> {
  const hostname = normalizeHostname(hostnameInput || await getRequestHostname());
  const admin = createSupabaseAdminClient();

  if (hostname) {
    const { data: domain } = await admin
      .from('tenant_domains')
      .select('tenant_id, tenants(id, slug, nombre, estado, initial_superuser_id)')
      .eq('hostname', hostname)
      .eq('estado', 'verificado')
      .maybeSingle();

    const tenant = (domain as any)?.tenants;
    if (tenant) return tenant as TenantRecord;
  }

  if (isDevelopmentHostname(hostname) || hostname.endsWith('.vercel.app')) {
    const fallbackSlug = process.env.DEFAULT_TENANT_SLUG || 'xochitlan';
    const { data } = await admin
      .from('tenants')
      .select('id, slug, nombre, estado, initial_superuser_id')
      .eq('slug', fallbackSlug)
      .maybeSingle();
    return (data as TenantRecord | null) || null;
  }

  return null;
}

export async function getTenantServiceState(tenantId: string): Promise<TenantServiceState | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('pago_de_servicios')
    .select('estado, fecha_inicio, duracion_dias, ia_habilitada, bloquear_acceso_usuarios, mensaje_bloqueo')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as TenantServiceState | null) || null;
}

export async function requireTenantSession(allowedRoles?: TenantRole[]) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('No autenticado');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, tenant_id, rol, estatus, nombre, apellidos, email')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.tenant_id) throw new Error('Perfil sin institución asignada');
  if (profile.estatus !== 'activo') throw new Error('Usuario inactivo');
  if (allowedRoles && !allowedRoles.includes(profile.rol as TenantRole)) {
    throw new Error('No autorizado');
  }

  const admin = createSupabaseAdminClient();
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id, slug, nombre, estado, initial_superuser_id')
    .eq('id', profile.tenant_id)
    .single();

  if (tenantError || !tenant) throw new Error('Institución no encontrada');
  if (tenant.estado !== 'activo') throw new Error('Institución suspendida');

  return {
    user,
    profile: profile as typeof profile & { tenant_id: string; rol: TenantRole },
    tenant: tenant as TenantRecord,
    tenantId: profile.tenant_id as string,
    supabase,
    admin,
  };
}

export async function requirePlatformAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('No autenticado');

  const admin = createSupabaseAdminClient();
  const { data: platformAdmin } = await admin
    .from('platform_admins')
    .select('user_id, activo')
    .eq('user_id', user.id)
    .eq('activo', true)
    .maybeSingle();

  if (!platformAdmin) throw new Error('Acceso exclusivo para Superduperuser');

  return { user, supabase, admin };
}

export function isServiceExpired(service: TenantServiceState | null, now = new Date()) {
  if (!service) return true;
  if (service.estado !== 'SI') return true;
  if (!service.fecha_inicio) return false;

  const end = new Date(`${service.fecha_inicio}T00:00:00`);
  end.setDate(end.getDate() + service.duracion_dias);
  return now >= end;
}
