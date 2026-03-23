
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
import { User, Aspirante } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, RefreshCw, Eye, EyeOff, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createUserWithProfile, updateUserProfile } from '@/lib/actions/users';
import { getPublicCareers } from '@/lib/actions/aspirantes';
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
  carrera_id: z.string().optional().or(z.literal('')),
  password: z.string().min(8, "Mínimo 8 caracteres").optional().or(z.literal('')),
  doc_acta_nacimiento: z.boolean().default(false),
  doc_certificado_estudios: z.boolean().default(false),
  doc_curp: z.boolean().default(false),
  doc_ine: z.boolean().default(false),
}).refine((data) => {
  if (data.rol === 'alumno' && !data.fecha_expiracion) {
    return false;
  }
  return true;
}, {
  message: "La vigencia (fecha de expiración) es obligatoria para Alumnos.",
  path: ["fecha_expiracion"],
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserDialogProps {
  user?: User | null;
  prefillAspirante?: Aspirante | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UserDialog({ user, prefillAspirante, open, onOpenChange, onSuccess }: UserDialogProps) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [careers, setCareers] = useState<{id: string, nombre: string}[]>([]);

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
      carrera_id: '',
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
      let suffix = nivel === 'universidad' ? "UNI" : nivel === 'bachillerato' ? "BAC" : "CAP";
      const { data } = await supabase.from('profiles').select('matricula').like('matricula', `%${suffix}`).order('matricula', { ascending: false }).limit(1);
      let nextNumber = 1;
      if (data && data.length > 0) {
        const match = data[0].matricula.match(/IEZPTA\d{4}(\d{6})/);
        if (match) nextNumber = parseInt(match[1]) + 1;
      }
      const sequential = String(nextNumber).padStart(6, '0');
      form.setValue('matricula', `IEZPTA${month}${year}${sequential}${suffix}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    async function loadCareers() {
      const res = await getPublicCareers();
      if (res.success && res.data) setCareers(res.data);
    }
    loadCareers();
  }, []);

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
          nivel_estudios: user.matricula?.endsWith('UNI') ? 'universidad' : user.matricula?.endsWith('BAC') ? 'bachillerato' : 'capacitacion',
          carrera_id: user.carrera_id || '',
          password: user.password_plain || '',
          doc_acta_nacimiento: !!user.doc_acta_nacimiento,
          doc_certificado_estudios: !!user.doc_certificado_estudios,
          doc_curp: !!user.doc_curp,
          doc_ine: !!user.doc_ine,
        });
      } else if (prefillAspirante) {
        form.reset({
          nombre: prefillAspirante.nombre || '',
          apellidos: prefillAspirante.apellidos || '',
          email: prefillAspirante.email || '',
          curp: prefillAspirante.curp || '',
          rol: 'alumno',
          estatus: 'activo',
          telefono: prefillAspirante.telefono || '',
          nivel_estudios: prefillAspirante.nivel || '',
          carrera_id: prefillAspirante.carrera_id || '',
          matricula: '',
          numero_empleado: '',
          fecha_expiracion: '',
          fecha_nacimiento: prefillAspirante.fecha_nacimiento || '',
          password: '',
          doc_acta_nacimiento: false,
          doc_certificado_estudios: false,
          doc_curp: false,
          doc_ine: false,
        });
        generatePassword();
        if (prefillAspirante.nivel) generateMatricula(prefillAspirante.nivel);
      } else {
        form.reset({
          nombre: '', apellidos: '', email: '', curp: '', rol: 'alumno', estatus: 'activo',
          telefono: '', matricula: '', numero_empleado: '', fecha_expiracion: '',
          fecha_nacimiento: '', nivel_estudios: '', carrera_id: '', password: '',
          doc_acta_nacimiento: false, doc_certificado_estudios: false, doc_curp: false, doc_ine: false,
        });
        generatePassword();
      }
    }
  }, [user, prefillAspirante, open, generatePassword]);

  const onSubmit = async (values: UserFormValues) => {
    setLoading(true);
    setDbError(null);
    try {
      let result;
      if (user) {
        result = await updateUserProfile(user.id, values);
      } else {
        result = await createUserWithProfile(values, prefillAspirante?.id);
      }

      if (result.success) {
        toast({ title: user ? "Actualizado" : "Inscrito", description: "Operación exitosa." });
        onSuccess();
        onOpenChange(false);
      } else {
        setDbError(result.error);
      }
    } catch (error: any) {
      setDbError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const onInvalid = (errors: any) => {
    if (errors.fecha_expiracion) {
      toast({
        variant: "destructive",
        title: "Dato Obligatorio Faltante",
        description: "Para dar de alta a un ALUMNO, es necesario definir la Fecha de Expiración."
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle>
                {user ? 'Editar Perfil Académico' : prefillAspirante ? 'Inscribir Alumno (Desde Preregistro)' : 'Registrar Nuevo Perfil'}
              </DialogTitle>
              <DialogDescription>
                Completa los datos y controla la vigencia.
              </DialogDescription>
            </div>
            {prefillAspirante && <Sparkles className="text-amber-500 animate-pulse" />}
          </div>
        </DialogHeader>

        {dbError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs font-semibold">{dbError}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-4 md:col-span-2">
                <h4 className="text-sm font-bold text-primary/70 uppercase tracking-wider border-b pb-1">Información Personal</h4>
              </div>
              
              <FormField control={form.control} name="nombre" render={({ field }) => (
                <FormItem><FormLabel>Nombre(s) *</FormLabel><FormControl><Input placeholder="Ej. María Elena" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="apellidos" render={({ field }) => (
                <FormItem><FormLabel>Apellidos *</FormLabel><FormControl><Input placeholder="Ej. Sánchez Méndez" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Correo Electrónico *</FormLabel><FormControl><Input type="email" placeholder="correo@ejemplo.com" {...field} disabled={!!user || !!prefillAspirante} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="curp" render={({ field }) => (
                <FormItem><FormLabel>CURP *</FormLabel><FormControl><Input className="uppercase font-mono" {...field} placeholder="18 CARACTERES" onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="fecha_nacimiento" render={({ field }) => (
                <FormItem><FormLabel>Fecha de Nacimiento</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="telefono" render={({ field }) => (
                <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input placeholder="10 dígitos" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              
              <div className="space-y-4 md:col-span-2 mt-4">
                <h4 className="text-sm font-bold text-primary/70 uppercase tracking-wider border-b pb-1">Acceso y Seguridad</h4>
              </div>

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex justify-between items-center">Contraseña de Acceso <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={generatePassword}><RefreshCw size={10} /> Regenerar</Button></FormLabel>
                  <div className="relative">
                    <FormControl><Input {...field} type={showPassword ? "text" : "password"} placeholder="Contraseña" /></FormControl>
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-muted-foreground"><Eye size={16} /></button>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="rol" render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!!prefillAspirante}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="alumno">Alumno</SelectItem><SelectItem value="profesor">Professor</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent>
                  </Select>
                </FormItem>
              )} />

              <FormField control={form.control} name="fecha_expiracion" render={({ field }) => (
                <FormItem>
                  <FormLabel className={form.watch('rol') === 'alumno' ? "text-destructive font-bold" : ""}>
                    Fecha de Expiración (Acceso) {form.watch('rol') === 'alumno' && " *"}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      {...field} 
                      className={form.formState.errors.fecha_expiracion ? "border-destructive ring-destructive" : ""}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="estatus" render={({ field }) => (
                <FormItem><FormLabel>Estatus *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="activo">Activo</SelectItem><SelectItem value="inactivo">Inactivo</SelectItem></SelectContent></Select>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-dashed border-primary/20">
                <h4 className="text-xs font-bold text-primary uppercase">Documentación Entregada</h4>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="doc_acta_nacimiento" render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0 p-2 border rounded bg-white"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-[10px] cursor-pointer">Acta Nac.</FormLabel></FormItem>
                  )} />
                  <FormField control={form.control} name="doc_certificado_estudios" render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0 p-2 border rounded bg-white"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-[10px] cursor-pointer">Certificado</FormLabel></FormItem>
                  )} />
                  <FormField control={form.control} name="doc_curp" render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0 p-2 border rounded bg-white"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-[10px] cursor-pointer">CURP</FormLabel></FormItem>
                  )} />
                  <FormField control={form.control} name="doc_ine" render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0 p-2 border rounded bg-white"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-[10px] cursor-pointer">INE</FormLabel></FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-dashed border-primary/20">
                <h4 className="text-xs font-bold text-primary uppercase">Identificación Académica</h4>
                <FormField control={form.control} name="nivel_estudios" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Nivel</FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); generateMatricula(val); }} value={field.value}>
                      <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="bachillerato">Bachillerato</SelectItem>
                        <SelectItem value="universidad">Universidad</SelectItem>
                        <SelectItem value="capacitacion">Capacitaciones</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                {form.watch('nivel_estudios') === 'universidad' && (
                  <FormField control={form.control} name="carrera_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-primary">Carrera Universitaria *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elegir Carrera" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {careers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                )}

                <FormField control={form.control} name="matricula" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Matrícula {isGenerating && <Loader2 size={10} className="animate-spin inline" />}</FormLabel><FormControl><Input className="h-8 text-xs font-mono" {...field} /></FormControl></FormItem>
                )} />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading} className="bg-primary px-8">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : user ? 'Guardar Cambios' : 'Confirmar Inscripción'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
