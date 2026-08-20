'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CircleDollarSign, Globe2, Plus, RefreshCw, ShieldCheck, Users, Bot, ScrollText, LogOut, Save } from 'lucide-react';
import {
  addTenantDomain,
  createTenantSchool,
  recordSupportAccess,
  setPrimaryTenantDomain,
  updateTenantDomain,
  updateTenantService,
  updateTenantStatus,
} from '@/lib/actions/platform';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Props = { initialData: { tenants: any[]; audit: any[] } };

export function PlatformDashboard({ initialData }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  const run = (task: () => Promise<any>, successTitle: string, onSuccess?: (result: any) => void) => startTransition(async () => {
    const result = await task();
    if (!result?.success) toast({ variant: 'destructive', title: 'No se pudo completar', description: result?.error || 'Error desconocido' });
    else {
      onSuccess?.(result);
      toast({ title: successTitle });
      router.refresh();
    }
  });

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  };

  const active = initialData.tenants.filter((tenant) => tenant.estado === 'activo').length;
  const totalUsers = initialData.tenants.reduce((sum, tenant) => sum + tenant.counts.users, 0);
  const totalTokens = initialData.tenants.reduce((sum, tenant) => sum + tenant.aiTokens, 0);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90 px-6 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.24em]">Superduperuser</span></div>
            <h1 className="mt-1 text-2xl font-bold">Administración de la plataforma</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.refresh()} disabled={pending}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
            <Button onClick={() => setShowCreate((value) => !value)}><Plus className="mr-2 h-4 w-4" />Nueva escuela</Button>
            <Button variant="destructive" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Cerrar sesión</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-4">
          <Metric icon={Building2} label="Escuelas" value={initialData.tenants.length} detail={`${active} activas`} />
          <Metric icon={Users} label="Usuarios" value={totalUsers} detail="Todos los tenants" />
          <Metric icon={Bot} label="Tokens IA" value={totalTokens.toLocaleString('es-MX')} detail="Uso acumulado" />
          <Metric icon={ScrollText} label="Auditoría" value={initialData.audit.length} detail="Últimos eventos" />
        </section>

        {showCreate && <CreateTenantForm pending={pending} onSubmit={(data) => run(() => createTenantSchool(data), 'Escuela aprovisionada')} />}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Instituciones</h2>
          {initialData.tenants.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} pending={pending} run={run} />
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><ScrollText className="h-5 w-5 text-emerald-400" />Auditoría global</h2>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400"><tr><th className="pb-3">Fecha</th><th className="pb-3">Acción</th><th className="pb-3">Tenant</th><th className="pb-3">Detalle</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {initialData.audit.map((row) => <tr key={row.id}><td className="py-3 pr-3 whitespace-nowrap">{new Date(row.created_at).toLocaleString('es-MX')}</td><td className="py-3 pr-3 font-mono text-emerald-300">{row.accion}</td><td className="py-3 pr-3 font-mono text-xs">{row.tenant_id || 'global'}</td><td className="max-w-sm truncate py-3 text-slate-400">{JSON.stringify(row.detalles)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon: Icon, label, value, detail }: any) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><Icon className="mb-3 h-5 w-5 text-emerald-400" /><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="text-xs text-slate-500">{detail}</p></div>;
}

