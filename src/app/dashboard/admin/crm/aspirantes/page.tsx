"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import { Aspirante } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, FileCheck, Search, Loader2, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UserDialog } from '@/components/admin/UserDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function AspirantesCRM() {
  const supabase = createClient();
  const { toast } = useToast();
  const [aspirantes, setAspirantes] = useState<Aspirante[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedAspirante, setSelectedAspirante] = useState<Aspirante | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
      toast({ variant: "destructive", title: "Error de conexión", description: "No se pudieron cargar los aspirantes." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
        if (profile) setUserRole(profile.rol);
      }
      fetchAspirantes();
    };
    init();
  }, []);

  const handleInscribir = (aspirante: Aspirante) => {
    setSelectedAspirante(aspirante);
    setIsUserDialogOpen(true);
  };

  const handleArchivar = async (id: string, archivar: boolean) => {
    try {
      const { error } = await supabase.from('aspirantes').update({ is_archived: archivar }).eq('id', id);
      if (error) throw error;
      toast({ title: "Éxito", description: archivar ? "Aspirante archivado correctamente." : "Aspirante devuelto al pipeline." });
      fetchAspirantes();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el registro." });
    }
  };

  const handleBorrar = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('aspirantes').delete().eq('id', deleteId);
      if (error) throw error;
      toast({ title: "Eliminado", description: "El registro ha sido borrado permanentemente." });
      fetchAspirantes();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Hubo un problema al borrar el registro (Verifica tus permisos)." });
    } finally {
      setDeleteId(null);
    }
  };

  const isAdminOrSuper = userRole === 'admin' || userRole === 'superuser';

  const activos = aspirantes.filter(a => !a.is_archived);
  const archivados = aspirantes.filter(a => a.is_archived);

  const filterFn = (a: Aspirante) => `${a.nombre} ${a.apellidos} ${a.curp} ${a.email}`.toLowerCase().includes(search.toLowerCase());
  const filteredActivos = activos.filter(filterFn);
  const filteredArchivados = archivados.filter(filterFn);

  const renderTable = (data: Aspirante[], isArchivosList: boolean) => (
    data.length === 0 ? (
      <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
        No se encontraron aspirantes en esta sección.
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aspirante</TableHead>
            <TableHead>Nivel / Carrera</TableHead>
            <TableHead>Estatus CRM</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((asp) => (
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
              <TableCell>
                <Badge className={asp.estatus === 'inscrito' ? 'bg-emerald-600' : 'bg-amber-500'}>
                  {asp.estatus || 'pendiente'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {!isArchivosList ? (
                    asp.estatus !== 'inscrito' ? (
                      <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90" onClick={() => handleInscribir(asp)}>
                        <GraduationCap size={14} /> Inscribir
                      </Button>
                    ) : (
                      <div className="flex items-center justify-end gap-1 text-emerald-600 text-[10px] font-bold mr-2">
                        <FileCheck size={14} /> EXPEDIENTE
                      </div>
                    )
                  ) : (
                    asp.estatus !== 'inscrito' && (
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => handleInscribir(asp)}>
                        <GraduationCap size={14} /> Inscribir
                      </Button>
                    )
                  )}

                  {isAdminOrSuper && (
                    <>
                      {isArchivosList ? (
                        <Button size="icon" variant="secondary" title="Desarchivar (Regresar al pipeline)" onClick={() => handleArchivar(asp.id, false)}>
                          <ArchiveRestore size={14} className="text-blue-600" />
                        </Button>
                      ) : (
                        <Button size="icon" variant="secondary" title="Archivar" onClick={() => handleArchivar(asp.id, true)}>
                          <Archive size={14} className="text-amber-600" />
                        </Button>
                      )}
                      
                      <Button size="icon" variant="destructive" title="Borrar permanentemente" onClick={() => setDeleteId(asp.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
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
          ) : (
            <Tabs defaultValue="activos" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="activos">
                  Pipeline Activos 
                  <Badge variant="secondary" className="ml-2 bg-primary/10">{activos.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="archivados">
                  Archivados
                  <Badge variant="secondary" className="ml-2 bg-muted">{archivados.length}</Badge>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="activos" className="mt-0">
                {renderTable(filteredActivos, false)}
              </TabsContent>
              
              <TabsContent value="archivados" className="mt-0">
                {renderTable(filteredArchivados, true)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <UserDialog 
        prefillAspirante={selectedAspirante}
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        onSuccess={fetchAspirantes}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 size={20}/> Confirmar Eliminación Absoluta
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción <strong>borrará permanentemente</strong> el registro del aspirante de la base de datos y no se podrá deshacer. 
              Si solo quieres ocultarlo del pipeline, te sugerimos utilizar la opción de <strong>Archivar</strong>. ¿Estás seguro que deseas eliminarlo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBorrar} className="bg-destructive hover:bg-destructive/90">
              Sí, eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
