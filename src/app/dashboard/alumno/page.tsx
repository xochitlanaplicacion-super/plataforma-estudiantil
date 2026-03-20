"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { BookOpen, Clock, ChevronRight, FileText, PlayCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createClient } from '@/lib/supabase/client';
import { Subject, User } from '@/lib/types';

export default function AlumnoDashboard() {
  const supabase = createClient();
  const [profile, setProfile] = useState<User | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (profileData) setProfile(profileData as any);

        // Intentar traer materias (aunque la tabla esté vacía)
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('*')
          .limit(10);
        
        if (subjectsData) setSubjects(subjectsData as any);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">
            Hola, {loading ? '...' : profile?.nombre || 'Usuario'}
          </h2>
          <p className="text-muted-foreground">
            {loading ? 'Cargando información académica...' : 'Consulta tus materias y progreso actual.'}
          </p>
        </div>
        <Card className="bg-accent/10 border-accent/20">
          <CardContent className="p-3 flex items-center gap-3">
            <Clock className="text-accent" />
            <div className="text-xs">
              <p className="font-semibold">Vigencia de Acceso</p>
              <p>{loading ? '...' : profile?.fecha_expiracion || 'Sin vigencia'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold font-headline">Mis Materias</h3>
          <Button variant="link" className="text-primary">Ver horario completo</Button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="bg-muted/50 rounded-xl p-12 text-center border-2 border-dashed">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
            <h4 className="font-bold">Aún no tienes materias asignadas</h4>
            <p className="text-sm text-muted-foreground">Contacta a servicios escolares para tu inscripción.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject) => (
              <Card key={subject.id} className="hover:shadow-md transition-shadow group cursor-pointer">
                <CardHeader className="pb-4">
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <BookOpen size={20} />
                  </div>
                  <CardTitle className="text-lg">{subject.nombre}</CardTitle>
                  <CardDescription>Clave: {subject.clave || 'N/A'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Progreso de estudio</span>
                    <span className="font-bold">0%</span>
                  </div>
                  <Progress value={0} className="h-2" />
                </CardContent>
                <CardFooter className="pt-0 flex justify-between">
                  <div className="flex gap-2">
                    <div className="flex items-center text-[10px] text-muted-foreground gap-1">
                      <FileText size={12} /> 0 Temas
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 px-2 group-hover:translate-x-1 transition-transform">
                    Comenzar <ChevronRight size={14} />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card className="border-accent/30 bg-accent/5">
        <CardHeader>
          <CardTitle className="text-lg">Próximas Actividades</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground italic text-sm">
          No tienes actividades pendientes por el momento.
        </CardContent>
      </Card>
    </div>
  );
}