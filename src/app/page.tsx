"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

// Orden: Verde -> Crema -> Rojo
const themes = [
  { name: 'teal', bg: '#1A4A3F', text: '#ffffff', accent: '#E8D5B7' },
  { name: 'beige', bg: '#E8D5B7', text: '#34261A', accent: '#8B2332' },
  { name: 'vino', bg: '#8B2332', text: '#ffffff', accent: '#E8D5B7' }
];

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [themeIndex, setThemeIndex] = useState(0);

  // Cambio de tema cada 10 segundos para dar tiempo a la transición lenta
  useEffect(() => {
    const interval = setInterval(() => {
      setThemeIndex((prev) => (prev + 1) % themes.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const currentTheme = themes[themeIndex];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // 🔹 LOGIN CON SUPABASE (reemplaza Firebase signInWithEmailAndPassword)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error de acceso",
          description: "Credenciales inválidas o usuario no encontrado.",
        });
        return;
      }

      // 🔹 OBTENER PERFIL DESDE SUPABASE (reemplaza Firestore getDoc)
      const {  profile, error: profileError } = await supabase
        .from('profiles')
        .select('rol, estatus, fecha_expiracion, nombre, apellidos, curp')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        toast({
          variant: "destructive",
          title: "Perfil no encontrado",
          description: "Por favor contacta a administración.",
        });
        return;
      }

      // 🔹 VALIDAR ESTATUS
      if (profile.estatus !== 'activo') {
        await supabase.auth.signOut();
        toast({
          variant: "destructive",
          title: "Cuenta inactiva",
          description: "Contacta al administrador para reactivar tu acceso.",
        });
        return;
      }

      // 🔹 VALIDAR VIGENCIA (fecha_expiracion)
      const now = new Date();
      const expirationDate = new Date(profile.fecha_expiracion);
      
      if (profile.fecha_expiracion && expirationDate < now) {
        await supabase.auth.signOut();
        router.push('/login?expired=true');
        toast({
          variant: "destructive",
          title: "Acceso expirado",
          description: `Tu vigencia finalizó el ${profile.fecha_expiracion}. Contacta a administración.`,
        });
        return;
      }

      // 🔹 REDIRECCIÓN BASADA EN ROL
      switch (profile.rol) {
        case 'superuser':
          router.push('/superadmin');
          break;
        case 'admin':
          router.push('/admin');
          break;
        case 'profesor':
          router.push('/profesor');
          break;
        case 'alumno':
          router.push('/alumno');
          break;
        default:
          router.push('/alumno');
      }

    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        variant: "destructive",
        title: "Error inesperado",
        description: "Intenta de nuevo o contacta a soporte técnico.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body overflow-hidden">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 shadow-2xl rounded-2xl overflow-hidden bg-white">
        
        {/* Visual Panel con TRANSMUTACIÓN ULTRA LENTA (4000ms) */}
        <div 
          className="hidden md:flex flex-col justify-center p-12 space-y-8 relative overflow-hidden transition-all duration-[4000ms] ease-in-out"
          style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <GraduationCap size={200} />
          </div>
          
          <div className="z-10">
            <div 
              className="h-12 w-12 rounded-xl mb-6 flex items-center justify-center font-bold text-2xl shadow-lg transition-all duration-[4000ms] ease-in-out"
              style={{ backgroundColor: currentTheme.accent, color: currentTheme.bg }}
            >
              EF
            </div>
            <h1 className="text-4xl font-bold font-headline mb-4 transition-colors duration-[4000ms] ease-in-out">
              EduFlow Platform
            </h1>
            <p className="text-lg opacity-90 leading-relaxed transition-colors duration-[4000ms] ease-in-out">
              Sistema integral de gestión académica. 
              Control de vigencias, contenidos dinámicos y seguimiento curricular.
            </p>
          </div>

          <div className="flex gap-6 z-10">
            <div className="flex items-center gap-2">
              <ShieldCheck className="transition-colors duration-[4000ms]" style={{ color: currentTheme.accent }} />
              <span className="text-sm font-medium">Acceso Seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="transition-colors duration-[4000ms]" style={{ color: currentTheme.accent }} />
              <span className="text-sm font-medium">Contenido Real</span>
            </div>
          </div>
        </div>

        {/* Form Panel */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-white">
          <Card className="border-none shadow-none">
            <CardHeader className="p-0 mb-8">
              <CardTitle className="text-2xl font-headline font-bold">Bienvenido</CardTitle>
              <CardDescription>Ingresa tus credenciales institucionales</CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Institucional</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="usuario@institucion.edu" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg shadow-md border-none transition-all duration-[4000ms] ease-in-out" 
                  disabled={loading}
                  style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
                >
                  {loading ? "Cargando..." : "Acceder"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="p-0 mt-8 pt-8 border-t flex flex-col items-center">
              <p className="text-xs text-muted-foreground text-center">
                Plataforma académica protegida. 
                El acceso está sujeto a la vigencia de su registro.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}