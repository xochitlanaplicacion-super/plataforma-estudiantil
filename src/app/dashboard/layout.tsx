
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

import { AlumnoAIAssistant } from '@/components/shared/AlumnoAIAssistant';
import { ProfesorAIAssistant } from '@/components/shared/ProfesorAIAssistant';
import { AIAssistantWrapper } from '@/components/shared/AIAssistantWrapper';
import { getTenantServiceState, isServiceExpired } from '@/lib/tenant/context';

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
  const assistantRole = profile.rol === 'alumno' || profile.rol === 'profesor';
  const needsServiceState = ['alumno', 'profesor', 'encargado_filtro'].includes(profile.rol);
  const needsFilterFeature = ['superuser', 'admin', 'encargado_filtro'].includes(profile.rol);
  const [rawServiceState, filterFeatureResult, tenantResult] = await Promise.all([
    needsServiceState ? getTenantServiceState(profile.tenant_id) : Promise.resolve(null),
    needsFilterFeature
      ? supabase.from('tenant_features').select('primary_filter_enabled').eq('tenant_id', profile.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    assistantRole && profile.tenant_id
      ? createSupabaseAdminClient().from('tenants').select('estado').eq('id', profile.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // El mismo estado del servicio alimenta la cuenta regresiva y el asistente.
  // Se mantiene la comprobación de institución activa de getEstadoPagoIA(),
  // pero en paralelo, sin repetir auth → perfil → tenant en serie.
  const pagoIA = assistantRole
    && tenantResult.data?.estado === 'activo'
    && Boolean(rawServiceState?.ia_habilitada)
    && !isServiceExpired(rawServiceState);
  const serviceState = ['profesor', 'encargado_filtro'].includes(profile.rol) && rawServiceState ? {
    estado: rawServiceState.estado,
    fecha_inicio: rawServiceState.fecha_inicio,
    duracion_dias: rawServiceState.duracion_dias,
    timezone: rawServiceState.timezone,
  } : null;

  return (
    <>
      <DashboardLayout 
        userRole={profile.rol as any} 
        userName={userName}
        userId={user.id}
        userAvatar={profile.foto_perfil}
        filterEnabled={Boolean(filterFeatureResult.data?.primary_filter_enabled)}
        serviceState={serviceState}
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
