import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !publishableKey) throw new Error('Faltan variables de Supabase');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = crypto.randomUUID().slice(0, 8);
const password = `Test-${crypto.randomUUID()}!Aa1`;
const ids = { tenantB: null, userA: null, userB: null, levelA: null, levelB: null };
const storagePaths = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signedClient(email) {
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function cleanup() {
  if (storagePaths.length) await service.storage.from('logos-institucion').remove(storagePaths);
  if (ids.levelA) await service.from('niveles').delete().eq('id', ids.levelA);
  if (ids.levelB) await service.from('niveles').delete().eq('id', ids.levelB);
  if (ids.userA) await service.auth.admin.deleteUser(ids.userA);
  if (ids.userB) await service.auth.admin.deleteUser(ids.userB);
  if (ids.tenantB) {
    for (const table of ['tenant_smtp_settings', 'tenant_provisioning', 'tenant_domains', 'pago_de_servicios', 'configuracion_sistema']) {
      await service.from(table).delete().eq('tenant_id', ids.tenantB);
    }
    await service.from('platform_audit').delete().eq('tenant_id', ids.tenantB);
    await service.from('tenants').delete().eq('id', ids.tenantB);
  }
}

try {
  const { data: tenantA, error: tenantAError } = await service.from('tenants').select('id').eq('slug', 'xochitlan').single();
  if (tenantAError) throw tenantAError;
  const before = await Promise.all([
    service.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA.id),
    service.from('niveles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA.id),
  ]);

  const { data: tenantB, error: tenantBError } = await service.from('tenants').insert({
    slug: `isolation-test-${suffix}`,
    nombre: `Escuela B aislamiento ${suffix}`,
    estado: 'activo',
  }).select('id').single();
  if (tenantBError) throw tenantBError;
  ids.tenantB = tenantB.id;

  const domainB = `escuela-b-${suffix}.localhost`;
  const setupResults = await Promise.all([
    service.from('tenant_domains').insert({ tenant_id: tenantB.id, hostname: domainB, es_principal: true, estado: 'verificado', verificado_at: new Date().toISOString() }),
    service.from('configuracion_sistema').insert({ tenant_id: tenantB.id, nombre_completo: 'Escuela B Test', nombre_corto: 'Escuela B', siglas: 'EBT', telefono_contacto: '', correo_contacto: '', url_plataforma: `https://${domainB}` }),
    service.from('pago_de_servicios').insert({ tenant_id: tenantB.id, estado: 'SI', fecha_inicio: new Date().toISOString().slice(0, 10), duracion_dias: 30, ia_habilitada: true }),
  ]);
  for (const result of setupResults) if (result.error) throw result.error;

  const emailA = `codex-a-${suffix}@example.com`;
  const emailB = `codex-b-${suffix}@example.com`;
  for (const [side, tenantId, email] of [['A', tenantA.id, emailA], ['B', tenantB.id, emailB]]) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { tenant_id: tenantId, role: 'admin' },
      user_metadata: { nombre: 'PRUEBA', apellidos: side, curp: `TEST-${side}-${suffix}` },
    });
    if (error) throw error;
    ids[`user${side}`] = data.user.id;
    const { error: profileError } = await service.from('profiles').upsert({
      id: data.user.id,
      tenant_id: tenantId,
      email,
      nombre: 'PRUEBA',
      apellidos: side,
      curp: `TEST-${side}-${suffix}`,
      rol: 'admin',
      estatus: 'activo',
    }, { onConflict: 'id' });
    if (profileError) throw profileError;
  }

  const [{ data: levelA, error: levelAError }, { data: levelB, error: levelBError }] = await Promise.all([
    service.from('niveles').insert({ tenant_id: tenantA.id, nombre: `AISLAMIENTO A ${suffix}`, activo: true }).select('id').single(),
    service.from('niveles').insert({ tenant_id: tenantB.id, nombre: `AISLAMIENTO B ${suffix}`, activo: true }).select('id').single(),
  ]);
  if (levelAError || levelBError) throw levelAError || levelBError;
  ids.levelA = levelA.id;
  ids.levelB = levelB.id;

  const [clientA, clientB] = await Promise.all([signedClient(emailA), signedClient(emailB)]);
  const [{ data: authB }, { data: serviceProfileB }] = await Promise.all([
    clientB.auth.getUser(),
    service.from('profiles').select('id, tenant_id, rol, estatus').eq('id', ids.userB).maybeSingle(),
  ]);
  const [levelsA, levelsB, profilesA, profilesB] = await Promise.all([
    clientA.from('niveles').select('id, tenant_id'),
    clientB.from('niveles').select('id, tenant_id'),
    clientA.from('profiles').select('id, tenant_id'),
    clientB.from('profiles').select('id, tenant_id'),
  ]);
  for (const result of [levelsA, levelsB, profilesA, profilesB]) if (result.error) throw result.error;
  assert(levelsA.data.every((row) => row.tenant_id === tenantA.id), 'A leyó niveles de otro tenant');
  assert(levelsB.data.length === 1 && levelsB.data[0].id === levelB.id, `B no quedó aislado: levels=${JSON.stringify(levelsB.data)} app=${JSON.stringify(authB.user?.app_metadata)} profile=${JSON.stringify(serviceProfileB)}`);
  assert(profilesA.data.every((row) => row.tenant_id === tenantA.id), 'A leyó perfiles de B');
  assert(profilesB.data.length === 1 && profilesB.data[0].id === ids.userB, 'B leyó perfiles ajenos');

  const crossRead = await clientB.from('niveles').select('id').eq('id', levelA.id);
  assert(!crossRead.error && crossRead.data.length === 0, 'B obtuvo un ID académico de A');
  const crossWrite = await clientB.from('niveles').insert({ tenant_id: tenantA.id, nombre: 'NO DEBE EXISTIR', activo: true });
  assert(!!crossWrite.error, 'B logró insertar en A');

  const ownPath = `${tenantB.id}/branding/isolation-${suffix}.txt`;
  const foreignPath = `${tenantA.id}/branding/isolation-${suffix}.txt`;
  const ownUpload = await clientB.storage.from('logos-institucion').upload(ownPath, new Blob(['tenant-b']), { contentType: 'text/plain' });
  if (ownUpload.error) throw ownUpload.error;
  storagePaths.push(ownPath);
  const foreignUpload = await clientB.storage.from('logos-institucion').upload(foreignPath, new Blob(['forbidden']), { contentType: 'text/plain' });
  assert(!!foreignUpload.error, 'B logró escribir Storage dentro de A');

  const { data: domainResolution } = await service.from('tenant_domains').select('tenant_id').eq('hostname', domainB).single();
  assert(domainResolution?.tenant_id === tenantB.id, 'El dominio B no resuelve al tenant B');

  await cleanup();
  const after = await Promise.all([
    service.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA.id),
    service.from('niveles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA.id),
  ]);
  assert(before[0].count === after[0].count && before[1].count === after[1].count, 'La limpieza alteró conteos de Xochitlán');
  console.log(JSON.stringify({ success: true, checks: 10, tenantA: tenantA.id, testedTenantB: tenantB.id, xochitlanCountsPreserved: true }));
} catch (error) {
  await cleanup();
  console.error(JSON.stringify({ success: false, error: error.message }));
  process.exitCode = 1;
}
