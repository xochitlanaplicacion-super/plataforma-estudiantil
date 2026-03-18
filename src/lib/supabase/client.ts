
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuuohbztrxxneozagecr.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1dW9oYnp0cnh4bmVvemFnZWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzk3MjUsImV4cCI6MjA4OTM1NTcyNX0.wqNj-_mQilHdBfgVIZYOkSaf7ca39i761zdpgM_ovKA';

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
