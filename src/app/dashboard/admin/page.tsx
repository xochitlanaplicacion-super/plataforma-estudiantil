"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, GraduationCap, School, Layers, AlertCircle, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { User } from '@/lib/types';
import { UserDialog } from '@/components/admin/UserDialog';
import Link from 'next/link';

export default function AdminDashboard() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [stats, setStats] = useState({
    alumnos: 0,
    profesores: 0,
    carreras: 0,
    grupos: 0
  });
  const [recentUsers, setRecentUsers] = useState<User[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
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
    } catch (error) {
      console.error("Error fetching admin stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
                <CardTitle>Usuarios Recientes</CardTitle>
                <CardDescription>Últimos registros en la plataforma.</CardDescription>
              </div>
              <Link href="/dashboard/admin/usuarios">
                <Button variant="outline" size="sm">Ver todos</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-primary" />
              </div>
            ) : recentUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No hay usuarios registrados aún.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Vigencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium text-xs">
                        {user.nombre} {user.apellidos}
                      </TableCell>
                      <TableCell className="capitalize text-xs">{user.rol}</TableCell>
                      <TableCell>
                        <Badge variant={user.estatus === 'activo' ? 'default' : 'secondary'} className="text-[10px] h-5">
                          {user.estatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {user.fecha_expiracion && new Date(user.fecha_expiracion) < new Date() ? (
                          <span className="text-destructive font-semibold flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Expirado
                          </span>
                        ) : (
                          user.fecha_expiracion || 'N/A'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              onClick={() => setIsUserDialogOpen(true)}
            >
              <Users size={18} /> Crear Nuevo Usuario
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
      </div>

      <UserDialog 
        open={isUserDialogOpen} 
        onOpenChange={setIsUserDialogOpen} 
        onSuccess={fetchData} 
      />
    </div>
  );
}
