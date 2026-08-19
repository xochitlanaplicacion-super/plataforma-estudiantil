
"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Loader2, AlertCircle, RefreshCw, Eye, EyeOff, Sparkles, Mail, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createUserWithProfile, updateUserProfile, resendWelcomeEmailAction } from '@/lib/actions/users';
import { getPublicCareers, getPublicLevels } from '@/lib/actions/aspirantes';
import { createClient } from '@/lib/supabase/client';
import { useInstitucion } from '@/hooks/use-institucion';

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
  password: z.string().min(8, "La contraseña es obligatoria (mínimo 8 caracteres)"),
  genero: z.string().optional().or(z.literal('')),
  doc_acta_nacimiento: z.boolean().default(false),
  doc_certificado_estudios: z.boolean().default(false),
  doc_curp: z.boolean().default(false),
  doc_ine: z.boolean().default(false),
}).refine((data) => {
  if (data.rol === 'alumno' && !data.fecha_expiracion) return false;
  return true;
}, {
  message: "La vigencia (fecha de expiración) es obligatoria para Alumnos.",
  path: ["fecha_expiracion"],
}).refine((data) => {
  if (data.rol !== 'superuser' && (!data.genero || data.genero.trim() === '')) return false;
  return true;
}, {
  message: "El género es obligatorio para este rol",
  path: ["genero"],
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserDialogProps {
  user?: User | null;
  prefillAspirante?: Aspirante | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  totalProfesores?: number;
  profesorLimit?: number;
}

export function UserDialog({ user, prefillAspirante, open, onOpenChange, onSuccess, totalProfesores = 0, profesorLimit = 15 }: UserDialogProps) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPassword, setShowPassword] = useState(true);
  const [allCareers, setAllCareers] = useState<any[]>([]);
  const [allLevels, setAllLevels] = useState<any[]>([]);
  const { config: inst } = useInstitucion();

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
      genero: '',
      doc_acta_nacimiento: false,
      doc_certificado_estudios: false,
      doc_curp: false,
      doc_ine: false,
    },
  });

  const nivelEstudios = form.watch('nivel_estudios');
  const watchedRol = form.watch('rol');

  // Bloquear registro si es profesor nuevo y se alcanzó el límite
  const isProfesorLimitReached = !user && watchedRol === 'profesor' && totalProfesores >= profesorLimit;

  // Color primario de la institucion para el banner de error
  const primaryColor = inst?.color_primario || '#7f1d1d';



  const filteredCareers = useMemo(() => {
    if (!nivelEstudios) return [];
    return allCareers.filter(c => c.niveles?.id === nivelEstudios);
  }, [allCareers, nivelEstudios]);

  const generatePassword = useCallback(() => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
    let retVal = "";
    for (let i = 0, n = charset.length; i < 10; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    form.setValue('password', retVal);
  }, [form]);

  const handleResendEmail = async () => {
    if (!user?.id) return;
    setSendingEmail(true);
    try {
      const res = await resendWelcomeEmailAction(user.id);
      if (res.success) {
        toast({ title: "Correo Enviado", description: "Las credenciales han sido enviadas al alumno." });
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo enviar el correo." });
    } finally {
      setSendingEmail(false);
    }
  };

  const generateMatricula = async (nivelId: string) => {
    if (!nivelId) return;
    setIsGenerating(true);
    try {
      const level = allLevels.find(l => l.id === nivelId);
      if (!level) return;

      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);
      
      const prefix = inst?.codigo_matricula || 'XXXXXX';
      const suffix = level.nombre.substring(0, 3).toUpperCase();
      
      const { data } = await supabase
        .from('profiles')
        .select('matricula')
        .like('matricula', `%${suffix}`)
        .order('matricula', { ascending: false })
        .limit(1);

      let nextNumber = 1;
      if (data && data.length > 0 && data[0].matricula) {
        const regex = new RegExp(`(\\d{6})${suffix}$`);
        const match = data[0].matricula.match(regex);
        if (match) nextNumber = parseInt(match[1]) + 1;
      }
      const sequential = String(nextNumber).padStart(6, '0');
      form.setValue('matricula', `${prefix}${month}${year}${sequential}${suffix}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      const [careersRes, levelsRes] = await Promise.all([
        getPublicCareers(),
        getPublicLevels(),
      ]);
      if (careersRes.success && careersRes.data) setAllCareers(careersRes.data);
      if (levelsRes.success && levelsRes.data) setAllLevels(levelsRes.data);
    }
    loadData();
  }, []);

  useEffect(() => {
    if (open) {
      setDbError(null);
      if (user) {
        setShowPassword(true);
        // Find level id based on carrera_id to pre-fill nivel_estudios
        let detectLevel = '';
        if (user.carrera_id && allCareers.length > 0) {
          const carrera = allCareers.find(c => c.id === user.carrera_id);
          if (carrera && carrera.niveles?.id) {
            detectLevel = carrera.niveles.id;
          }
        }
        
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
          nivel_estudios: detectLevel,
          carrera_id: user.carrera_id || '',
          password: '',
          genero: user.genero || '',
          doc_acta_nacimiento: !!user.doc_acta_nacimiento,
          doc_certificado_estudios: !!user.doc_certificado_estudios,
          doc_curp: !!user.doc_curp,
          doc_ine: !!user.doc_ine,
        });
      } else if (prefillAspirante) {
        setShowPassword(true);
        // Resolve aspirante's nivel (text name) to level UUID
        let resolvedNivelId = '';
        if (prefillAspirante.nivel && allLevels.length > 0) {
          const match = allLevels.find(l =>
            l.nombre.toLowerCase() === prefillAspirante.nivel.toLowerCase()
          );
          resolvedNivelId = match?.id || '';
        }
        form.reset({
          nombre: prefillAspirante.nombre || '',
          apellidos: prefillAspirante.apellidos || '',
          email: prefillAspirante.email || '',
          curp: prefillAspirante.curp || '',
          rol: 'alumno',
          estatus: 'activo',
          telefono: prefillAspirante.telefono || '',
          nivel_estudios: resolvedNivelId,
          carrera_id: prefillAspirante.carrera_id || '',
          matricula: '',
          numero_empleado: '',
          fecha_expiracion: '',
          fecha_nacimiento: prefillAspirante.fecha_nacimiento || '',
          password: '',
          genero: prefillAspirante.genero || '',
          doc_acta_nacimiento: false,
          doc_certificado_estudios: false,
          doc_curp: false,
          doc_ine: false,
        });
        generatePassword();
        if (resolvedNivelId) generateMatricula(resolvedNivelId);
      } else {
        setShowPassword(true);
        form.reset({
          nombre: '', apellidos: '', email: '', curp: '', rol: 'alumno', estatus: 'activo',
          telefono: '', matricula: '', numero_empleado: '', fecha_expiracion: '',
          fecha_nacimiento: '', nivel_estudios: '', carrera_id: '', password: '', genero: '',
          doc_acta_nacimiento: false, doc_certificado_estudios: false, doc_curp: false, doc_ine: false,
        });
        generatePassword();
      }
    }
  }, [user, prefillAspirante, open, generatePassword, allLevels]);

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
        if (result.warning) {
          toast({ 
            title: user ? "Perfil Actualizado" : "Alumno Inscrito", 
            description: result.warning,
            variant: "destructive",
            duration: 8000
          });
        } else {
          toast({ title: user ? "Actualizado" : "Inscrito", description: "Operación exitosa." });
        }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start w-full pr-8">
            <div>
              <DialogTitle>
                {user ? 'Editar Perfil Académico' : prefillAspirante ? 'Inscribir Alumno (Desde Preregistro)' : 'Registrar Nuevo Perfil'}
              </DialogTitle>
              <DialogDescription>
                Completa los datos y controla la vigencia del acceso. La contraseña nunca debe estar vacía.
              </DialogDescription>
            </div>
            {user && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="gap-2 border-primary text-primary hover:bg-primary/10 shadow-sm"
                onClick={handleResendEmail}
                disabled={sendingEmail}
              >
                {sendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Reenviar Acceso
              </Button>
            )}
          </div>
        </DialogHeader>

        {dbError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs font-semibold">{dbError}</AlertDescription>
          </Alert>
        )}

        {/* Banner de límite de profesores */}
        {isProfesorLimitReached && (
          <div
            className="flex items-start gap-3 rounded-xl border-2 p-4 mb-4"
            style={{
              borderColor: primaryColor,
              backgroundColor: `${primaryColor}18`,
              color: primaryColor,
            }}
          >
            <ShieldAlert size={22} className="mt-0.5 flex-shrink-0" style={{ color: primaryColor }} />
            <div className="flex flex-col gap-1">
              <p className="font-bold text-sm" style={{ color: primaryColor }}>
                ⛔ Límite de la Plataforma Alcanzado
              </p>
              <p className="text-xs leading-relaxed" style={{ color: primaryColor }}>
                Ya tienes <strong>{totalProfesores}</strong> profesores registrados en el sistema ({profesorLimit}/{profesorLimit} del plan actual).
                Para registrar al profesor número <strong>{profesorLimit + 1}</strong>, debes:
              </p>
              <ul className="text-xs mt-1 space-y-1 list-disc list-inside" style={{ color: primaryColor }}>
                <li>Eliminar o desactivar a los profesores inactivos que ya no utilicen la plataforma.</li>
                <li>Solicitar un incremento de cuota en tu plan de plantilla institucional.</li>
              </ul>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-2">
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
                <FormItem><FormLabel>Correo Electrónico *</FormLabel><FormControl><Input type="email" placeholder="correo@ejemplo.com" {...field} /></FormControl><FormMessage /></FormItem>
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
              <FormField control={form.control} name="genero" render={({ field }) => (
                <FormItem>
                  <FormLabel>Género {form.watch('rol') !== 'superuser' && '*'}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Hombre">Hombre</SelectItem>
                      <SelectItem value="Mujer">Mujer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              
              <div className="space-y-4 md:col-span-2 mt-4">
                <h4 className="text-sm font-bold text-primary/70 uppercase tracking-wider border-b pb-1">Acceso y Seguridad</h4>
              </div>

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex justify-between items-center text-destructive font-bold">
                    Contraseña de Acceso *
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={generatePassword}>
                      <RefreshCw size={10} /> Regenerar
                    </Button>
                  </FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input 
                        {...field} 
                        type={showPassword ? "text" : "password"} 
                        placeholder="Contraseña" 
                        className="pr-10 border-destructive/30 focus:ring-destructive/20"
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
              )} />

              <FormField control={form.control} name="rol" render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="alumno">Alumno</SelectItem>
                      <SelectItem value="profesor">Profesor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />

              <FormField control={form.control} name="fecha_expiracion" render={({ field }) => (
                <FormItem>
                  <FormLabel className={form.watch('rol') === 'alumno' ? "text-destructive font-bold" : ""}>
                    Fecha de Expiración (Acceso) {form.watch('rol') === 'alumno' && " *"}
                  </FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  {form.watch('rol') !== 'alumno' && (
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">
                      Este campo es opcional y puede quedar vacío
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="estatus" render={({ field }) => (
                <FormItem><FormLabel>Estatus *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="activo">Activo</SelectItem><SelectItem value="inactivo">Inactivo</SelectItem></SelectContent></Select>
                </FormItem>
              )} />
            </div>

            {form.watch('rol') === 'alumno' && (
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
                      <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elegir Nivel" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {allLevels.map(lvl => (
                          <SelectItem key={lvl.id} value={lvl.id}>{lvl.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                {filteredCareers.length > 0 && (
                  <FormField control={form.control} name="carrera_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-primary">Programa o Especialidad *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {filteredCareers.map((c) => (
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
            )}

            <DialogFooter className="gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button 
                type="submit" 
                disabled={loading || isProfesorLimitReached} 
                className="bg-primary px-8"
                title={isProfesorLimitReached ? `Límite de ${profesorLimit} profesores alcanzado` : undefined}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : user ? 'Guardar Cambios' : 'Confirmar Inscripción'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
