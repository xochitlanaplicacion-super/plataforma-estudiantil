"use client";

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Layers, Users, BookOpen, Plus, MoreVertical, Edit3, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockSubjects } from '@/lib/mock-data';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function ProfesorDashboard() {
  return (
    <DashboardLayout userRole="profesor" userName="Profesor X">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold font-headline tracking-tight">Mis Asignaturas</h2>
            <p className="text-muted-foreground">Gestiona el contenido y seguimiento de tus grupos.</p>
          </div>
          <Button className="bg-primary hover:bg-primary/90 gap-2">
            <Plus size={18} /> Nueva Unidad
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {mockSubjects.map((subject) => (
            <Card key={subject.id} className="relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <BookOpen size={120} />
              </div>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <Badge className="bg-accent text-accent-foreground mb-2">Grupo A - 1er Semestre</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical size={16} /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2"><Edit3 size={14}/> Editar Detalles</DropdownMenuItem>
                      <DropdownMenuItem className="gap-2"><Layers size={14}/> Organizar Unidades</DropdownMenuItem>
                      <DropdownMenuItem className="gap-2"><Eye size={14}/> Vista Alumno</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardTitle className="text-2xl">{subject.name}</CardTitle>
                <CardDescription>Ingeniería en Sistemas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">12</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Temas Publicados</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">34</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Alumnos Activos</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Unidades del Curso</span>
                    <span className="text-xs text-muted-foreground">4 Unidades totales</span>
                  </div>
                  <div className="space-y-2">
                    {['Unidad 1: Introducción', 'Unidad 2: Conceptos Avanzados'].map((unit, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 text-sm bg-white border rounded hover:border-primary transition-colors cursor-pointer group">
                        <span className="flex items-center gap-2">
                          <Layers size={14} className="text-muted-foreground" />
                          {unit}
                        </span>
                        <Badge variant="outline" className="text-[10px] group-hover:bg-primary group-hover:text-primary-foreground">6 Temas</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="bg-primary/5 rounded-2xl p-8 border border-primary/10">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
              <Users size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold font-headline">Seguimiento de Alumnos</h3>
              <p className="text-sm text-muted-foreground">Consulta el acceso y vigencia de tus estudiantes.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <Button variant="outline">Descargar Reporte de Asistencia</Button>
            <Button variant="outline">Ver Alumnos por Expirar</Button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
