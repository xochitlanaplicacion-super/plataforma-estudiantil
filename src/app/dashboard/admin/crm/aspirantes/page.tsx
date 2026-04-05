
"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import { Aspirante } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Mail, Phone, Clock, FileCheck, Search, Sparkles, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UserDialog } from '@/components/admin/UserDialog';

export default function AspirantesCRM() {
  const supabase = createClient();
  const { toast } = useToast();
  const [aspirantes, setAspirantes] = useState<Aspirante[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedAspirante, setSelectedAspirante] = useState<Aspirante | null>(null);

  const fetchAspirantes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('aspirantes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAspirantes(data || []);
    } catch (err: any) {
      console.error("Error fetching aspirantes:", err);
      toast({ variant: "destructive", title: "Error de conexión", description: "No se pudieron cargar los aspirantes. Verifica los permisos RLS." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAspirantes(); }, []);

  const handleInscribir = (aspirante: Aspirante) => {
    setSelectedAspirante(aspirante);
    setIsUserDialogOpen(true);
  };

  const filtered = aspirantes.filter(a => 
    `${a.nombre} ${a.apellidos} ${a.curp} ${a.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Pipeline de Preregistro</h2>
          <p className="text-muted-foreground">Aspirantes que han completado su ficha formal de inscripción.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input placeholder="Buscar por nombre, CURP o correo..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
              <p>Cargando aspirantes...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
              No se encontraron aspirantes. Verifica que existan registros en la tabla 'aspirantes'.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aspirante</TableHead>
                  <TableHead>Nivel / Carrera</TableHead>
                  <TableHead>Estado Pago</TableHead>
                  <TableHead>Estatus CRM</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((asp) => (
                  <TableRow key={asp.id} className={asp.estatus === 'inscrito' ? 'bg-emerald-50/50 opacity-60' : ''}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{asp.nombre} {asp.apellidos}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground font-mono">{asp.curp}</span>
                          {asp.genero && (
                            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 py-0 uppercase tracking-tighter ${asp.genero === 'Mujer' ? 'text-pink-600 border-pink-200 bg-pink-50' : 'text-blue-600 border-blue-200 bg-blue-50'}`}>
                              {asp.genero.charAt(0)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <Badge variant="outline" className="w-fit text-[9px] uppercase">{asp.nivel}</Badge>
                        <span className="text-[10px] text-muted-foreground mt-1">Interés General</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-primary border-primary/30">Pendiente Validar</Badge></TableCell>
                    <TableCell>
                      <Badge className={asp.estatus === 'inscrito' ? 'bg-emerald-600' : 'bg-amber-500'}>
                        {asp.estatus || 'pendiente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {asp.estatus !== 'inscrito' ? (
                        <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90" onClick={() => handleInscribir(asp)}>
                          <GraduationCap size={14} /> Inscribir Alumno
                        </Button>
                      ) : (
                        <div className="flex items-center justify-end gap-1 text-emerald-600 text-[10px] font-bold">
                          <FileCheck size={14} /> EXPEDIENTE CREADO
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserDialog 
        prefillAspirante={selectedAspirante}
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        onSuccess={fetchAspirantes}
      />
    </div>
  );
}
