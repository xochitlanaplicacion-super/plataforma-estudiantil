
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, Mail, Phone } from 'lucide-react';
import Link from 'next/link';

export default function ExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full text-center p-8 border-destructive/20 shadow-2xl">
        <div className="flex justify-center mb-6">
          <img 
            src="/images/logo_zapata.png" 
            alt="Logo Instituto Emiliano Zapata" 
            className="h-32 w-auto drop-shadow-md"
          />
        </div>
        <CardHeader className="p-0 space-y-2">
          <CardTitle className="text-2xl font-bold font-headline">Acceso Expirado</CardTitle>
          <CardDescription className="text-base font-medium text-destructive">
            Tu periodo de acceso a la plataforma del Instituto Educativo Emiliano Zapata ha terminado.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-8 p-0 space-y-6">
          <div className="bg-muted p-4 rounded-lg flex items-start gap-3 text-left">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Para recuperar el acceso a tus materias y contenidos, es necesario contactar con el departamento de administración o servicios escolares.
            </p>
          </div>
          
          <div className="space-y-3">
            <Button className="w-full gap-2" variant="outline">
              <Mail size={16} /> enviar correo a soporte
            </Button>
            <Button className="w-full gap-2" variant="ghost">
              <Phone size={16} /> llamar a ventanilla
            </Button>
          </div>
        </CardContent>
        <div className="mt-8 pt-6 border-t">
          <Link href="/">
            <Button variant="link" className="text-primary font-semibold">Regresar al inicio</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
