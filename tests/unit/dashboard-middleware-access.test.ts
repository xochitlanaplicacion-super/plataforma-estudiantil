import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient }));

import { updateSession } from '@/lib/supabase/middleware';

type Fixture = {
  user?: { id: string } | null;
  profile?: Record<string, unknown> | null;
  tenant?: Record<string, unknown> | null;
  domains?: { hostname: string }[];
  service?: Record<string, unknown> | null;
  feature?: Record<string, unknown> | null;
  platformAdmin?: Record<string, unknown> | null;
};

function installClient(fixture: Fixture = {}) {
  const calls: string[] = [];
  const rows: Record<string, unknown> = {
    platform_admins: fixture.platformAdmin ?? null,
    profiles: fixture.profile ?? {
      tenant_id: 'school-1', rol: 'profesor', estatus: 'activo', fecha_expiracion: null,
    },
    tenants: fixture.tenant ?? { estado: 'activo' },
    tenant_domains: fixture.domains ?? [{ hostname: 'school.example' }],
    pago_de_servicios: fixture.service ?? {
      estado: 'SI', fecha_inicio: null, duracion_dias: 30, bloquear_acceso_usuarios: false,
    },
    tenant_features: fixture.feature ?? { primary_filter_enabled: true, timezone: 'America/Mexico_City' },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: fixture.user === undefined ? { id: 'teacher-1' } : fixture.user } }) },
    from(table: string) {
      calls.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: rows[table] ?? null }),
        maybeSingle: async () => ({ data: rows[table] ?? null }),
        then: (resolve: (value: { data: unknown }) => unknown) => Promise.resolve({ data: rows[table] ?? null }).then(resolve),
      };
      return query;
    },
  };
  createServerClient.mockReturnValue(client);
  return calls;
}

function request(path: string, host = 'school.example') {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

describe('dashboard middleware access during faster navigation', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
    vi.stubEnv('PLATFORM_HOSTNAMES', 'platform.example');
  });

  it('checks tenant, domain and service for a teacher without a redundant platform-admin request', async () => {
    const calls = installClient();
    const response = await updateSession(request('/dashboard/profesor/entregas'));
    expect(response.status).toBe(200);
    expect(calls).not.toContain('platform_admins');
    expect(calls).toEqual(expect.arrayContaining([
      'profiles', 'tenants', 'tenant_domains', 'pago_de_servicios', 'tenant_features',
    ]));
  });

  it('still rejects an unregistered school domain', async () => {
    installClient({ domains: [{ hostname: 'another-school.example' }] });
    const response = await updateSession(request('/dashboard/alumno/materias'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('error=wrong_domain');
  });

  it('still blocks teacher access when the service is expired and access must be blocked', async () => {
    installClient({ service: {
      estado: 'NO', fecha_inicio: null, duracion_dias: 30, bloquear_acceso_usuarios: true,
    } });
    const response = await updateSession(request('/dashboard/profesor'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('reason=service');
  });

  it('checks the dedicated platform route without loading a school profile', async () => {
    const calls = installClient({ platformAdmin: { user_id: 'teacher-1' } });
    const response = await updateSession(request('/platform', 'platform.example'));
    expect(response.status).toBe(200);
    expect(calls).toContain('platform_admins');
    expect(calls).not.toContain('profiles');
  });

  it('keeps platform administrators out of tenant dashboards', async () => {
    installClient({ platformAdmin: { user_id: 'teacher-1' } });
    const response = await updateSession(request('/dashboard/profesor', 'platform.example'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://platform.example/platform');
  });

  it('keeps a disabled filter module inaccessible', async () => {
    installClient({
      profile: { tenant_id: 'school-1', rol: 'encargado_filtro', estatus: 'activo', fecha_expiracion: null },
      feature: { primary_filter_enabled: false, timezone: 'America/Mexico_City' },
    });
    const response = await updateSession(request('/dashboard/filtro/retardos'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('reason=feature');
  });
});
