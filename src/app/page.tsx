
"use client";

import React, { useState, useEffect, useCallback } from 'react';
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

  const redirectUser = useCallback((rol: string) => {
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
  }, [router]);

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
  }, [redirectUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError("Por favor, ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (authError) {
        setError(authError.message === "Invalid login credentials" 
          ? "Correo o contraseña incorrectos." 
          : authError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('rol, estatus, fecha_expiracion')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          setError("Acceso concedido pero no se encontró tu perfil. Contacta al soporte.");
          setLoading(false);
          return;
        }

        if (profile.estatus !== 'activo') {
          setError(`Tu cuenta está ${profile.estatus}. Contacta al administrador.`);
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
          description: "Iniciando sesión correctamente.",
        });
        
        redirectUser(profile.rol);
      }

    } catch (err: any) {
      setError("Error inesperado al conectar con el servidor.");
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
            <div className="h-12 w-12 rounded-xl mb-6 flex items-center justify-center font-bold text-2xl shadow-lg bg-white/20 border border-white/30">
              EF
            </div>
            <h1 className="text-4xl font-bold font-headline mb-4 leading-tight">
              EduFlow Platform
            </h1>
            <p className="text-lg opacity-90 leading-relaxed font-light">
              Sistema integral de gestión académica. 
              Control de vigencias y contenidos dinámicos.
            </p>
          </div>

          <div className="flex gap-6 z-10 pt-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-accent h-5 w-5" />
              <span className="text-sm font-medium">Acceso Seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="text-accent h-5 w-5" />
              <span className="text-sm font-medium">Gestión Curricular</span>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-12 flex flex-col justify-center bg-white">
          <Card className="border-none shadow-none">
            <CardHeader className="p-0 mb-8">
              <CardTitle className="text-3xl font-headline font-bold text-gray-800">Iniciar Sesión</CardTitle>
              <CardDescription className="text-base">Accede con tu cuenta institucional de EduFlow</CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              {error && (
                <Alert variant="destructive" className="mb-6 animate-in slide-in-from-top duration-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error de acceso</AlertTitle>
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="ejemplo@gmail.com" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 border-muted focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-muted focus:ring-primary/20"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base shadow-lg bg-primary hover:bg-primary/90 transition-all font-bold tracking-wide" 
                  disabled={loading}
                >
                  {loading ? "Validando acceso..." : "Entrar al Sistema"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="p-0 mt-10 pt-8 border-t flex flex-col items-center">
              <p className="text-[11px] text-muted-foreground text-center leading-tight uppercase tracking-tighter font-semibold">
                Plataforma de Control Académico Integral - 2026
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
