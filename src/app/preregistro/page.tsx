
"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createAspiranteRecord, getPublicCareers } from '@/lib/actions/aspirantes';
import Link from 'next/link';

const preregistroSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  apellidos: z.string().min(2, "Los apellidos son obligatorios"),
  email: z.string().email("Correo electrónico inválido"),
  curp: z.string().length(18, "La CURP debe tener exactamente 18 caracteres"),
  telefono: z.string().min(10, "El teléfono debe tener al menos 10 dígitos"),
  nivel: z.string().min(1, "Selecciona un nivel educativo"),
  carrera_id: z.string().optional(),
}).refine((data) => {
  if (data.nivel === 'universidad' && !data.carrera_id) {
    return false;
  }
  return true;
}, {
  message: "Debes seleccionar una carrera para el nivel universidad",
  path: ["carrera_id"],
});

type PreregistroValues = z.infer<typeof preregistroSchema>;

export default function PreregistroPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [careers, setCareers] = useState<{id: string, nombre: string}[]>([]);

  const form = useForm<PreregistroValues>({
    resolver: zodResolver(preregistroSchema),
    defaultValues: {
      nombre: '',
      apellidos: '',
      email: '',
      curp: '',
      telefono: '',
      nivel: '',
      carrera_id: '',
    },
  });

  const nivelWatch = form.watch('nivel');

  useEffect(() => {
    async function loadCareers() {
      const result = await getPublicCareers();
      if (result.success && result.data) {
        setCareers(result.data);
      }
    }
    loadCareers();
  }, []);

  const onSubmit = async (values: PreregistroValues) => {
    setLoading(true);
    try {
      const result = await createAspiranteRecord(values);
      if (result.success) {
        setSuccess(true);
        toast({ title: "Preregistro Exitoso", description: "Tus datos han sido enviados correctamente." });
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Ocurrió un error inesperado." });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8 border-primary/20 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <CheckCircle2 size={48} />
            </div>
          </div>
          <CardHeader className="p-0">
            <CardTitle className="text-2xl font-bold font-headline">¡Solicitud Enviada!</CardTitle>
            <CardDescription className="text-base mt-2">
              Gracias por tu interés en el Instituto Educativo Emiliano Zapata.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-6 p-0 text-muted-foreground text-sm">
            <p>Hemos recibido tus datos correctamente. El departamento de servicios escolares se pondrá en contacto contigo pronto a través de tu correo electrónico o teléfono.</p>
          </CardContent>
          <CardFooter className="mt-8 p-0">
            <Link href="/" className="w-full">
              <Button className="w-full bg-primary">Volver al Inicio</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-primary text-white p-6 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <img src="/images/logo_zapata.png" alt="Logo" className="h-24 w-auto drop-shadow-lg" />
            <h1 className="text-2xl font-bold font-headline hidden md:block">Instituto Educativo Emiliano Zapata</h1>
          </div>
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 gap-2 font-bold">
              <ArrowLeft size={18} /> Volver
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-6 md:py-12">
        <Card className="shadow-2xl border-muted">
          <CardHeader className="text-center space-y-4 pb-8">
            <CardTitle className="text-4xl font-bold font-headline text-primary">Preregistro de Aspirantes</CardTitle>
            <CardDescription className="text-lg">Completa todos los campos para iniciar tu proceso de inscripción.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Nombre(s) *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ. MARÍA ELENA" 
                            className="uppercase h-12" 
                            {...field} 
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="apellidos"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Apellidos *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="EJ. SÁNCHEZ PÉREZ" 
                            className="uppercase h-12" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Correo Electrónico *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="ejemplo@correo.com" className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="curp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">CURP *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="18 CARACTERES" 
                            className="uppercase font-mono h-12" 
                            maxLength={18} 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telefono"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Teléfono Celular *</FormLabel>
                        <FormControl>
                          <Input placeholder="10 DÍGITOS" maxLength={10} className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nivel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Nivel Educativo de Interés *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12">
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

                  {nivelWatch === 'universidad' && (
                    <FormField
                      control={form.control}
                      name="carrera_id"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="text-base">Carrera a la que Aspiras *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-12">
                                <SelectValue placeholder="Selecciona una carrera" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {careers.map((career) => (
                                <SelectItem key={career.id} value={career.id}>
                                  {career.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="pt-6">
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-xl font-bold bg-primary shadow-xl hover:opacity-90 transition-opacity"
                    disabled={loading}
                  >
                    {loading ? (
                      <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Procesando...</>
                    ) : (
                      "Enviar Solicitud de Registro"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="justify-center border-t py-8 bg-muted/10 px-8">
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Al enviar este formulario, aceptas que el Instituto Educativo Emiliano Zapata trate tus datos personales para fines de inscripción y comunicación académica.
            </p>
          </CardFooter>
        </Card>
      </main>

      <footer className="py-8 text-center text-muted-foreground text-sm border-t bg-white">
        <p>Instituto Educativo Emiliano Zapata &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
