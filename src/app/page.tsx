"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate role-based redirection based on mock emails
    setTimeout(() => {
      if (email.includes('admin')) router.push('/dashboard/admin');
      else if (email.includes('profesor')) router.push('/dashboard/profesor');
      else if (email.includes('alumno')) router.push('/dashboard/alumno');
      else if (email.includes('expired')) router.push('/expired');
      else router.push('/dashboard/alumno');
    }, 1000);
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
              <span className="text-sm font-medium">Seguridad</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="text-accent" />
              <span className="text-sm font-medium">Contenido</span>
            </div>
          </div>
        </div>

        {/* Form Panel */}
        <div className="bg-white p-8 md:p-12 flex flex-col justify-center">
          <div className="md:hidden flex justify-center mb-8">
            <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center font-bold text-primary-foreground text-2xl">EF</div>
          </div>
          
          <Card className="border-none shadow-none">
            <CardHeader className="p-0 mb-8">
              <CardTitle className="text-2xl font-headline font-bold">Bienvenido</CardTitle>
              <CardDescription>Ingresa tus credenciales para acceder a la plataforma</CardDescription>
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
                    <Button variant="link" className="p-0 h-auto text-xs text-primary">¿Olvidaste tu contraseña?</Button>
                  </div>
                  <Input id="password" type="password" required />
                </div>
                <Button type="submit" className="w-full h-12 text-lg bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? "Cargando..." : "Iniciar Sesión"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="p-0 mt-8 pt-8 border-t flex flex-col items-center">
              <p className="text-sm text-muted-foreground mb-4">Credenciales sugeridas para prueba:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => setEmail('admin@eduflow.com')} className="text-xs">Admin</Button>
                <Button variant="outline" size="sm" onClick={() => setEmail('profesor@eduflow.com')} className="text-xs">Profesor</Button>
                <Button variant="outline" size="sm" onClick={() => setEmail('alumno@eduflow.com')} className="text-xs">Alumno</Button>
                <Button variant="outline" size="sm" onClick={() => setEmail('expired@eduflow.com')} className="text-xs">Expirado</Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
