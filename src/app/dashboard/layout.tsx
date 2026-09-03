
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
    .select('rol, nombre, apellidos, estatus, foto_perfil, tenant_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.estatus !== 'activo') {
    redirect('/');
  }

  const userName = `${profile.nombre} ${profile.apellidos}`.trim() || user.email || 'Usuario';
  const pagoIA = profile.rol === 'encargado_filtro' ? false : await getEstadoPagoIA();
  const { data: filterFeature } = ['superuser', 'admin', 'encargado_filtro'].includes(profile.rol)
    ? await supabase.from('tenant_features').select('primary_filter_enabled').eq('tenant_id', profile.tenant_id).maybeSingle()
    : { data: null };

  return (
    <>
      <DashboardLayout 
        userRole={profile.rol as any} 
        userName={userName}
        userId={user.id}
        userAvatar={profile.foto_perfil}
        filterEnabled={Boolean(filterFeature?.primary_filter_enabled)}
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
