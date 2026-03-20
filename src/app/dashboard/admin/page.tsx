"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, GraduationCap, School, Layers, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { mockUsers } from '@/lib/mock-data';

export default function AdminDashboard() {
  const stats = [
    { label: 'Total Alumnos', value: '1,240', icon: Users, color: 'text-blue-600' },
    { label: 'Profesores', value: '85', icon: GraduationCap, color: 'text-emerald-600' },
    { label: 'Carreras', value: '12', icon: School, color: 'text-amber-600' },
    { label: 'Grupos Activos', value: '42', icon: Layers, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Panel Administrativo</h2>
        <p className="text-muted-foreground">Control global de la plataforma Emiliano Zapata.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Usuarios Recientes</CardTitle>
                <CardDescription>Alumnos y profesores dados de alta recientemente.</CardDescription>
              </div>
              <Button variant="outline" size="sm">Ver todos</Button>
            </div>
          </CardHeader>
          <CardContent>
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
                {mockUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.nombre} {user.apellidos}</TableCell>
                    <TableCell className="capitalize">{user.rol}</TableCell>
                    <TableCell>
                      <Badge variant={user.estatus === 'activo' ? 'default' : 'secondary'}>
                        {user.estatus === 'activo' ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
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
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
            <CardDescription>Operaciones frecuentes del sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full justify-start gap-2 bg-primary">
              <Users size={18} /> Crear Nuevo Usuario
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2">
              <School size={18} /> Nueva Carrera
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2">
              <GraduationCap size={18} /> Asignar Profesor
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2">
              <Layers size={18} /> Gestionar Niveles
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}