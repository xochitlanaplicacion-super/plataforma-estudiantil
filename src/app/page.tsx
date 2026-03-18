"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShieldCheck, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Forzamos que la página sea dinámica
export const dynamic = 'force-dynamic';

type Theme = {
  bgImage: string;
  buttonColor: string;
  textColor: string;
  badgeColor: string;
};

const themes: Theme[] = [
  {
    bgImage: 'https://i.postimg.cc/L6Gyfvgw/FONDO_ROJO.png',
    buttonColor: '#8B2332',
    textColor: 'text-white',
    badgeColor: 'bg-white/10 border-white/20'
  },
  {
    bgImage: 'https://i.postimg.cc/9FsxT1wN/FONDOS_VERDE.png',
    buttonColor: '#1A4A3F',
    textColor: 'text-white',
    badgeColor: 'bg-white/10 border-white/20'
  },
  {
    bgImage: 'https://i.postimg.cc/m2KdMV1K/fondos_beige_jpg.jpg',
    buttonColor: '#E8D5B7',
    textColor: 'text-[#1A4A3F]',
    badgeColor: 'bg-black/5 border-black/10'
  }
];

export default function LoginPage() {
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes[0]);

  useEffect(() => {
    setMounted(true);
    // Seleccionar un tema aleatorio al cargar
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    setCurrentTheme(randomTheme);
  }, []);

  const redirectByRole = (rol: string) => {
    let destination = '/dashboard/alumno';
    if (rol === 'superuser' || rol === 'admin') destination = '/dashboard/admin';
    if (rol === 'profesor') destination = '/dashboard/profesor';
    
    router.push(destination);
    router.refresh();
  };

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
        setError("Credenciales incorrectas. Verifica tu correo y contraseña.");
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
          setError("No se encontró tu perfil académico.");
          setLoading(false);
          return;
        }

        if (profile.estatus !== 'activo') {
          setError(`Tu cuenta está ${profile.estatus}. Contacta a administración.`);
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        toast({
          title: "Acceso Concedido",
          description: "Bienvenido al sistema.",
        });
        
        redirectByRole(profile.rol);
      }
    } catch (err: any) {
      setError("Error de conexión con el servidor.");
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4 font-body overflow-hidden">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 shadow-2xl rounded-2xl overflow-hidden bg-white border border-primary/10">
        
        {/* Lado Izquierdo - Fondo Dinámico */}
        <div 
          className="hidden md:flex flex-col justify-end items-start p-12 relative overflow-hidden bg-cover bg-center transition-all duration-1000"
          style={{ backgroundImage: `url(${currentTheme.bgImage})` }}
        >
          {/* Logo Centrado con fondo traslúcido para legibilidad */}
          <div className="absolute inset-0 flex items-center justify-center p-12 pointer-events-none">
            <div className="relative w-[75%] h-[75%] flex items-center justify-center bg-white/40 backdrop-blur-md rounded-[2.5rem] p-8 shadow-sm">
              <div className="relative w-full h-full">
                <Image 
                  src="https://i.postimg.cc/wjVN06TJ/Logo-UNIV-PREPA-CAP-IEEZ-01.png"
                  alt="Logo IEEZ"
                  fill
                  className="object-contain drop-shadow-xl"
                  priority
                />
              </div>
            </div>
          </div>

          <div className="z-10 w-full">
             <div className={`flex items-center gap-3 p-3 rounded-xl backdrop-blur-sm border w-fit ${currentTheme.badgeColor}`}>
              <ShieldCheck className="text-accent h-5 w-5" /> 
              <span className={`text-sm font-medium ${currentTheme.textColor}`}>plataforma de estudios</span>
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

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700">Correo Electrónico</Label>
                <Input 
                  id="email" 
                  type="email" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 border-muted focus:ring-primary/20 bg-gray-50/30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" title="Contraseña" className="text-gray-700">Contraseña</Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"}
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-muted focus:ring-primary/20 bg-gray-50/30 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                    aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 text-base shadow-lg font-bold transition-all mt-4 border-none text-white" 
                style={{ backgroundColor: currentTheme.buttonColor }}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verificando...</>
                ) : (
                  "Entrar al Sistema"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
