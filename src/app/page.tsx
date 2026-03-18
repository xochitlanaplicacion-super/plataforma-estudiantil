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

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Verificar si ya hay una sesión activa al cargar
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
  }, []);

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
    setLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error de acceso",
          description: "Correo o contraseña incorrectos.",
        });
        setLoading(false);
        return;
      }

      if (data.user) {
        // Intentar obtener el perfil
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('rol, estatus, fecha_expiracion')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          console.error("Profile fetch error:", profileError);
          await supabase.auth.signOut();
          toast({
            variant: "destructive",
            title: "Perfil no configurado",
            description: "Tu usuario existe pero no tienes un perfil asociado. Contacta a soporte.",
          });
          setLoading(false);
          return;
        }

        if (profile.estatus !== 'activo') {
          await supabase.auth.signOut();
          toast({
            variant: "destructive",
            title: "Cuenta restringida",
            description: `Tu estatus actual es: ${profile.estatus}.`,
          });
          setLoading(false);
          return;
        }

        // Validar expiración si existe
        if (profile.fecha_expiracion) {
          const now = new Date();
          const exp = new Date(profile.fecha_expiracion);
          if (exp < now) {
            await supabase.auth.signOut();
            router.push('/expired');
            return;
          }
        }

        toast({
          title: "Acceso exitoso",
          description: "Bienvenido a la plataforma.",
        });
        
        redirectUser(profile.rol);
      }

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error del sistema",
        description: "No se pudo conectar con el servidor.",
      });
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
            <h1 className="text-4xl font-bold font-headline mb-4">
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
              <span className="text-sm font-medium">Seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="text-white/80" />
              <span className="text-sm font-medium">Académico</span>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-12 flex flex-col justify-center bg-white">
          <Card className="border-none shadow-none">
            <CardHeader className="p-0 mb-8">
              <CardTitle className="text-2xl font-headline font-bold text-gray-800">Bienvenido</CardTitle>
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
                  className="w-full h-12 text-lg shadow-md bg-primary hover:bg-primary/90 transition-all" 
                  disabled={loading}
                >
                  {loading ? "Verificando..." : "Acceder"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="p-0 mt-8 pt-8 border-t flex flex-col items-center">
              <p className="text-xs text-muted-foreground text-center">
                El acceso está sujeto a la vigencia de su registro.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
