import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pdfPath = process.argv[2] || '/home/seraphael/Descargas/LISTAS ASISTENCIA XOCHITLAN 2026-2027 actualizada.pdf';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan las credenciales Supabase del servidor en .env.local.');

const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const pageDefinitions = [
  ['Primaria', 'Primero', 'A'], ['Primaria', 'Segundo', 'A'],
  ['Primaria', 'Tercero', 'A'], ['Primaria', 'Tercero', 'B'],
  ['Primaria', 'Cuarto', 'A'], ['Primaria', 'Cuarto', 'B'],
  ['Primaria', 'Quinto', 'A'], ['Primaria', 'Quinto', 'B'],
  ['Primaria', 'Sexto', 'A'],
  ['Secundaria', 'Primero', 'A'], ['Secundaria', 'Segundo', 'A'], ['Secundaria', 'Tercero', 'A'],
];

const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const pages = text.split('\f').filter((page) => page.trim());
if (pages.length !== pageDefinitions.length) throw new Error(`Se esperaban 12 hojas y se encontraron ${pages.length}.`);
const rosters = pages.map((page, index) => {
  const beforeTotals = page.split(/^\s*Hombres\s*$/m)[0];
  const names = beforeTotals.split(/\r?\n/).map((line) => line.match(/^\s*\d+\s+(.+?)\s*$/)?.[1]?.trim()).filter(Boolean);
  if (!names.length) throw new Error(`No se detectaron alumnos en la hoja ${index + 1}.`);
  return { definition: pageDefinitions[index], names };
});

if (process.env.OUTPUT_SQL === '1') {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  process.stdout.write('begin;\n');
  process.stdout.write("insert into public.tenant_features(tenant_id,primary_filter_enabled,timezone) select id,true,'America/Mexico_City' from public.tenants where slug='xochitlan' on conflict(tenant_id) do update set primary_filter_enabled=true,timezone=excluded.timezone,updated_at=now();\n");
  for (const { definition: [levelName, gradeName, groupName], names } of rosters) {
    process.stdout.write(`insert into public.filter_levels(tenant_id,name,created_by) select t.id,${quote(levelName)},t.initial_superuser_id from public.tenants t where t.slug='xochitlan' on conflict(tenant_id,name) do nothing;\n`);
    process.stdout.write(`insert into public.filter_groups(tenant_id,level_id,grade_name,group_name,created_by) select t.id,l.id,${quote(gradeName)},${quote(groupName)},t.initial_superuser_id from public.tenants t join public.filter_levels l on l.tenant_id=t.id and l.name=${quote(levelName)} where t.slug='xochitlan' on conflict(tenant_id,level_id,grade_name,group_name) do nothing;\n`);
    const values = names.map((name) => `(${quote(name)},${quote(normalize(name))})`).join(',');
    process.stdout.write(`insert into public.filter_students(tenant_id,group_id,full_name,normalized_name,active,created_by,updated_by) select t.id,g.id,v.full_name,v.normalized_name,true,t.initial_superuser_id,t.initial_superuser_id from public.tenants t join public.filter_levels l on l.tenant_id=t.id and l.name=${quote(levelName)} join public.filter_groups g on g.tenant_id=t.id and g.level_id=l.id and g.grade_name=${quote(gradeName)} and g.group_name=${quote(groupName)} cross join (values ${values}) as v(full_name,normalized_name) where t.slug='xochitlan' on conflict(tenant_id,group_id,normalized_name) do update set full_name=excluded.full_name,active=true,updated_at=now();\n`);
  }
  process.stdout.write(`insert into public.filter_audit_log(tenant_id,actor_user_id,actor_name,action,entity_type,details) select t.id,t.initial_superuser_id,'Importación inicial autorizada','students.pdf_imported','student',jsonb_build_object('source','LISTAS ASISTENCIA XOCHITLAN 2026-2027 actualizada.pdf','sheets',${pages.length},'count',${rosters.reduce((sum, item) => sum + item.names.length, 0)}) from public.tenants t where t.slug='xochitlan' and t.initial_superuser_id is not null;\ncommit;\n`);
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: tenant, error: tenantError } = await supabase.from('tenants').select('id,initial_superuser_id').eq('slug', 'xochitlan').single();
if (tenantError || !tenant) throw tenantError || new Error('No se encontró el tenant xochitlan.');
let actorId = tenant.initial_superuser_id;
if (!actorId) {
  const { data: actor } = await supabase.from('profiles').select('id').eq('tenant_id', tenant.id).eq('rol', 'superuser').limit(1).single();
  actorId = actor?.id;
}

const { error: featureError } = await supabase.from('tenant_features').upsert({ tenant_id: tenant.id, primary_filter_enabled: true, timezone: 'America/Mexico_City', updated_by: actorId || null });
if (featureError) throw featureError;

let imported = 0;
for (const { definition: [levelName, gradeName, groupName], names } of rosters) {
  const { data: level, error: levelError } = await supabase.from('filter_levels').upsert({ tenant_id: tenant.id, name: levelName, created_by: actorId || null }, { onConflict: 'tenant_id,name' }).select('id').single();
  if (levelError) throw levelError;
  const { data: group, error: groupError } = await supabase.from('filter_groups').upsert({ tenant_id: tenant.id, level_id: level.id, grade_name: gradeName, group_name: groupName, created_by: actorId || null }, { onConflict: 'tenant_id,level_id,grade_name,group_name' }).select('id').single();
  if (groupError) throw groupError;
  const rows = names.map((fullName) => ({ tenant_id: tenant.id, group_id: group.id, full_name: fullName, normalized_name: normalize(fullName), active: true, created_by: actorId || null, updated_by: actorId || null }));
  const { error: studentsError } = await supabase.from('filter_students').upsert(rows, { onConflict: 'tenant_id,group_id,normalized_name' });
  if (studentsError) throw studentsError;
  imported += rows.length;
  process.stdout.write(`${levelName} ${gradeName} ${groupName}: ${rows.length}\n`);
}

if (actorId) await supabase.from('filter_audit_log').insert({ tenant_id: tenant.id, actor_user_id: actorId, actor_name: 'Importación inicial autorizada', action: 'students.pdf_imported', entity_type: 'student', details: { source: 'LISTAS ASISTENCIA XOCHITLAN 2026-2027 actualizada.pdf', sheets: pages.length, count: imported } });
process.stdout.write(`Importación terminada: ${imported} alumnos en ${pages.length} hojas.\n`);
