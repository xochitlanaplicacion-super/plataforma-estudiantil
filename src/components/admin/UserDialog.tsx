
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, RefreshCw, Key, Eye, EyeOff, Mail } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createUserWithProfile, updateUserProfile, resendWelcomeEmailAction } from '@/lib/actions/users';
import { createClient } from '@/lib/supabase/client';

const userSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  apellidos: z.string().min(2, "Los apellidos son obligatorios"),
  email: z.string().email("Email inválido"),
  curp: z.string().min(10, "CURP incompleta").max(18, "Máximo 18 caracteres"),
  rol: z.enum(['superuser', 'admin', 'profesor', 'alumno']),
  estatus: z.enum(['activo', 'inactivo', 'suspendido']),
  telefono: z.string().optional().or(z.literal('')),
  matricula: z.string().optional().or(z.literal('')),
  numero_empleado: z.string().optional().or(z.literal('')),
  fecha_expiracion: z.string().optional().or(z.literal('')),
  fecha_nacimiento: z.string().optional().or(z.literal('')),
  nivel_estudios: z.string().optional().or(z.literal('')),
  password: z.string().min(8, "Mínimo 8 caracteres").optional().or(z.literal('')),
  doc_acta_nacimiento: z.boolean().default(false),
  doc_certificado_estudios: z.boolean().default(false),
  doc_curp: z.boolean().default(false),
  doc_ine: z.boolean().default(false),
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
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      fecha_nacimiento: '',
      nivel_estudios: '',
      password: '',
      doc_acta_nacimiento: false,
      doc_certificado_estudios: false,
      doc_curp: false,
      doc_ine: false,
    },
  });

  const generatePassword = useCallback(() => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
    let retVal = "";
    for (let i = 0, n = charset.length; i < 10; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    form.setValue('password', retVal);
  }, [form]);

  const generateMatricula = async (nivel: string) => {
    if (!nivel || user) return;
    
    setIsGenerating(true);
    try {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);
      
      let suffix = "";
      if (nivel === 'universidad') suffix = "UNI";
      else if (nivel === 'bachillerato') suffix = "BAC";
      else if (nivel === 'capacitacion') suffix = "CAP";

      const { data: profiles } = await supabase
        .from('profiles')
        .select('matricula')
        .like('matricula', `%${suffix}`)
        .order('matricula', { ascending: false })
        .limit(1);

      let nextNumber = 1;
      if (profiles && profiles.length > 0) {
        const lastMat = profiles[0].matricula;
        const match = lastMat.match(/IEZPTA\d{4}(\d{6})/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const sequential = String(nextNumber).padStart(6, '0');
      const finalMatricula = `IEZPTA${month}${year}${sequential}${suffix}`;
      form.setValue('matricula', finalMatricula);
    } catch (err) {
      console.error("Error generating matricula:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResendEmail = async () => {
    if (!user) return;
    setResending(true);
    try {
      const result = await resendWelcomeEmailAction(user.id);
      if (result.success) {
        toast({ title: "Correo Reenviado", description: "Las credenciales han sido enviadas exitosamente." });
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo reenviar el correo." });
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    if (open) {
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
          fecha_nacimiento: user.fecha_nacimiento || '',
          password: user.password_plain || '',
          doc_acta_nacimiento: user.doc_acta_nacimiento || false,
          doc_certificado_estudios: user.doc_certificado_estudios || false,
          doc_curp: user.doc_curp || false,
          doc_ine: user.doc_ine || false,
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
          fecha_nacimiento: '',
          nivel_estudios: '',
          password: '',
          doc_acta_nacimiento: false,
          doc_certificado_estudios: false,
          doc_curp: false,
          doc_ine: false,
        });
        generatePassword();
      }
    }
  }, [user, form, open, generatePassword]);

  const onSubmit = async (values: UserFormValues) => {
    setLoading(true);
    setDbError(null);
    try {
      let result;
      if (user) {
        result = await updateUserProfile(user.id, values);
      } else {
        result = await createUserWithProfile(values);
      }

      if (result.success) {
        toast({ 
          title: user ? "Usuario Actualizado" : "Usuario Creado", 
          description: user ? "Los cambios se guardaron correctamente." : `Registro exitoso. Matrícula: ${values.matricula}` 
        });
        onSuccess();
        onOpenChange(false);
      } else {
        setDbError(result.error || "Ocurrió un error inesperado.");
      }
    } catch (error: any) {
      setDbError(error.message || "Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle>{user ? 'Editar Perfil Académico' : 'Registrar Nuevo Perfil'}</DialogTitle>
              <DialogDescription>
                Completa los datos del usuario y controla la entrega de documentación.
              </DialogDescription>
            </div>
            {user && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 text-primary border-primary hover:bg-primary/5"
                onClick={handleResendEmail}
                disabled={resending}
              >
                {resending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Reenviar Datos
              </Button>
            )}
          </div>
        </DialogHeader>

        {dbError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error en la operación</AlertTitle>
            <AlertDescription className="text-xs font-semibold">{dbError}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-4 md:col-span-2">
                <h4 className="text-sm font-bold text-primary/70 uppercase tracking-wider border-b pb-1">
                  Información Personal
                </h4>
              </div>
              
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre(s) *</FormLabel>
                    <FormControl><Input placeholder="Ej. María Elena" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apellidos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellidos *</FormLabel>
                    <FormControl><Input placeholder="Ej. Sánchez Méndez" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico *</FormLabel>
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
                    <FormLabel>CURP *</FormLabel>
                    <FormControl>
                      <Input 
                        className="uppercase font-mono" 
                        {...field} 
                        placeholder="18 CARACTERES" 
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fecha_nacimiento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Nacimiento</FormLabel>
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
              
              <div className="space-y-4 md:col-span-2 mt-4">
                <h4 className="text-sm font-bold text-primary/70 uppercase tracking-wider border-b pb-1">
                  Acceso y Seguridad
                </h4>
              </div>

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex justify-between items-center">
                      Contraseña de Acceso
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-[10px] gap-1"
                        onClick={generatePassword}
                      >
                        <RefreshCw size={10} /> {user ? 'Nueva' : 'Regenerar'}
                      </Button>
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input 
                          {...field} 
                          type={showPassword ? "text" : "password"}
                          placeholder="Contraseña del usuario" 
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-muted-foreground hover:text-primary transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol de Usuario *</FormLabel>
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
                    <FormLabel>Estatus *</FormLabel>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 bg-muted/30 p-6 rounded-xl border border-dashed border-primary/20">
                <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                  Control de Documentación
                </h4>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="doc_acta_nacimiento"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2 border rounded hover:bg-white transition-colors">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">Acta de Nacimiento</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="doc_certificado_estudios"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2 border rounded hover:bg-white transition-colors">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">Certificado de Estudios</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="doc_curp"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2 border rounded hover:bg-white transition-colors">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">CURP</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="doc_ine"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2 border rounded hover:bg-white transition-colors">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">INE</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4 bg-muted/30 p-6 rounded-xl border border-dashed border-primary/20">
                <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                  Identificación Académica
                </h4>
                
                <div className="space-y-4">
                  {form.watch('rol') === 'alumno' && (
                    <>
                      <FormField
                        control={form.control}
                        name="nivel_estudios"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nivel de Estudios a Estudiar *</FormLabel>
                            <Select 
                              onValueChange={(val) => {
                                field.onChange(val);
                                generateMatricula(val);
                              }} 
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona nivel" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="bachillerato">Bachillerato</SelectItem>
                                <SelectItem value="universidad">Universidad</SelectItem>
                                <SelectItem value="capacitacion">Capacitaciones</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="matricula"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex justify-between">
                              Matrícula {user ? 'Actual' : 'Sugerida'}
                              {isGenerating && <Loader2 size={12} className="animate-spin" />}
                            </FormLabel>
                            <FormControl><Input placeholder="IEZPTA..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                  
                  {(form.watch('rol') === 'profesor' || form.watch('rol') === 'admin' || form.watch('rol') === 'superuser') && (
                    <FormField
                      control={form.control}
                      name="numero_empleado"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número de Empleado / Cédula</FormLabel>
                          <FormControl><Input placeholder="Cédula interna" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary min-w-[140px]">
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
                ) : (
                  user ? 'Guardar Cambios' : 'Crear Registro Efectivo'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
