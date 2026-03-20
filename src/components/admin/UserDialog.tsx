"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/select';
import { User } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  const [dbError, setDbError] = React.useState<string | null>(null);

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
    setDbError(null);
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
  }, [user, form, open]);

  const onSubmit = async (values: UserFormValues) => {
    setLoading(true);
    setDbError(null);
    try {
      if (user) {
        // ACTUALIZAR PERFIL
        const { error } = await supabase
          .from('profiles')
          .update(values)
          .eq('id', user.id);

        if (error) throw error;
        
        toast({ title: "Usuario Actualizado", description: "Los cambios se guardaron correctamente." });
        onSuccess();
        onOpenChange(false);
      } else {
        // CREAR NUEVO PERFIL
        // Nota: Si la tabla profiles tiene una FK a auth.users, esta inserción fallará 
        // a menos que el usuario se cree primero en Auth.
        const { error } = await supabase
          .from('profiles')
          .insert([{ 
            ...values,
            // Si el ID es requerido y no hay default en la DB, generamos uno temporal
            // pero lo ideal es que la DB tenga gen_random_uuid() por defecto.
          }]);

        if (error) {
          // Capturamos el error específico de FK si ocurre
          if (error.code === '23503') {
            setDbError("No se puede crear el perfil: El usuario debe estar registrado primero en el sistema de Autenticación de Supabase.");
          } else {
            setDbError(error.message || "Error al insertar en la base de datos.");
          }
          console.error("Detalles del error de Supabase:", error);
          return;
        }

        toast({ title: "Usuario Creado", description: "El perfil ha sido registrado con éxito." });
        onSuccess();
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error("Error en la operación:", error);
      setDbError(error.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? 'Editar Perfil Académico' : 'Registrar Nuevo Perfil'}</DialogTitle>
          <DialogDescription>
            {user 
              ? 'Modifica los datos del usuario. Los cambios se sincronizarán inmediatamente.' 
              : 'Completa los datos para el nuevo registro académico.'}
          </DialogDescription>
        </DialogHeader>

        {dbError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error del Sistema</AlertTitle>
            <AlertDescription className="text-xs">
              {dbError}
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre(s)</FormLabel>
                    <FormControl><Input placeholder="Ej. Jose Luis" {...field} /></FormControl>
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
                    <FormControl><Input placeholder="Ej. Flores Bautista" {...field} /></FormControl>
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
                    <FormControl><Input type="email" placeholder="correo@ejemplo.com" {...field} disabled={!!user} /></FormControl>
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
                    <FormControl><Input className="uppercase font-mono" {...field} maxLength={18} placeholder="18 caracteres" /></FormControl>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <FormControl><Input placeholder="10 dígitos" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
              {form.watch('rol') === 'alumno' && (
                <FormField
                  control={form.control}
                  name="matricula"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matrícula / ID Alumno</FormLabel>
                      <FormControl><Input placeholder="Código único" {...field} /></FormControl>
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
                      <FormControl><Input placeholder="Cédula interna" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter className="gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary min-w-[140px]">
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
                ) : (
                  user ? 'Guardar Cambios' : 'Crear Registro'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
