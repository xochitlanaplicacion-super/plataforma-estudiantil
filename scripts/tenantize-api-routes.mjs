import fs from 'node:fs';

for (const file of process.argv.slice(2)) {
  let text = fs.readFileSync(file, 'utf8');
  text = text.replaceAll('process.env.SUPABASE_SERVICE_ROLE_KEY', 'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  text = text.replaceAll('createClient(supabaseUrl, supabaseKey)', 'await createServerSupabaseClient()');
  if (text.includes('await createServerSupabaseClient()') && !text.includes("from '@/lib/supabase/server'") && !text.includes('from "@/lib/supabase/server"')) {
    text = `import { createServerSupabaseClient } from '@/lib/supabase/server';\n${text}`;
  }
  fs.writeFileSync(file, text);
}
