
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, nombre, apellidos, estatus')
    .eq('id', user.id)
    .single();

  if (!profile || profile.estatus !== 'activo') {
    redirect('/');
  }

  const userName = `${profile.nombre} ${profile.apellidos}`.trim() || user.email || 'Usuario';

  return (
    <DashboardLayout 
      userRole={profile.rol as any} 
      userName={userName}
      userId={user.id}
    >
      {children}
    </DashboardLayout>
  );
}
