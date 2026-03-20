"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, UserPlus, Search, Filter, Loader2, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { User } from '@/lib/types';
import { UserDialog } from '@/components/admin/UserDialog';
import { useToast } from '@/hooks/use-toast';

export default function UsuariosManagement() {
  const { toast } = useToast();
  const supabase = createClient();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para el diálogo
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('nombre', { ascending: true });

    if (data) setUsers(data as any);
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
    if (confirm('¿Estás seguro de que deseas eliminar este perfil?')) {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el usuario.' });
      } else {
        toast({ title: 'Éxito', description: 'Usuario eliminado correctamente.' });
        fetchUsers();
      }
    }
  };

  const filteredUsers = users.filter(user => 
    `${user.nombre} ${user.apellidos}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.curp?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input 
                placeholder="Buscar por nombre, correo o CURP..." 
                className="pl-10 h-11 border-muted"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" className="gap-2 h-11 border-muted">
              <Filter size={16} /> Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground italic border-2 border-dashed rounded-xl">
              No se encontraron usuarios en la base de datos.
            </div>
          ) : (
            <div className="rounded-md border border-muted/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-bold">Nombre Completo</TableHead>
                    <TableHead className="font-bold">Rol</TableHead>
                    <TableHead className="font-bold">Estado</TableHead>
                    <TableHead className="font-bold">CURP</TableHead>
                    <TableHead className="text-right font-bold">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{user.nombre} {user.apellidos}</span>
                          <span className="text-[10px] text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-[10px] font-bold">
                          {user.rol}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={user.estatus === 'activo' ? 'default' : 'secondary'}
                          className="text-[10px] px-2 h-5"
                        >
                          {user.estatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground tracking-tighter">
                        {user.curp}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleEdit(user)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(user.id)}
                          >
                            <Trash2 size={16} />
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
