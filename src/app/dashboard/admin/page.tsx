
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, GraduationCap, School, Layers, AlertCircle, Loader2, FileWarning, Mail, Send, Eye, MessageSquare, ClipboardList, ArrowRight, ShieldOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { User } from '@/lib/types';
import { UserDialog } from '@/components/admin/UserDialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, Cell } from 'recharts';
import { sendDocReminderAction } from '@/lib/actions/users';
import { getServicioPlataformaInfo } from '@/lib/actions/pagos';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useInstitucion } from '@/hooks/use-institucion';
import { VigenciaPlataformaCard } from '@/components/admin/VigenciaPlataformaCard';

export default function AdminDashboard() {
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const { config: inst } = useInstitucion();
  const [loading, setLoading] = useState(true);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [stats, setStats] = useState({
    alumnos: 0,
    profesores: 0,
    carreras: 0,
    grupos: 0,
    nuevosMensajes: 0,
    aspirantesPendientes: 0
  });
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [alumnosMissingDocs, setAlumnosMissingDocs] = useState<User[]>([]);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [servicioPlataforma, setServicioPlataforma] = useState<{
    estado: string | null;
    fecha_inicio: string | null;
    duracion_dias: number;
  }>({ estado: null, fecha_inicio: null, duracion_dias: 30 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const hoy = new Date().toISOString().split('T')[0];

      // Contadores inteligentes (Solo activos)
      const { count: alumnosCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('rol', 'alumno')
        .eq('estatus', 'activo');

      const { count: profesCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('rol', 'profesor')
        .eq('estatus', 'activo');

      const { count: carrerasCount } = await supabase.from('carreras').select('*', { count: 'exact', head: true });
      const { count: gruposCount } = await supabase.from('groups').select('*', { count: 'exact', head: true });

      // Verificar mensajes nuevos para el popup
      const { count: newMessagesCount } = await supabase
        .from('mensajes_contacto')
        .select('*', { count: 'exact', head: true })
        .eq('estatus', 'nuevo');

      // Aspirantes pendientes (No inscritos aún y no archivados)
      const { count: aspirantesCount } = await supabase
        .from('aspirantes')
        .select('*', { count: 'exact', head: true })
        .neq('estatus', 'inscrito')
        .or('is_archived.eq.false,is_archived.is.null');

      setStats({
        alumnos: alumnosCount || 0,
        profesores: profesCount || 0,
        carreras: carrerasCount || 0,
        grupos: gruposCount || 0,
        nuevosMensajes: newMessagesCount || 0,
        aspirantesPendientes: aspirantesCount || 0
      });

      // Mostrar notificación si hay mensajes nuevos
      if (newMessagesCount && newMessagesCount > 0) {
        toast({
          title: "📬 ¡Nuevos Prospectos!",
          description: `Tienes ${newMessagesCount} mensajes nuevos esperando atención en el CRM.`,
          variant: "default",
          action: (
            <ToastAction 
              altText="Ver mensajes" 
              onClick={() => router.push('/dashboard/admin/crm/mensajes')}
              className="bg-primary text-white hover:bg-primary/90"
            >
              Ver ahora
            </ToastAction>
          ),
        });
      }

      const { data: users } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (users) setRecentUsers(users as any);

      // Alumnos con documentos faltantes QUE NO HAYAN EXPIRADO
      const { data: missingDocsAlumnos } = await supabase
        .from('profiles')
        .select('*')
        .eq('rol', 'alumno')
        .eq('estatus', 'activo')
        .or('doc_acta_nacimiento.eq.false,doc_certificado_estudios.eq.false,doc_curp.eq.false,doc_ine.eq.false')
        .gte('fecha_expiracion', hoy) 
        .order('nombre', { ascending: true });

      if (missingDocsAlumnos) setAlumnosMissingDocs(missingDocsAlumnos as any);

      // Consultar estado del servicio de plataforma usando la Server Action
      const resServicio = await getServicioPlataformaInfo();

      if (resServicio.success && resServicio.data) {
        setServicioPlataforma({
          estado: resServicio.data.estado,
          fecha_inicio: resServicio.data.fecha_inicio,
          duracion_dias: resServicio.data.duracion_dias,
        });
      }

    } catch (error) {
      console.error("Error fetching admin stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsUserDialogOpen(true);
  };

  const handleSendReminder = async (id: string) => {
    setSendingReminder(id);
    const result = await sendDocReminderAction(id);
    if (result.success) {
      toast({ title: "Recordatorio Enviado", description: "Se ha enviado un correo con la lista de documentos faltantes." });
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error });
    }
    setSendingReminder(null);
  };

  const chartData = [
    { name: 'Actas', count: alumnosMissingDocs.filter(u => !u.doc_acta_nacimiento).length, color: '#8B2332' },
    { name: 'Certificados', count: alumnosMissingDocs.filter(u => !u.doc_certificado_estudios).length, color: '#E8D5B7' },
    { name: 'CURP Doc', count: alumnosMissingDocs.filter(u => !u.doc_curp).length, color: '#1A4A3F' },
    { name: 'INE', count: alumnosMissingDocs.filter(u => !u.doc_ine).length, color: '#f59e0b' },
  ];

  // ─── Lógica del indicador circular de vigencia ───
  const DURACION_SERVICIO_DIAS = servicioPlataforma.duracion_dias || 30;

  const servicioInfo = useMemo(() => {
    if (!servicioPlataforma.fecha_inicio || servicioPlataforma.estado !== 'SI') {
      return { diasRestantes: 0, fechaFin: null, porcentaje: 0, activo: servicioPlataforma.estado === 'SI' };
    }
    const inicio = new Date(servicioPlataforma.fecha_inicio + 'T00:00:00');
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + DURACION_SERVICIO_DIAS);
    const ahora = new Date();
    const msRestantes = fin.getTime() - ahora.getTime();
    const diasRestantes = Math.max(0, Math.ceil(msRestantes / (1000 * 60 * 60 * 24)));
    const porcentaje = Math.max(0, Math.min(1, diasRestantes / DURACION_SERVICIO_DIAS));
    return { diasRestantes, fechaFin: fin, porcentaje, activo: true };
  }, [servicioPlataforma]);

  const getColorVigencia = (dias: number): string => {
    if (dias >= 21) return '#166534'; // verde oscuro
    if (dias >= 16) return '#22c55e'; // verde claro
    if (dias >= 11) return '#eab308'; // amarillo
    if (dias >= 6)  return '#f97316'; // naranja
    if (dias >= 3)  return '#ea580c'; // naranja oscuro
    return '#dc2626';                 // rojo
  };

  const formatFechaLarga = (date: Date | null): string => {
    if (!date) return '—';
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // SVG circular constants
  const RADIO = 54;
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Panel Administrativo</h2>
          <p className="text-muted-foreground">Control global de la plataforma {inst.nombre_corto}.</p>
        </div>
        <div className="flex gap-4 items-center">
          {stats.nuevosMensajes > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 animate-pulse px-4 py-1.5 rounded-full">
              {stats.nuevosMensajes} MENSAJES PENDIENTES
            </Badge>
          )}
        </div>
      </div>

      {/* ─── TARJETA PAGO DE SERVICIO PLATAFORMA ─── */}
      <VigenciaPlataformaCard servicioPlataforma={servicioPlataforma} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* NUEVA TARJETA: ASPIRANTES */}
        <Card 
          className={cn(
            "cursor-pointer transition-all duration-300 hover:shadow-lg border-2",
            stats.aspirantesPendientes > 0 
              ? "bg-emerald-50/50 border-emerald-200" 
              : "bg-white border-muted"
          )}
          onClick={() => router.push('/dashboard/admin/crm/aspirantes')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Aspirantes</CardTitle>
            <ClipboardList className={cn("h-5 w-5", stats.aspirantesPendientes > 0 ? "text-emerald-600" : "text-muted-foreground")} />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <div className="text-3xl font-black text-slate-800">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats.aspirantesPendientes.toLocaleString()}
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Por Inscribir</p>
            </div>
            {stats.aspirantesPendientes > 0 && (
              <Button variant="ghost" className="w-full mt-4 h-8 text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 gap-2 p-0">
                Atender <ArrowRight size={12} />
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alumnos Activos</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : stats.alumnos.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profesores Activos</CardTitle>
            <GraduationCap className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : stats.profesores.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors" 
          onClick={() => router.push('/dashboard/admin/crm/mensajes')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Nuevos Mensajes</CardTitle>
            <MessageSquare className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : stats.nuevosMensajes.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Grupos Activos</CardTitle>
            <Layers className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : stats.grupos.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="col-span-4 shadow-sm border-muted/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Expedientes Pendientes (Alumnos Vigentes)</CardTitle>
                <CardDescription>Estadística de documentos faltantes de alumnos con acceso activo.</CardDescription>
              </div>
              <Badge variant="outline" className="text-primary border-primary">
                {alumnosMissingDocs.length} Alumnos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[300px]">
             {loading ? (
                <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin" /></div>
             ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
             )}
          </CardContent>
        </Card>

        <Card className="col-span-3 shadow-sm border-muted/60">
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
            <CardDescription>Operaciones frecuentes del sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              className="w-full justify-start gap-2 bg-primary shadow-md hover:opacity-90 transition-opacity"
              onClick={() => {
                setSelectedUser(null);
                setIsUserDialogOpen(true);
              }}
            >
              <Users size={18} /> Registrar Alumno / Usuario
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 border-muted hover:bg-muted/50" onClick={() => router.push('/dashboard/admin/crm/mensajes')}>
              <MessageSquare size={18} /> CRM Prospectos
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 border-muted hover:bg-muted/50" onClick={() => router.push('/dashboard/admin/crm/aspirantes')}>
              <GraduationCap size={18} /> Validar Preregistros
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 border-muted hover:bg-muted/50" onClick={() => router.push('/dashboard/admin/usuarios')}>
              <Users size={18} /> Gestión de Usuarios
            </Button>
          </CardContent>
        </Card>

        <Card className="col-span-7 shadow-sm border-muted/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="text-amber-600" size={20} /> Alumnos con Documentación Pendiente
              </CardTitle>
              <CardDescription>Enlista a los estudiantes vigentes que tienen al menos un documento faltante.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
               <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
            ) : alumnosMissingDocs.length === 0 ? (
               <div className="text-center py-10 text-muted-foreground">No hay alumnos vigentes con pendientes.</div>
            ) : (
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Nombre Completo</TableHead>
                     <TableHead>Matrícula</TableHead>
                     <TableHead>Documentos Faltantes</TableHead>
                     <TableHead className="text-right">Acciones</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {alumnosMissingDocs.map((user) => {
                     const faltantes = [];
                     if (!user.doc_acta_nacimiento) faltantes.push("Acta");
                     if (!user.doc_certificado_estudios) faltantes.push("Certificado");
                     if (!user.doc_curp) faltantes.push("CURP");
                     if (!user.doc_ine) faltantes.push("INE");

                     return (
                       <TableRow key={user.id}>
                         <TableCell className="font-semibold cursor-pointer text-primary hover:underline" onClick={() => handleEditUser(user)}>
                            {user.nombre} {user.apellidos}
                         </TableCell>
                         <TableCell className="font-mono text-[10px]">{user.matricula || 'SIN MATRÍCULA'}</TableCell>
                         <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {faltantes.map(f => (
                                <Badge key={f} variant="secondary" className="text-[9px] bg-destructive/10 text-destructive border-none">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                         </TableCell>
                         <TableCell className="text-right flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 gap-1 text-xs" 
                              onClick={() => handleEditUser(user)}
                            >
                              <Eye size={14} /> Detalles
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 gap-1 text-xs border-amber-500 text-amber-600 hover:bg-amber-50"
                              disabled={sendingReminder === user.id}
                              onClick={() => handleSendReminder(user.id)}
                            >
                              {sendingReminder === user.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Send size={14} />
                              )}
                              Recordatorio
                            </Button>
                         </TableCell>
                       </TableRow>
                     );
                   })}
                 </TableBody>
               </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <UserDialog 
        user={selectedUser}
        open={isUserDialogOpen} 
        onOpenChange={setIsUserDialogOpen} 
        onSuccess={fetchData} 
      />
    </div>
  );
}
