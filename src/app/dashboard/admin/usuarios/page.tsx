
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, UserPlus, Search, Filter, Loader2, Edit, Trash2, Key, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { User, UserRole, UserEstatus } from '@/lib/types';
import { UserDialog } from '@/components/admin/UserDialog';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { deleteUserAccount, updateUserProfile } from '@/lib/actions/users';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function UsuariosManagement() {
  const { toast } = useToast();
  const supabase = createClient();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*');

    if (data) {
      const rawUsers = data as User[];
      const hoy = new Date().toISOString().split('T')[0];
      
      // Proceso silencioso de desactivación de expirados
      const expiredActiveUsers = rawUsers.filter(u => 
        u.fecha_expiracion && u.fecha_expiracion < hoy && u.estatus === 'activo'
      );

      if (expiredActiveUsers.length > 0) {
        console.log(`Detectados ${expiredActiveUsers.length} usuarios expirados. Actualizando estatus...`);
        for (const user of expiredActiveUsers) {
          await updateUserProfile(user.id, { ...user, estatus: 'inactivo' });
          user.estatus = 'inactivo'; // Actualización local inmediata
        }
      }

      setUsers(rawUsers);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedUser(null);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar permanentemente a este usuario y su acceso al sistema?')) {
      setDeletingId(id);
      const result = await deleteUserAccount(id);
      
      if (result.success) {
        toast({ title: 'Éxito', description: 'Usuario y acceso eliminados correctamente.' });
        fetchUsers();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || 'No se pudo eliminar el acceso.' });
      }
      setDeletingId(null);
    }
  };

  const processedUsers = useMemo(() => {
    let filtered = users.filter(user => {
      const matchesSearch = `${user.nombre} ${user.apellidos} ${user.email} ${user.curp} ${user.matricula}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      
      const matchesRole = roleFilter === 'todos' || user.rol === roleFilter;
      const matchesStatus = statusFilter === 'todos' || user.estatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });

    // Ordenamiento por prioridad solicitado:
    // 1. Superuser
    // 2. Admin
    // 3. Profesor
    // 4. Alumno (Activo)
    // 5. Inactivos (Al final de todo)
    return filtered.sort((a, b) => {
      // Primero, si uno es inactivo y el otro no, el inactivo va al final
      if (a.estatus === 'inactivo' && b.estatus !== 'inactivo') return 1;
      if (a.estatus !== 'inactivo' && b.estatus === 'inactivo') return -1;

      // Si ambos tienen el mismo estatus (o ambos son inactivos), ordenar por Rol
      const roleOrder = { superuser: 0, admin: 1, profesor: 2, alumno: 3 };
      const roleA = roleOrder[a.rol] ?? 99;
      const roleB = roleOrder[b.rol] ?? 99;

      if (roleA !== roleB) return roleA - roleB;

      // Finalmente por nombre
      return a.nombre.localeCompare(b.nombre);
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary font-headline">Gestión de Usuarios</h2>
          <p className="text-muted-foreground">Administra alumnos, profesores y personal administrativo.</p>
        </div>
        <Button className="bg-primary gap-2 shadow-md" onClick={handleCreate}>
          <UserPlus size={18} /> Nuevo Usuario
        </Button>
      </div>

      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="relative md:col-span-6 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input 
                placeholder="Buscar por nombre, correo, matrícula o CURP..." 
                className="pl-10 h-11 border-muted"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-11">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-muted-foreground" />
                    <SelectValue placeholder="Rol" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los Roles</SelectItem>
                  <SelectItem value="superuser">Superusuarios</SelectItem>
                  <SelectItem value="admin">Administrativos</SelectItem>
                  <SelectItem value="profesor">Profesores</SelectItem>
                  <SelectItem value="alumno">Alumnos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11">
                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-muted-foreground" />
                    <SelectValue placeholder="Estatus" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los Estados</SelectItem>
                  <SelectItem value="activo">Activos</SelectItem>
                  <SelectItem value="inactivo">Inactivos (Expirados)</SelectItem>
                  <SelectItem value="suspendido">Suspendidos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : processedUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground italic border-2 border-dashed rounded-xl">
              No se encontraron usuarios con los filtros aplicados.
            </div>
          ) : (
            <div className="rounded-md border border-muted/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-bold">Nombre Completo</TableHead>
                    <TableHead className="font-bold">Rol/Matrícula</TableHead>
                    <TableHead className="font-bold">Contraseña</TableHead>
                    <TableHead className="font-bold text-center">Estado</TableHead>
                    <TableHead className="text-right font-bold">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedUsers.map((user) => (
                    <TableRow key={user.id} className={`hover:bg-muted/10 transition-colors ${user.estatus === 'inactivo' ? 'bg-destructive/5' : ''}`}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{user.nombre} {user.apellidos}</span>
                          <span className="text-[10px] text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="capitalize text-[9px] font-bold w-fit">
                            {user.rol}
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground">{user.matricula || user.numero_empleado || 'S/N'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 cursor-help">
                                <Key size={12} className="text-primary/50" />
                                <span className="text-[11px] font-mono blur-[3px] hover:blur-none transition-all duration-300">
                                  {user.password_plain || '********'}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Pasa el mouse para ver clave</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          className={`text-[10px] px-3 h-6 uppercase font-bold ${
                            user.estatus === 'activo' ? 'bg-primary text-white' : 
                            user.estatus === 'inactivo' ? 'bg-red-600 text-white' : 
                            'bg-amber-500 text-white'
                          }`}
                        >
                          {user.estatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary"
                            onClick={() => handleEdit(user)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(user.id)}
                            disabled={deletingId === user.id}
                          >
                            {deletingId === user.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserDialog 
        user={selectedUser} 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        onSuccess={fetchUsers} 
      />
    </div>
  );
}
