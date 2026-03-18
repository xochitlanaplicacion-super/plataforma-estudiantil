
"use client";

import React, { useState, useEffect } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Aseguramos que el componente esté montado para evitar errores de hidratación
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      setError("Por favor completa todos los campos.");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError) {
        setError(authError.message === "Invalid login credentials" 
          ? "Credenciales incorrectas. Verifica tu correo y contraseña." 
          : "Error de validación: " + authError.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('rol, estatus')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          setError("Sesión iniciada, pero no se encontró tu perfil académico.");
          setLoading(false);
          return;
        }

        if (profile.estatus !== 'activo') {
          setError(`Tu cuenta está ${profile.estatus}. Contacta a administración.`);
          setLoading(false);
          return;
        }

        toast({
          title: "Acceso Concedido",
          description: "Bienvenido a EduFlow. Cargando tu panel...",
        });
        
        let destination = '/dashboard/alumno';
        if (profile.rol === 'superuser' || profile.rol === 'admin') destination = '/dashboard/admin';
        if (profile.rol === 'profesor') destination = '/dashboard/profesor';
        
        window.location.href = destination;
      }
    } catch (err: any) {
      setError("Error de conexión con el servidor educativo.");
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4 font-body overflow-hidden">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 shadow-2xl rounded-2xl overflow-hidden bg-white border border-primary/10">
        
        {/* Lado Izquierdo - Branding */}
        <div className="hidden md:flex flex-col justify-center p-12 space-y-8 relative overflow-hidden bg-primary text-primary-foreground">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <GraduationCap size={240} />
          </div>
          <div className="z-10">
            <div className="h-14 w-14 rounded-2xl mb-6 flex items-center justify-center font-bold text-3xl shadow-xl bg-white/20 border border-white/30 backdrop-blur-sm">EF</div>
            <h1 className="text-4xl font-bold font-headline mb-4 leading-tight tracking-tight">EduFlow Platform</h1>
            <p className="text-lg opacity-90 leading-relaxed font-light">Gestión académica integral y control de contenidos para instituciones educativas.</p>
          </div>
          <div className="flex flex-col gap-4 z-10 pt-4">
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg">
              <ShieldCheck className="text-accent h-5 w-5" /> 
              <span className="text-sm font-medium">Control de Privilegios por Rol</span>
            </div>
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg">
              <BookOpen className="text-accent h-5 w-5" /> 
              <span className="text-sm font-medium">Plan de Desarrollo de 10 Módulos</span>
            </div>
          </div>
        </div>

        {/* Lado Derecho - Formulario */}
        <div className="p-8 md:p-14 flex flex-col justify-center bg-white">
          <div className="space-y-8">
            <div className="space-y-2 text-center md:text-left">
              <h2 className="text-3xl font-headline font-bold text-gray-900 tracking-tight">Iniciar Sesión</h2>
              <p className="text-muted-foreground text-sm">Ingresa tus credenciales para acceder al sistema.</p>
            </div>

            {error && (
              <Alert variant="destructive" className="animate-in slide-in-from-top-2 duration-300">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="ejemplo@eduflow.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 border-muted focus:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                </div>
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
                className="w-full h-12 text-base shadow-lg bg-primary hover:bg-primary/90 font-bold transition-all" 
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verificando...</>
                ) : (
                  "Entrar al Sistema"
                )}
              </Button>
            </form>
            
            <div className="pt-8 border-t">
              <p className="text-[10px] text-muted-foreground text-center uppercase tracking-[0.2em] font-bold">
                EduFlow Platform v1.0 • 2024
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
