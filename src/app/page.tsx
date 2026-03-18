
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BookOpen, GraduationCap, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function LoginPage() {
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const redirectUser = useCallback((rol: string) => {
    let destination = '/dashboard/alumno';
    if (rol === 'superuser' || rol === 'admin') destination = '/dashboard/admin';
    if (rol === 'profesor') destination = '/dashboard/profesor';
    
    // Forzamos la redirección con recarga para asegurar sincronización de cookies
    window.location.href = destination;
  }, []);

  // Verificar si ya hay una sesión activa al cargar
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('rol')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            redirectUser(profile.rol);
            return;
          }
        }
      } catch (e) {
        console.error("Error checking session", e);
      } finally {
        setChecking(false);
      }
    };
    checkSession();
  }, [redirectUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError("Ingresa tus credenciales.");
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
          .select('rol, estatus')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          setError("Perfil no encontrado en la base de datos.");
          setLoading(false);
          return;
        }

        if (profile.estatus !== 'activo') {
          setError(`Cuenta ${profile.estatus}.`);
          setLoading(false);
          return;
        }

        toast({
          title: "Acceso concedido",
          description: "Cargando tu panel de control...",
        });
        
        redirectUser(profile.rol);
      }
    } catch (err: any) {
      setError("Error de conexión con el servidor.");
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body overflow-hidden">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 shadow-2xl rounded-2xl overflow-hidden bg-white border">
        
        <div className="hidden md:flex flex-col justify-center p-12 space-y-8 relative overflow-hidden bg-primary text-primary-foreground">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <GraduationCap size={200} />
          </div>
          <div className="z-10">
            <div className="h-12 w-12 rounded-xl mb-6 flex items-center justify-center font-bold text-2xl shadow-lg bg-white/20 border border-white/30">EF</div>
            <h1 className="text-4xl font-bold font-headline mb-4 leading-tight">EduFlow Platform</h1>
            <p className="text-lg opacity-90 leading-relaxed font-light">Sistema integral de gestión académica.</p>
          </div>
          <div className="flex flex-col gap-4 z-10 pt-4">
            <div className="flex items-center gap-2"><ShieldCheck className="text-accent h-5 w-5" /> <span className="text-sm font-medium">Control Administrativo Global</span></div>
            <div className="flex items-center gap-2"><BookOpen className="text-accent h-5 w-5" /> <span className="text-sm font-medium">10 Módulos Integrados</span></div>
          </div>
        </div>

        <div className="p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-headline font-bold text-gray-800">Iniciar Sesión</h2>
              <p className="text-muted-foreground text-sm">Accede con tu cuenta institucional</p>
            </div>

            {error && (
              <Alert variant="destructive" className="animate-in fade-in zoom-in duration-300">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="admin@eduflow.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 border-muted"
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
                  className="h-11 border-muted"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 text-base shadow-lg bg-primary hover:bg-primary/90 font-bold" 
                disabled={loading}
              >
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...</> : "Entrar al Sistema"}
              </Button>
            </form>
            
            <div className="pt-6 border-t">
              <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest font-semibold">
                Plataforma EduFlow - Versión 1.0.0
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
