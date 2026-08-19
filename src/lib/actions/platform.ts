'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin, normalizeHostname } from '@/lib/tenant/context';
import { sendWelcomeEmail } from '@/lib/email';

const slugify = (value: string) => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

async function audit(admin: any, actorUserId: string, tenantId: string | null, accion: string, detalles: Record<string, any> = {}) {
  await admin.from('platform_audit').insert({
    actor_user_id: actorUserId,
    tenant_id: tenantId,
    accion,
    detalles,
  });
}

export async function getPlatformDashboard() {
  const { admin } = await requirePlatformAdmin();
  const [{ data: tenants, error }, { data: auditRows }] = await Promise.all([
    admin.from('tenants').select(`
      id, slug, nombre, estado, initial_superuser_id, created_at, updated_at,
      tenant_domains(id, hostname, es_principal, estado),
      pago_de_servicios(estado, fecha_inicio, duracion_dias, ia_habilitada, bloquear_acceso_usuarios, mensaje_bloqueo),
      tenant_provisioning(estado, error_message, updated_at)
    `).order('created_at', { ascending: true }),
    admin.from('platform_audit').select('id, tenant_id, accion, detalles, created_at, actor_user_id')
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (error) throw error;

  const enriched = await Promise.all((tenants || []).map(async (tenant: any) => {
    const [{ count: users }, { count: professors }, { count: students }, { data: usage }] = await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('rol', 'profesor'),
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('rol', 'alumno'),
      admin.from('ai_token_usage').select('total_tokens').eq('tenant_id', tenant.id),
    ]);
    return {
      ...tenant,
      counts: { users: users || 0, professors: professors || 0, students: students || 0 },
      aiTokens: (usage || []).reduce((sum: number, row: any) => sum + Number(row.total_tokens || 0), 0),
    };
  }));
  return { tenants: enriched, audit: auditRows || [] };
}

