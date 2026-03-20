"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, UserRole, UserEstatus } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const userSchema = z.object({
  nombre: z.string().min(2, "El nombre es muy corto"),
  apellidos: z.string().min(2, "Los apellidos son muy cortos"),
  email: z.string().email("Email inválido"),
  curp: z.string().length(18, "La CURP debe tener 18 caracteres"),
  rol: z.enum(['superuser', 'admin', 'profesor', 'alumno']),
  estatus: z.enum(['activo', 'inactivo', 'suspendido']),
  telefono: z.string().optional(),
  matricula: z.string().optional(),
  numero_empleado: z.string().optional(),
  fecha_expiracion: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserDialogProps {
  user?: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UserDialog({ user, open, onOpenChange, onSuccess }: UserDialogProps) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = React.useState(false);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      nombre: '',
      apellidos: '',
      email: '',
      curp: '',
      rol: 'alumno',
      estatus: 'activo',
      telefono: '',
      matricula: '',
      numero_empleado: '',
      fecha_expiracion: '',
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        nombre: user.nombre || '',
        apellidos: user.apellidos || '',
        email: user.email || '',
        curp: user.curp || '',
        rol: user.rol || 'alumno',
        estatus: user.estatus || 'activo',
        telefono: user.telefono || '',
        matricula: user.matricula || '',
        numero_empleado: user.numero_empleado || '',
        fecha_expiracion: user.fecha_expiracion || '',
      });
    } else {
      form.reset({
        nombre: '',
        apellidos: '',
        email: '',
        curp: '',
        rol: 'alumno',
        estatus: 'activo',
        telefono: '',
        matricula: '',
        numero_empleado: '',
        fecha_expiracion: '',
      });
    }
  }, [user, form]);

  const onSubmit = async (values: UserFormValues) => {
    setLoading(true);
    try {
      if (user) {
        // Editar Usuario
        const { error } = await supabase
          .from('profiles')
          .update(values)
          .eq('id', user.id);

        if (error) throw error;
        toast({ title: "Usuario Actualizado", description: "Los cambios se guardaron correctamente." });
      } else {
        // Crear Usuario (Solo perfil por ahora, en un sistema real esto requiere Auth Admin)
        // Simulamos la creación generando un ID único para el perfil
        const { error } = await supabase
          .from('profiles')
          .insert([{ ...values, id: crypto.randomUUID() }]);

        if (error) throw error;
        toast({ title: "Usuario Creado", description: "El perfil ha sido registrado en la base de datos." });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: error.message || "No se pudo procesar la solicitud." 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? 'Editar Usuario' : 'Registrar Nuevo Usuario'}</DialogTitle>
          <DialogDescription>
            Completa los datos del perfil académico. La información se guardará en la tabla de perfiles.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre(s)</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apellidos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellidos</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="curp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CURP</FormLabel>
                    <FormControl><Input className="uppercase" {...field} maxLength={18} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol de Usuario</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="alumno">Alumno</SelectItem>
                        <SelectItem value="profesor">Profesor</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="superuser">Superusuario</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estatus</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona estatus" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
                        <SelectItem value="suspendido">Suspendido</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fecha_expiracion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Expiración</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telefono"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.watch('rol') === 'alumno' && (
                <FormField
                  control={form.control}
                  name="matricula"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matrícula</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {form.watch('rol') === 'profesor' && (
                <FormField
                  control={form.control}
                  name="numero_empleado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Empleado</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {user ? 'Guardar Cambios' : 'Crear Usuario'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
