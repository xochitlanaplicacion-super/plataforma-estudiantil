
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !db) return;

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Verificar vigencia
        const now = new Date();
        const expirationDate = new Date(userData.expirationDate);
        
        if (expirationDate < now) {
          router.push('/expired');
          return;
        }

        // Redirección basada en rol
        switch (userData.role) {
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
      } else {
        toast({
          variant: "destructive",
          title: "Error de perfil",
          description: "No se encontró información de perfil para este usuario.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: "Credenciales inválidas o problema de conexión.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 shadow-2xl rounded-2xl overflow-hidden">
        {/* Visual Panel */}
        <div className="hidden md:flex flex-col justify-center p-12 bg-primary text-primary-foreground space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <GraduationCap size={200} />
          </div>
          <div className="z-10">
            <div className="h-12 w-12 bg-accent rounded-xl mb-6 flex items-center justify-center font-bold text-accent-foreground text-2xl">EF</div>
            <h1 className="text-4xl font-bold font-headline mb-4">EduFlow Platform</h1>
            <p className="text-lg opacity-90 leading-relaxed">
              Gestión académica avanzada para Universidades y Preparatorias.
              Control total, acceso seguro y aprendizaje sin límites.
            </p>
          </div>
          <div className="flex gap-6 z-10">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-accent" />
              <span className="text-sm font-medium">Seguridad Real</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="text-accent" />
              <span className="text-sm font-medium">Contenido</span>
            </div>
          </div>
        </div>

        {/* Form Panel */}
        <div className="bg-white p-8 md:p-12 flex flex-col justify-center">
          <Card className="border-none shadow-none">
            <CardHeader className="p-0 mb-8">
              <CardTitle className="text-2xl font-headline font-bold">Bienvenido</CardTitle>
              <CardDescription>Ingresa tus credenciales institucionales</CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Contraseña</Label>
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-lg bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? "Iniciando sesión..." : "Acceder"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="p-0 mt-8 pt-8 border-t flex flex-col items-center">
              <p className="text-xs text-muted-foreground text-center">
                Plataforma protegida por Firebase Security Rules. 
                El acceso está restringido a personal autorizado.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
