require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check(table) {
  const { data, error } = await supabaseAdmin.from(table).select('*').limit(1);
  if (error) {
    console.error(`Error on ${table}:`, error.message);
  } else {
    console.log(`Columns for ${table}:`, Object.keys(data[0] || {}));
  }
}

async function run() {
  await check('unidades');
  await check('temas');
  await check('ejercicios');
}
run();
