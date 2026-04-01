require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabaseAdmin
    .from('resultados_ejercicios')
    .select(`
      alumno_id,
      profiles (
        nombre
      )
    `)
    .limit(1);

  console.log("Data w/o hint:", data);
  console.log("Error w/o hint:", error);
}
test();
