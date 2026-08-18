const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ukozogwobyucfaizkvlt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: asignaciones } = await supabase
    .from('asignaciones_profesor')
    .select('id, materia_id, grupo_id, materias(nombre), grupos(nombre)');
  console.log(JSON.stringify(asignaciones, null, 2));
}
run();