export async function createTenantSchool(input: {
  nombre: string;
  slug?: string;
  hostname: string;
  superuserEmail: string;
  superuserPassword: string;
  superuserNombre: string;
  superuserApellidos: string;
  superuserCurp?: string;
  fechaInicio?: string;
  duracionDias?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFromName?: string;
}) {
  const context = await requirePlatformAdmin();
  let tenantId: string | null = null;
  let authUserId: string | null = null;
  try {
    const nombre = input.nombre.trim();
    const slug = slugify(input.slug || nombre);
    const hostname = normalizeHostname(input.hostname);
    const email = input.superuserEmail.toLowerCase().trim();
    if (!nombre || !slug || !hostname || !email || input.superuserPassword.length < 8) {
      throw new Error('Nombre, slug, dominio, correo y una contraseña de al menos 8 caracteres son obligatorios.');
    }

    const { data: tenant, error: tenantError } = await context.admin.from('tenants').insert({
      nombre,
      slug,
      estado: 'provisionando',
      created_by: context.user.id,
    }).select('id').single();
    if (tenantError) throw tenantError;
    tenantId = tenant.id;

    const { error: provisioningError } = await context.admin.from('tenant_provisioning').insert({
      tenant_id: tenantId,
      estado: 'tenant_created',
      created_by: context.user.id,
    });
    if (provisioningError) throw provisioningError;

    const { data: authData, error: authError } = await context.admin.auth.admin.createUser({
      email,
      password: input.superuserPassword,
      email_confirm: true,
      app_metadata: { tenant_id: tenantId, role: 'superuser' },
      user_metadata: {
        nombre: input.superuserNombre,
        apellidos: input.superuserApellidos,
        curp: (input.superuserCurp || `TENANT-${tenantId}`).toUpperCase(),
      },
    });
    if (authError) throw authError;
    authUserId = authData.user.id;
    await context.admin.from('tenant_provisioning').update({ estado: 'auth_created', initial_superuser_id: authUserId, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);

    const [{ error: profileError }, { error: configError }, { error: serviceError }, { error: domainError }] = await Promise.all([
      context.admin.from('profiles').upsert({
        id: authUserId,
        tenant_id: tenantId,
        nombre: input.superuserNombre.toUpperCase().trim(),
        apellidos: input.superuserApellidos.toUpperCase().trim(),
        email,
        curp: (input.superuserCurp || `TENANT-${tenantId}`).toUpperCase(),
        rol: 'superuser',
        estatus: 'activo',
      }, { onConflict: 'id' }),
      context.admin.from('configuracion_sistema').insert({
        tenant_id: tenantId,
        nombre_completo: nombre,
        nombre_corto: nombre,
        siglas: slug.slice(0, 8).toUpperCase(),
        slogan: 'Plataforma Académica',
        url_plataforma: `https://${hostname}`,
        sitio_web: `https://${hostname}`,
        telefono_contacto: '',
        correo_contacto: email,
        smtp_host: null,
        smtp_user: null,
        smtp_password: null,
      }),
      context.admin.from('pago_de_servicios').insert({
        tenant_id: tenantId,
        estado: 'SI',
        fecha_inicio: input.fechaInicio || new Date().toISOString().slice(0, 10),
        duracion_dias: Math.max(1, Number(input.duracionDias || 30)),
        ia_habilitada: true,
        bloquear_acceso_usuarios: false,
        updated_by: context.user.id,
      }),
      context.admin.from('tenant_domains').insert({
        tenant_id: tenantId,
        hostname,
        es_principal: true,
        estado: 'verificado',
        verificado_at: new Date().toISOString(),
      }),
    ]);
    const provisioningFailure = profileError || configError || serviceError || domainError;
    if (provisioningFailure) throw provisioningFailure;

    if (input.smtpUser || input.smtpPassword) {
      const { error: smtpError } = await context.admin.rpc('set_tenant_smtp_for_service', {
        p_tenant_id: tenantId,
        p_smtp_host: 'smtp.gmail.com',
        p_smtp_port: 465,
        p_smtp_user: input.smtpUser || '',
        p_smtp_password: input.smtpPassword || '',
        p_smtp_from_name: input.smtpFromName || nombre,
        p_updated_by: context.user.id,
      });
      if (smtpError) throw smtpError;
    }

    await Promise.all([
      context.admin.from('tenants').update({ estado: 'activo', initial_superuser_id: authUserId, updated_at: new Date().toISOString() }).eq('id', tenantId),
      context.admin.from('tenant_provisioning').update({ estado: 'ready', initial_superuser_id: authUserId, error_message: null, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId),
      audit(context.admin, context.user.id, tenantId, 'tenant.created', { nombre, slug, hostname, initial_superuser_id: authUserId }),
    ]);
    if (input.smtpUser && input.smtpPassword) {
      const emailResult = await sendWelcomeEmail({
        tenantId,
        to: email,
        nombre: input.superuserNombre,
        apellidos: input.superuserApellidos,
        rol: 'superuser',
        password: input.superuserPassword,
      });
      if (!emailResult.success) {
        await audit(context.admin, context.user.id, tenantId, 'tenant.welcome_email_failed', { error: emailResult.error });
      }
    }
    revalidatePath('/platform');
    return { success: true, tenantId };
  } catch (error: any) {
    if (tenantId) {
      await context.admin.from('tenant_provisioning').update({ estado: 'failed', error_message: error.message, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);
      await context.admin.from('tenants').update({ estado: 'suspendido', updated_at: new Date().toISOString() }).eq('id', tenantId);
      await audit(context.admin, context.user.id, tenantId, 'tenant.provisioning_failed', { error: error.message, auth_user_created: !!authUserId });
    }
    return { success: false, error: error.message };
  }
}

export async function updateTenantStatus(tenantId: string, estado: 'activo' | 'suspendido' | 'cancelado') {
  try {
    const context = await requirePlatformAdmin();
    const { error } = await context.admin.from('tenants').update({ estado, updated_at: new Date().toISOString() }).eq('id', tenantId);
    if (error) throw error;
    await audit(context.admin, context.user.id, tenantId, `tenant.${estado}`);
    revalidatePath('/platform');
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function updateTenantService(tenantId: string, input: {
  estado: 'SI' | 'NO';
  fechaInicio: string;
  duracionDias: number;
  iaHabilitada: boolean;
  bloquearAccesoUsuarios: boolean;
  mensajeBloqueo?: string;
}) {
  try {
    const context = await requirePlatformAdmin();
    if (!['SI', 'NO'].includes(input.estado)) throw new Error('Estado de servicio inválido');
    const update = {
      estado: input.estado,
      fecha_inicio: input.fechaInicio || null,
      duracion_dias: Math.min(3660, Math.max(1, Number(input.duracionDias || 30))),
      ia_habilitada: input.iaHabilitada,
      bloquear_acceso_usuarios: input.bloquearAccesoUsuarios,
      mensaje_bloqueo: input.mensajeBloqueo || null,
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.admin.from('pago_de_servicios').upsert({ tenant_id: tenantId, ...update }, { onConflict: 'tenant_id' });
    if (error) throw error;
    await audit(context.admin, context.user.id, tenantId, 'service.updated', update);
    revalidatePath('/platform');
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function addTenantDomain(tenantId: string, rawHostname: string, makePrimary = false) {
  try {
    const context = await requirePlatformAdmin();
    const hostname = normalizeHostname(rawHostname);
    if (!hostname) throw new Error('Dominio inválido');
    if (makePrimary) await context.admin.from('tenant_domains').update({ es_principal: false }).eq('tenant_id', tenantId);
    const { error } = await context.admin.from('tenant_domains').insert({
      tenant_id: tenantId,
      hostname,
      es_principal: makePrimary,
      estado: 'verificado',
      verificado_at: new Date().toISOString(),
    });
    if (error) throw error;
    await audit(context.admin, context.user.id, tenantId, 'domain.added', { hostname, makePrimary });
    revalidatePath('/platform');
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function setPrimaryTenantDomain(tenantId: string, domainId: string) {
  try {
    const context = await requirePlatformAdmin();
    const { data: hostname, error } = await context.admin.rpc('set_primary_tenant_domain_for_service', {
      p_tenant_id: tenantId,
      p_domain_id: domainId,
    });
    if (error) throw error;
    await audit(context.admin, context.user.id, tenantId, 'domain.primary_changed', { hostname });
    revalidatePath('/platform');
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function recordSupportAccess(tenantId: string) {
  try {
    const context = await requirePlatformAdmin();
    await audit(context.admin, context.user.id, tenantId, 'support.access_requested');
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}
