
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff, ClipboardEdit } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

type Theme = {
  id: string;
  bgImage: string;
  buttonColor: string;
  textColor: string;
};

const themes: Theme[] = [
  {
    id: 'vino',
    bgImage: '/images/FONDO_ROJO.png',
    buttonColor: '#8B2332',
    textColor: 'text-white'
  },
  {
    id: 'verde',
    bgImage: '/images/FONDOS_VERDE.png',
    buttonColor: '#1A4A3F',
    textColor: 'text-white'
  },
  {
    id: 'beige',
    bgImage: '/images/fondos_beige.jpg',
    buttonColor: '#E8D5B7',
    textColor: 'text-[#1A4A3F]'
  }
];

const LOGO_URL = '/images/logo_zapata.png';

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
  const [bgLoaded, setBgLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('ez-theme');
    const themeToUse = themes.find(t => t.id === savedTheme) || themes[Math.floor(Math.random() * themes.length)];
    setCurrentTheme(themeToUse);
    setBgLoaded(false);
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
          .select('rol, estatus, fecha_expiracion')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          setError("No se encontró tu perfil académico.");
          setLoading(false);
          return;
        }

        // VERIFICACIÓN DE EXPIRACIÓN Y ESTATUS
        const hoy = new Date().toISOString().split('T')[0];
        const isExpired = profile.fecha_expiracion && profile.fecha_expiracion < hoy;

        if (profile.estatus !== 'activo' || isExpired) {
          router.push('/expired');
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
    <div className="min-h-screen w-full bg-white font-body overflow-hidden flex flex-col">
      <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 overflow-hidden">
        
        <div className="hidden md:flex relative overflow-hidden bg-gray-100">
          <img 
            src={currentTheme.bgImage}
            alt="Fondo Institucional"
            className={`
              absolute inset-0 w-full h-full object-cover
              transition-opacity duration-1000
              ${bgLoaded ? 'opacity-100' : 'opacity-0'}
            `}
            onLoad={() => setBgLoaded(true)}
          />
          
          {!bgLoaded && (
            <div 
              className="absolute inset-0 animate-pulse"
              style={{ backgroundColor: currentTheme.buttonColor }}
            />
          )}

          <div className="relative z-10 w-full h-full flex items-center justify-center p-12">
            <div className="relative w-[85%] lg:w-[85%] aspect-square flex items-center justify-center">
              <img 
                src={LOGO_URL}
                alt="Logo Emiliano Zapata"
                className={`
                  w-full h-full object-contain drop-shadow-2xl
                  transition-all duration-700
                  ${logoLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                `}
                onLoad={() => setLogoLoaded(true)}
              />
            </div>
          </div>
        </div>

        <div className="p-8 md:p-14 lg:p-24 flex flex-col justify-center bg-white relative">
          <div className="md:hidden flex justify-center mb-8">
            <img src={LOGO_URL} alt="Logo" className="w-24 h-24 object-contain" />
          </div>

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
                {loading ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : "Entrar al Sistema"}
              </Button>
            </form>
          </div>

          <div className="absolute bottom-6 left-6">
            <Link href="/preregistro">
              <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 text-primary text-xs h-9">
                <ClipboardEdit size={14} /> Preregistro Aspirantes
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