function CreateTenantForm({ pending, onSubmit }: { pending: boolean; onSubmit: (data: any) => void }) {
  return <form className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      nombre: form.get('nombre'), slug: form.get('slug'), hostname: form.get('hostname'),
      superuserEmail: form.get('email'), superuserPassword: form.get('password'),
      superuserNombre: form.get('superuserNombre'), superuserApellidos: form.get('superuserApellidos'),
      superuserCurp: form.get('curp'), fechaInicio: form.get('fechaInicio'), duracionDias: Number(form.get('duracionDias')),
      smtpUser: form.get('smtpUser'), smtpPassword: form.get('smtpPassword'), smtpFromName: form.get('smtpFromName'),
    });
  }}>
    <h2 className="mb-5 text-lg font-semibold">Aprovisionar una escuela</h2>
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Nombre oficial" name="nombre" required />
      <Field label="Slug" name="slug" placeholder="escuela-demo" />
      <Field label="Dominio o subdominio" name="hostname" placeholder="escuela.midominio.com" required />
      <Field label="Nombre del superusuario" name="superuserNombre" required />
      <Field label="Apellidos" name="superuserApellidos" required />
      <Field label="CURP (opcional)" name="curp" />
      <Field label="Correo del superusuario" name="email" type="email" required />
      <Field label="Contraseña inicial" name="password" type="password" minLength={8} required />
      <Field label="Inicio del periodo" name="fechaInicio" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
      <Field label="Duración (días)" name="duracionDias" type="number" defaultValue="30" min="1" required />
      <Field label="Gmail SMTP" name="smtpUser" type="email" placeholder="correo@escuela.com" />
      <Field label="Contraseña de aplicación" name="smtpPassword" type="password" />
      <Field label="Nombre del remitente" name="smtpFromName" />
    </div>
    <Button className="mt-5" disabled={pending} type="submit">{pending ? 'Aprovisionando…' : 'Crear tenant y primer superusuario'}</Button>
  </form>;
}

function Field({ label, name, ...props }: any) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} className="border-white/10 bg-slate-900" {...props} /></div>;
}

function TenantCard({ tenant, pending, run }: any) {
  const service = Array.isArray(tenant.pago_de_servicios)
    ? (tenant.pago_de_servicios[0] || {})
    : (tenant.pago_de_servicios || {});
  const [ai, setAi] = useState(service.ia_habilitada ?? true);
  const [block, setBlock] = useState(service.bloquear_acceso_usuarios ?? false);
  const [serviceForm, setServiceForm] = useState({
    estado: service.estado || 'SI',
    fechaInicio: service.fecha_inicio || '',
    duracionDias: Number(service.duracion_dias || 30),
    mensajeBloqueo: service.mensaje_bloqueo || '',
  });

  useEffect(() => {
    setAi(service.ia_habilitada ?? true);
    setBlock(service.bloquear_acceso_usuarios ?? false);
    setServiceForm({
      estado: service.estado || 'SI',
      fechaInicio: service.fecha_inicio || '',
      duracionDias: Number(service.duracion_dias || 30),
      mensajeBloqueo: service.mensaje_bloqueo || '',
    });
  }, [service.estado, service.fecha_inicio, service.duracion_dias, service.ia_habilitada, service.bloquear_acceso_usuarios, service.mensaje_bloqueo]);

  return <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-3"><h3 className="text-xl font-bold">{tenant.nombre}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tenant.estado === 'activo' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{tenant.estado}</span></div><p className="mt-1 font-mono text-xs text-slate-500">{tenant.slug} · {tenant.id}</p></div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => recordSupportAccess(tenant.id), 'Modo soporte registrado en auditoría')}>Modo soporte</Button>
        {tenant.estado === 'activo' ? <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(() => updateTenantStatus(tenant.id, 'suspendido'), 'Institución suspendida')}>Suspender</Button> : <Button size="sm" disabled={pending} onClick={() => run(() => updateTenantStatus(tenant.id, 'activo'), 'Institución reactivada')}>Reactivar</Button>}
      </div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-4"><SmallStat label="Usuarios" value={tenant.counts.users} /><SmallStat label="Profesores" value={tenant.counts.professors} /><SmallStat label="Alumnos" value={tenant.counts.students} /><SmallStat label="Tokens IA" value={tenant.aiTokens.toLocaleString('es-MX')} /></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form className="space-y-4 rounded-xl border border-white/10 bg-black/10 p-4" onSubmit={(event) => {
        event.preventDefault();
        run(() => updateTenantService(tenant.id, {
          estado: serviceForm.estado as 'SI' | 'NO',
          fechaInicio: serviceForm.fechaInicio,
          duracionDias: serviceForm.duracionDias,
          iaHabilitada: ai,
          bloquearAccesoUsuarios: block,
          mensajeBloqueo: serviceForm.mensajeBloqueo,
        }), 'Periodo y accesos guardados permanentemente');
      }}>
        <h4 className="flex items-center gap-2 font-semibold"><CircleDollarSign className="h-4 w-4 text-emerald-400" />Servicio, pago y accesos</h4>
        <div className="grid grid-cols-3 gap-3"><div className="space-y-2"><Label>Estado</Label><select name="estado" value={serviceForm.estado} onChange={(event) => setServiceForm((current) => ({ ...current, estado: event.target.value }))} className="flex h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"><option value="SI">Activo</option><option value="NO">Suspendido</option></select></div><Field label="Inicio" name="fechaInicio" type="date" value={serviceForm.fechaInicio} onChange={(event: any) => setServiceForm((current) => ({ ...current, fechaInicio: event.target.value }))} /><Field label="Días" name="duracionDias" type="number" min="1" max="3660" value={serviceForm.duracionDias} onChange={(event: any) => setServiceForm((current) => ({ ...current, duracionDias: Number(event.target.value) }))} /></div>
        <Toggle label="Interfaz y consumo de IA" checked={ai} onCheckedChange={setAi} />
        <Toggle label="Bloquear login de profesores y alumnos al vencer/apagar" checked={block} onCheckedChange={setBlock} />
        <div className="space-y-2"><Label>Mensaje de bloqueo</Label><Textarea name="mensajeBloqueo" value={serviceForm.mensajeBloqueo} onChange={(event) => setServiceForm((current) => ({ ...current, mensajeBloqueo: event.target.value }))} className="border-white/10 bg-slate-900" /></div>
        <Button size="sm" type="submit" disabled={pending}><Save className="mr-2 h-4 w-4" />{pending ? 'Guardando…' : 'Guardar permanentemente'}</Button>
      </form>
      <div className="rounded-xl border border-white/10 bg-black/10 p-4">
        <h4 className="mb-4 flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4 text-emerald-400" />Dominios</h4>
        <div className="space-y-3">{tenant.tenant_domains?.map((domain: any) => <DomainEditor key={domain.id} tenantId={tenant.id} domain={domain} pending={pending} run={run} />)}</div>
        <p className="mt-4 text-xs leading-relaxed text-amber-300/80">El dominio queda guardado aquí de inmediato. Para que una dirección nueva abra la plataforma, también debe estar agregada al mismo proyecto en Vercel y apuntar por DNS a Vercel.</p>
        <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => addTenantDomain(tenant.id, String(form.get('hostname'))), 'Dominio alterno agregado'); event.currentTarget.reset(); }}><Input name="hostname" placeholder="dominio-alterno.com" className="border-white/10 bg-slate-900" required /><Button type="submit" size="sm" variant="outline" disabled={pending}>Agregar alterno</Button></form>
      </div>
    </div>
  </article>;
}

