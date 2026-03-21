
"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, GraduationCap, School, Layers, AlertCircle, Loader2, FileWarning, Mail, Send, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { User } from '@/lib/types';
import { UserDialog } from '@/components/admin/UserDialog';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, Cell } from 'recharts';
import { sendDocReminderAction } from '@/lib/actions/users';
import { useToast } from '@/hooks/use-toast';

export default function AdminDashboard() {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [stats, setStats] = useState({
    alumnos: 0,
    profesores: 0,
    carreras: 0,
    grupos: 0
  });
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [alumnosMissingDocs, setAlumnosMissingDocs] = useState<User[]>([]);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const hoy = new Date().toISOString().split('T')[0];

      const { count: alumnosCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('rol', 'alumno');
      const { count: profesCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('rol', 'profesor');
      const { count: carrerasCount } = await supabase.from('careers').select('*', { count: 'exact', head: true });
      const { count: gruposCount } = await supabase.from('groups').select('*', { count: 'exact', head: true });

      setStats({
        alumnos: alumnosCount || 0,
        profesores: profesCount || 0,
        carreras: carrerasCount || 0,
        grupos: gruposCount || 0
      });

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
        .gte('fecha_expiracion', hoy) // Solo mostrar los que tienen vigencia vigente
        .order('nombre', { ascending: true });

      if (missingDocsAlumnos) setAlumnosMissingDocs(missingDocsAlumnos as any);

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

  const statCards = [
    { label: 'Total Alumnos', value: stats.alumnos, icon: Users, color: 'text-blue-600' },
    { label: 'Profesores', value: stats.profesores, icon: GraduationCap, color: 'text-emerald-600' },
    { label: 'Carreras', value: stats.carreras, icon: School, color: 'text-amber-600' },
    { label: 'Grupos Activos', value: stats.grupos, icon: Layers, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Panel Administrativo</h2>
        <p className="text-muted-foreground">Control global de la plataforma Emiliano Zapata.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : stat.value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
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
            <Button variant="outline" className="w-full justify-start gap-2 border-muted hover:bg-muted/50">
              <School size={18} /> Nueva Carrera
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 border-muted hover:bg-muted/50">
              <GraduationCap size={18} /> Asignar Profesor
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 border-muted hover:bg-muted/50">
              <Layers size={18} /> Gestionar Niveles
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
