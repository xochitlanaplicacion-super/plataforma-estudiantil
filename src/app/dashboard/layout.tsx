
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

import { getEstadoPagoIA } from '@/lib/actions/pagos';
import { AlumnoAIAssistant } from '@/components/shared/AlumnoAIAssistant';
import { ProfesorAIAssistant } from '@/components/shared/ProfesorAIAssistant';
import { AIAssistantWrapper } from '@/components/shared/AIAssistantWrapper';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, nombre, apellidos, estatus, foto_perfil')
    .eq('id', user.id)
    .single();

  if (!profile || profile.estatus !== 'activo') {
    redirect('/');
  }

  const userName = `${profile.nombre} ${profile.apellidos}`.trim() || user.email || 'Usuario';
  const pagoIA = await getEstadoPagoIA();

  return (
    <>
      <DashboardLayout 
        userRole={profile.rol as any} 
        userName={userName}
        userId={user.id}
        userAvatar={profile.foto_perfil}
      >
        {children}
      </DashboardLayout>

      <AIAssistantWrapper>
        {pagoIA && profile.rol === 'alumno' && (
          <AlumnoAIAssistant userId={user.id} userName={userName} />
        )}

        {pagoIA && profile.rol === 'profesor' && (
          <ProfesorAIAssistant userId={user.id} userName={userName} />
        )}
      </AIAssistantWrapper>
    </>
  );
}
