"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Tipos para el tema dinámico
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

// Componente de alerta local
const LocalAlert = ({ children, variant = "default" }: { children: React.ReactNode, variant?: "default" | "destructive" }) => (
  <div className={`p-4 rounded-lg border flex gap-3 ${variant === "destructive" ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-muted border-border text-foreground"}`}>
    {children}
  </div>
);

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
    <div className="min-h-screen w-full bg-white font-body overflow-hidden">
      <div className="w-full min-h-screen grid grid-cols-1 md:grid-cols-2 overflow-hidden">
        
        {/* Lado Izquierdo - Fondo Dinámico Full Screen */}
        <div 
          className="hidden md:flex flex-col justify-end items-start p-12 lg:p-20 relative overflow-hidden bg-cover bg-center transition-all duration-1000"
          style={{ backgroundImage: `url(${currentTheme.bgImage})` }}
        >
          {/* Logo Centrado - Tamaño 85% más grande */}
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
            <div className="relative w-[90%] lg:w-[85%] aspect-square flex items-center justify-center">
              <Image 
                src="https://i.postimg.cc/Z5FQHyN4/unnamed.png"
                alt="Logo IEEZ"
                fill
                className="object-contain drop-shadow-2xl"
                priority
              />
            </div>
          </div>

          <div className="z-10 w-full">
             <div className={`flex items-center gap-3 p-4 rounded-xl backdrop-blur-sm border w-fit ${currentTheme.badgeColor}`}>
              <ShieldCheck className="text-accent h-6 w-6" /> 
              <span className={`text-base font-medium ${currentTheme.textColor}`}>plataforma de estudios</span>
            </div>
          </div>
        </div>

        {/* Lado Derecho - Formulario Full Screen */}
        <div className="p-8 md:p-14 lg:p-24 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto space-y-10">
            <div className="space-y-3 text-center md:text-left">
              <h2 className="text-4xl font-headline font-bold text-gray-900 tracking-tight">Iniciar Sesión</h2>
              <p className="text-muted-foreground text-lg">Ingresa tus credenciales para acceder al sistema.</p>
            </div>

            {error && (
              <LocalAlert variant="destructive">
                <div className="flex flex-col">
                  <span className="font-bold">Error</span>
                  <span className="text-sm">{error}</span>
                </div>
              </LocalAlert>
            )}

            <form onSubmit={handleLogin} className="space-y-8">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-gray-700 text-base">Correo Electrónico</Label>
                <Input 
                  id="email" 
                  type="email" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 text-lg border-muted focus:ring-primary/20 bg-gray-50/30"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="password" title="Contraseña" className="text-gray-700 text-base">Contraseña</Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"}
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 text-lg border-muted focus:ring-primary/20 bg-gray-50/30 pr-14"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                    aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
                  </button>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-14 text-lg shadow-lg font-bold transition-all mt-6 border-none text-white" 
                style={{ backgroundColor: currentTheme.buttonColor }}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Verificando...</>
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
