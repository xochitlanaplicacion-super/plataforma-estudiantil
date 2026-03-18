
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BookOpen, GraduationCap, ShieldCheck, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('rol')
          .eq('id', session.user.id)
          .single();
        
        if (profile) redirectUser(profile.rol);
      }
    };
    checkSession();
  }, [router]);

  const redirectUser = (rol: string) => {
    switch (rol) {
      case 'superuser':
      case 'admin':
        router.push('/dashboard/admin');
        break;
      case 'profesor':
        router.push('/dashboard/profesor');
        break;
      case 'alumno':
        router.push('/dashboard/alumno');
        break;
      default:
        router.push('/dashboard/alumno');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Limpieza de campos
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError("Por favor, ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log("Intentando login para:", cleanEmail);
      
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (authError) {
        console.error("Error de Auth:", authError);
        let message = authError.message;
        if (message === "Invalid login credentials") {
          message = "Credenciales incorrectas. Verifica tu correo y contraseña.";
        } else if (message === "missing email or phone") {
          message = "Error en el envío de datos. Intenta escribir de nuevo tus credenciales.";
        }
        setError(message);
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('rol, estatus, fecha_expiracion')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          setError("Usuario autenticado pero perfil no encontrado. Contacta a soporte.");
          setLoading(false);
          return;
        }

        if (profile.estatus !== 'activo') {
          setError(`Cuenta inactiva (${profile.estatus}). Contacta al administrador.`);
          setLoading(false);
          return;
        }

        if (profile.fecha_expiracion) {
          const now = new Date();
          const exp = new Date(profile.fecha_expiracion);
          if (exp < now) {
            router.push('/expired');
            return;
          }
        }

        toast({
          title: "¡Bienvenido!",
          description: "Acceso concedido correctamente.",
        });
        
        redirectUser(profile.rol);
      }

    } catch (err: any) {
      console.error("Error inesperado:", err);
      setError("Ocurrió un error inesperado al intentar conectar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body overflow-hidden">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 shadow-2xl rounded-2xl overflow-hidden bg-white">
        
        <div className="hidden md:flex flex-col justify-center p-12 space-y-8 relative overflow-hidden bg-primary text-primary-foreground">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <GraduationCap size={200} />
          </div>
          
          <div className="z-10">
            <div className="h-12 w-12 rounded-xl mb-6 flex items-center justify-center font-bold text-2xl shadow-lg bg-white/20">
              EF
            </div>
            <h1 className="text-4xl font-bold font-headline mb-4 leading-tight">
              EduFlow Platform
            </h1>
            <p className="text-lg opacity-90 leading-relaxed">
              Sistema integral de gestión académica. 
              Control de vigencias y contenidos dinámicos.
            </p>
          </div>

          <div className="flex gap-6 z-10">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-white/80" />
              <span className="text-sm font-medium">Acceso Seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="text-white/80" />
              <span className="text-sm font-medium">Control Académico</span>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-12 flex flex-col justify-center bg-white">
          <Card className="border-none shadow-none">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="text-2xl font-headline font-bold text-gray-800">Iniciar Sesión</CardTitle>
              <CardDescription>Accede con tu cuenta institucional</CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="ejemplo@gmail.com" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                    autoComplete="current-password"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-11 text-base shadow-md bg-primary hover:bg-primary/90 transition-all font-semibold" 
                  disabled={loading}
                >
                  {loading ? "Validando..." : "Entrar al Sistema"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="p-0 mt-8 pt-8 border-t flex flex-col items-center">
              <p className="text-[11px] text-muted-foreground text-center leading-tight">
                Plataforma de Control Académico - Emiliano Zapata
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
