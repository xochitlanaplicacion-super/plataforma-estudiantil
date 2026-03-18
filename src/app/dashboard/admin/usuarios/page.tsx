
"use client";

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, UserPlus, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { mockUsers } from '@/lib/mock-data';

export default function UsuariosManagement() {
  return (
    <DashboardLayout userRole="superuser" userName="Super Admin">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h2>
            <p className="text-muted-foreground">Administra alumnos, profesores y personal administrativo.</p>
          </div>
          <Button className="bg-primary gap-2">
            <UserPlus size={18} /> Nuevo Usuario
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input placeholder="Buscar por nombre, correo o CURP..." className="pl-10" />
              </div>
              <Button variant="outline" className="gap-2">
                <Filter size={16} /> Filtros
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre Completo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>CURP</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div>
                        {user.nombre} {user.apellidos}
                        <div className="text-[10px] text-muted-foreground">{user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{user.rol}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.estatus === 'activo' ? 'default' : 'secondary'}>
                        {user.estatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{user.curp}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Editar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