function DomainEditor({ tenantId, domain, pending, run }: any) {
  const [hostname, setHostname] = useState(domain.hostname);
  useEffect(() => setHostname(domain.hostname), [domain.hostname]);
  const unchanged = hostname.trim().toLowerCase() === domain.hostname;

  return <div className="rounded-lg bg-white/5 p-3">
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-slate-300">{domain.es_principal ? 'Dominio principal actual' : 'Dominio alterno'}</p>
      <p className="text-xs text-slate-500">{domain.estado}{domain.es_principal ? ' · principal' : ''}</p>
    </div>
    <div className="flex gap-2">
      <Input value={hostname} onChange={(event) => setHostname(event.target.value)} className="border-white/10 bg-slate-900 font-mono" aria-label="Dominio de la institución" />
      <Button type="button" size="sm" disabled={pending || unchanged || !hostname.trim()} onClick={() => run(
        () => updateTenantDomain(tenantId, domain.id, hostname),
        'Dominio actualizado permanentemente',
        (result: any) => setHostname(result.hostname)
      )}><Save className="mr-2 h-4 w-4" />Guardar</Button>
      {!domain.es_principal && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPrimaryTenantDomain(tenantId, domain.id), 'Dominio principal actualizado')}>Hacer principal</Button>}
    </div>
  </div>;
}

function Toggle({ label, checked, onCheckedChange }: any) { return <div className="flex items-center justify-between rounded-lg bg-white/5 p-3"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>; }
function SmallStat({ label, value }: any) { return <div className="rounded-lg bg-white/5 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{value}</p></div>; }
