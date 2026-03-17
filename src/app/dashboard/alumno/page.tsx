"use client";

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { BookOpen, Clock, ChevronRight, FileText, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { mockSubjects } from '@/lib/mock-data';

export default function AlumnoDashboard() {
  return (
    <DashboardLayout userRole="alumno" userName="Juan Alumno">
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold font-headline tracking-tight">Hola, Juan</h2>
            <p className="text-muted-foreground">Tu ciclo escolar: Ingeniería en Sistemas - 1er Semestre - Grupo A</p>
          </div>
          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="p-3 flex items-center gap-3">
              <Clock className="text-accent" />
              <div className="text-xs">
                <p className="font-semibold">Vigencia de Acceso</p>
                <p>Hasta: 31 Dic 2025</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold font-headline">Mis Materias</h3>
            <Button variant="link" className="text-primary">Ver horario completo</Button>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {mockSubjects.map((subject) => (
              <Card key={subject.id} className="hover:shadow-md transition-shadow group cursor-pointer">
                <CardHeader className="pb-4">
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <BookOpen size={20} />
                  </div>
                  <CardTitle className="text-lg">{subject.name}</CardTitle>
                  <CardDescription>Profesor asignado: Dr. Rodriguez</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Progreso de estudio</span>
                    <span className="font-bold">45%</span>
                  </div>
                  <Progress value={45} className="h-2" />
                </CardContent>
                <CardFooter className="pt-0 flex justify-between">
                  <div className="flex gap-2">
                    <div className="flex items-center text-[10px] text-muted-foreground gap-1">
                      <FileText size={12} /> 12 Temas
                    </div>
                    <div className="flex items-center text-[10px] text-muted-foreground gap-1">
                      <PlayCircle size={12} /> 4 Videos
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 px-2 group-hover:translate-x-1 transition-transform">
                    Continuar <ChevronRight size={14} />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <Card className="border-accent/30 bg-accent/5">
          <CardHeader>
            <CardTitle className="text-lg">Próximas Actividades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-white rounded-lg border">
                <div className="h-12 w-1 flex-shrink-0 bg-primary rounded-full"></div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold">Entrega de Proyecto Final - Unidad 2</h4>
                  <p className="text-xs text-muted-foreground">Materia: Cálculo Diferencial</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-destructive">En 2 días</p>
                  <p className="text-[10px] text-muted-foreground">Vence: 24 Oct</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
