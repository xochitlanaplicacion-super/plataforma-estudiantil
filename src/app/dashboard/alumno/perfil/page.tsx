import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProfilePictureUploader } from '@/components/alumno/ProfilePictureUploader';
import { BotonDescargaCredencial } from '@/components/alumno/BotonDescargaCredencial';
import { UserCircle, Calendar, GraduationCap, Mail, Phone, Hash, FileText, CreditCard } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getConfigCredenciales, getInstitutionConfig } from '@/lib/actions/credenciales';

export const metadata = {
  title: 'Mis Datos | Plataforma Estudiantil',
};

export default async function PerfilPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  // Fetch profile data
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return <div className="p-8 text-center">No se encontró información del perfil.</div>;
  }

  // Fetch academic data from relations directly (like admin credential view)
  let carreraName = '';
  let nivelName = '';
  let grupoName = '';

  if (profile.carrera_id) {
    const { data: carrera } = await supabase
      .from('carreras')
      .select('nombre, nivel_id')
      .eq('id', profile.carrera_id)
      .single();
    
    if (carrera) {
      carreraName = carrera.nombre;
      if (carrera.nivel_id) {
        const { data: nivel } = await supabase
          .from('niveles')
          .select('nombre')
          .eq('id', carrera.nivel_id)
          .single();
        if (nivel) nivelName = nivel.nombre;
      }
    }
  }

  if (profile.grupo_id) {
    const { data: grupo } = await supabase
      .from('grupos')
      .select('nombre')
      .eq('id', profile.grupo_id)
      .single();
    if (grupo) grupoName = grupo.nombre;
  }

  // Check credential authorization
  const { data: credAuth } = await supabase
    .from('credenciales_autorizadas')
    .select('autorizado')
    .eq('alumno_id', user.id)
    .maybeSingle();

  const credencialAutorizada = profile.estatus === 'activo' && credAuth?.autorizado === true;

  // Load credential design config and institution data only if authorized
  let credConfig: any = null;
  let institucion: any = null;
  if (credencialAutorizada) {
    [credConfig, institucion] = await Promise.all([
      getConfigCredenciales(),
      getInstitutionConfig(),
    ]);
  }

  const fullName = `${profile.nombre} ${profile.apellidos}`.trim();

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2">
          <UserCircle size={28} /> Mis Datos Personales
        </h2>
        <p className="text-muted-foreground mt-1">Consulta tu información personal y académica, y administra tu foto de perfil.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Photo & Main Info */}
        <div className="md:col-span-1 space-y-6">
          <ProfilePictureUploader 
            currentUrl={profile.foto_perfil} 
            userName={fullName} 
          />
          
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Estatus Académico</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={profile.estatus === 'activo' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}>
                  {profile.estatus?.toUpperCase() || 'DESCONOCIDO'}
                </Badge>
              </div>
              {carreraName && (
                <div className="pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Programa</p>
                  <p className="text-sm font-semibold">{carreraName}</p>
                </div>
              )}
              {grupoName && (
                <div className="pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Grupo</p>
                  <p className="text-sm font-semibold">{grupoName}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Credential Download — only if authorized */}
          {credencialAutorizada && credConfig && institucion && (
            <Card className="border-primary/10 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-2">
                  <CreditCard size={14} /> Mi Credencial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Tu credencial está lista para descargar. Se generará un PDF tamaño carta listo para imprimir, recortar y enmicar.
                </p>
                <BotonDescargaCredencial
                  config={credConfig}
                  alumno={{
                    nombre: profile.nombre,
                    apellidos: profile.apellidos,
                    nivel: nivelName,
                    carrera: carreraName,
                    matricula: profile.matricula || '',
                    foto_perfil: profile.foto_perfil,
                    fecha_inicio: profile.fecha_inicio,
                    fecha_expiracion: profile.fecha_expiracion,
                  }}
                  institucion={institucion}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Detailed Info */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-primary/10 shadow-sm h-full">
            <CardHeader className="border-b bg-slate-50/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="text-primary" size={20} /> Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
              
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                  <UserCircle size={14} /> Nombre Completo
                </div>
                <p className="font-semibold text-gray-900">{fullName}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                  <Hash size={14} /> Matrícula
                </div>
                <p className="font-semibold text-gray-900">{profile.matricula || 'No asignada'}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                  <FileText size={14} /> CURP
                </div>
                <p className="font-semibold text-gray-900 uppercase">{profile.curp || 'No registrado'}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                  <Calendar size={14} /> Fecha de Nacimiento
                </div>
                <p className="font-semibold text-gray-900">
                  {profile.fecha_nacimiento 
                    ? new Date(profile.fecha_nacimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) 
                    : 'No registrada'}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                  <Mail size={14} /> Correo Electrónico
                </div>
                <p className="font-semibold text-gray-900 break-all">{profile.email}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                  <Phone size={14} /> Teléfono
                </div>
                <p className="font-semibold text-gray-900">{profile.telefono || 'No registrado'}</p>
              </div>

              {profile.fecha_inicio && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">
                    <GraduationCap size={14} /> Fecha de Ingreso
                  </div>
                  <p className="font-semibold text-gray-900">
                    {new Date(profile.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              )}

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
