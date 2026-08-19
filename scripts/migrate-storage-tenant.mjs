import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o la clave secreta de Supabase.');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: tenant, error: tenantError } = await supabase
  .from('tenants')
  .select('id')
  .eq('slug', 'xochitlan')
  .single();

if (tenantError || !tenant) throw tenantError || new Error('Tenant Xochitlán no encontrado.');

const bucket = 'logos-institucion';
const prefix = `${tenant.id}/branding`;

const { data: rootFiles, error: listError } = await supabase.storage
  .from(bucket)
  .list('', { limit: 1000 });

if (listError) throw listError;

const { data: copiedFiles, error: copiedListError } = await supabase.storage
  .from(bucket)
  .list(prefix, { limit: 1000 });

if (copiedListError) throw copiedListError;

const copiedNames = new Set((copiedFiles || []).map((file) => file.name));
const replacements = [];

for (const file of rootFiles || []) {
  if (!file.id) continue;

  const destination = `${prefix}/${file.name}`;
  if (!copiedNames.has(file.name)) {
    const { error: copyError } = await supabase.storage.from(bucket).copy(file.name, destination);
    if (copyError) throw copyError;
  }

  const oldUrl = supabase.storage.from(bucket).getPublicUrl(file.name).data.publicUrl;
  const newUrl = supabase.storage.from(bucket).getPublicUrl(destination).data.publicUrl;
  replacements.push([oldUrl, newUrl]);
}

const { data: config, error: configError } = await supabase
  .from('configuracion_sistema')
  .select('*')
  .eq('tenant_id', tenant.id)
  .single();

if (configError) throw configError;

const replaceText = (value) => {
  if (typeof value !== 'string') return value;
  return replacements.reduce((result, [from, to]) => result.split(from).join(to), value);
};

const replaceJson = (value) => {
  if (value == null) return value;
  return JSON.parse(replaceText(JSON.stringify(value)));
};

const { error: updateError } = await supabase
  .from('configuracion_sistema')
  .update({
    logo_url: replaceText(config.logo_url),
    logo_dark_url: replaceText(config.logo_dark_url),
    favicon_url: replaceText(config.favicon_url),
    temas_login: replaceJson(config.temas_login),
    landing_config: replaceJson(config.landing_config),
    updated_at: new Date().toISOString(),
  })
  .eq('tenant_id', tenant.id);

if (updateError) throw updateError;

const { data: verification, error: verificationError } = await supabase.storage
  .from(bucket)
  .list(prefix, { limit: 1000 });

if (verificationError) throw verificationError;

if ((verification || []).filter((file) => file.id).length !== replacements.length) {
  throw new Error('La cantidad de objetos copiados no coincide con el origen.');
}

console.log(JSON.stringify({
  tenantId: tenant.id,
  copied: replacements.length,
  destinationPrefix: prefix,
  originalsPreserved: true,
}, null, 2));
