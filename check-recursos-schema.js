require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabaseAdmin.from('recursos_temas').select('*').limit(1);
  if (error) {
     // try just 'recursos'
     const { data: d2, error: e2 } = await supabaseAdmin.from('recursos').select('*').limit(1);
     if (e2) console.error(e2);
     else console.log("Columns (recursos):", Object.keys(d2[0] || {}));
  } else {
    console.log("Columns (recursos_temas):", Object.keys(data[0] || {}));
  }
}
run();
