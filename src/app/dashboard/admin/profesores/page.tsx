
"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, Plus, Trash2, Loader2, UserCheck, School, BookOpen } from 'lucide-react';
import { 
  getNiveles, 
  getCarreras, 
  getGrados, 
  getGrupos, 
  getMaterias, 
  getProfesores, 
  getAsignacionesProfesor,
  upsertAsignacionProfesor,
  deleteAsignacionProfesor 
} from '@/lib/actions/academic';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function AsignacionProfesores() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);
  
  // Catalogos para el dialogo
  const [catalogos, setCatalogos] = useState<any>({
    niveles: [],
    carreras: [],
    grados: [],
    grupos: [],
    materias: []
  });

  const [dialog, setDialog] = useState({ 
    open: false, 
    data: { 
      id: '', 
      profesor_id: '', 
      nivel_id: '', 
      carrera_id: '', 
      grado_id: '', 
      grupo_id: '', 
      materia_id: '',
      activo: true
    } 
  });

  const fetchData = async () => {
    setLoading(true);
    const [asig, prof, niv] = await Promise.all([
      getAsignacionesProfesor(),
      getProfesores(),
      getNiveles()
    ]);
    if (asig.data) setAsignaciones(asig.data);
    if (prof.data) setProfesores(prof.data);
    if (niv.data) setCatalogos((prev: any) => ({ ...prev, niveles: niv.data }));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Efectos para cargar catalogos dependientes en el dialogo
  useEffect(() => {
    if (dialog.data.nivel_id) {
      getCarreras(dialog.data.nivel_id).then(r => r.data && setCatalogos((p: any) => ({ ...p, carreras: r.data })));
    } else {
      setCatalogos((p: any) => ({ ...p, carreras: [], grados: [], grupos: [], materias: [] }));
    }
  }, [dialog.data.nivel_id]);

  useEffect(() => {
    if (dialog.data.carrera_id) {
      Promise.all([
        getGrados(dialog.data.carrera_id),
        getGrupos(dialog.data.carrera_id),
        getMaterias(dialog.data.carrera_id)
      ]).then(([gr, gp, mt]) => {
        setCatalogos((p: any) => ({ 
          ...p, 
          grados: gr.data || [], 
          grupos: gp.data || [], 
          materias: mt.data || [] 
        }));
      });
    }
  }, [dialog.data.carrera_id]);

  const handleSave = async () => {
    if (!dialog.data.profesor_id || !dialog.data.nivel_id || !dialog.data.carrera_id || !dialog.data.materia_id) {
      toast({ variant: "destructive", title: "Error", description: "Completa los campos obligatorios (Profesor, Nivel, Carrera, Materia)." });
      return;
    }

    const { error } = await upsertAsignacionProfesor(dialog.data);
    if (!error) {
      toast({ title: "Asignación guardada" });
      setDialog({ ...dialog, open: false });
      fetchData();
    } else {
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la asignación." });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteAsignacionProfesor(id);
    if (!error) {
      toast({ title: "Asignación eliminada" });
      fetchData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Asignación de Profesores</h2>
          <p className="text-muted-foreground">Gestiona qué docentes tienen acceso a qué materias y grupos.</p>
        </div>
        <Button className="gap-2" onClick={() => setDialog({ open: true, data: { id: '', profesor_id: '', nivel_id: '', carrera_id: '', grado_id: '', grupo_id: '', materia_id: '', activo: true } })}>
          <Plus size={18} /> Nueva Asignación
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><UserCheck size={20} className="text-primary" /> Docentes Asignados</CardTitle>
          <CardDescription>Lista de privilegios de acceso para la creación de contenidos.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary h-8 w-8" /></div>
          ) : asignaciones.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground italic border-2 border-dashed rounded-3xl">
              No hay asignaciones registradas. Haz clic en "Nueva Asignación" para comenzar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profesor</TableHead>
                  <TableHead>Nivel / Carrera</TableHead>
                  <TableHead>Grado / Grupo</TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {asignaciones.map((asig) => (
                  <TableRow key={asig.id}>
                    <TableCell className="font-bold">
                      {asig.profiles?.nombre} {asig.profiles?.apellidos}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold uppercase text-primary">{asig.niveles?.nombre}</span>
                        <span className="text-[10px] text-muted-foreground">{asig.carreras?.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-[10px]">{asig.grados?.nombre || 'Independiente'}</span>
                        <span className="text-[10px] font-bold text-muted-foreground">{asig.grupos?.nombre || 'General'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">
                        {asig.materias?.nombre}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={asig.activo ? "default" : "secondary"}>
                        {asig.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                              <Trash2 size={14} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar asignación?</AlertDialogTitle>
                              <AlertDialogDescription>El profesor perderá el acceso para gestionar esta materia y sus contenidos.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive" onClick={() => handleDelete(asig.id)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva Asignación de Profesor</DialogTitle>
            <DialogDescription>Define el alcance de acceso para el docente seleccionado.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-primary tracking-widest">1. Profesor</label>
              <Select value={dialog.data.profesor_id} onValueChange={(val) => setDialog({ ...dialog, data: { ...dialog.data, profesor_id: val } })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar Docente" /></SelectTrigger>
                <SelectContent>
                  {profesores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} {p.apellidos}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-primary tracking-widest">2. Nivel Educativo</label>
              <Select value={dialog.data.nivel_id} onValueChange={(val) => setDialog({ ...dialog, data: { ...dialog.data, nivel_id: val, carrera_id: '', grado_id: '', grupo_id: '', materia_id: '' } })}>
                <SelectTrigger><SelectValue placeholder="Nivel" /></SelectTrigger>
                <SelectContent>
                  {catalogos.niveles.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-primary tracking-widest">3. Carrera / Programa</label>
              <Select value={dialog.data.carrera_id} onValueChange={(val) => setDialog({ ...dialog, data: { ...dialog.data, carrera_id: val, grado_id: '', grupo_id: '', materia_id: '' } })} disabled={!dialog.data.nivel_id}>
                <SelectTrigger><SelectValue placeholder="Carrera" /></SelectTrigger>
                <SelectContent>
                  {catalogos.carreras.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-primary tracking-widest">4. Materia Específica</label>
              <Select value={dialog.data.materia_id} onValueChange={(val) => setDialog({ ...dialog, data: { ...dialog.data, materia_id: val } })} disabled={!dialog.data.carrera_id}>
                <SelectTrigger><SelectValue placeholder="Materia" /></SelectTrigger>
                <SelectContent>
                  {catalogos.materias.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">5. Grado (Opcional)</label>
              <Select value={dialog.data.grado_id || 'ninguno'} onValueChange={(val) => setDialog({ ...dialog, data: { ...dialog.data, grado_id: val === 'ninguno' ? '' : val } })} disabled={!dialog.data.carrera_id}>
                <SelectTrigger><SelectValue placeholder="Grado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Cualquiera / Independiente</SelectItem>
                  {catalogos.grados.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">6. Grupo (Opcional)</label>
              <Select value={dialog.data.grupo_id || 'ninguno'} onValueChange={(val) => setDialog({ ...dialog, data: { ...dialog.data, grupo_id: val === 'ninguno' ? '' : val } })} disabled={!dialog.data.carrera_id}>
                <SelectTrigger><SelectValue placeholder="Grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Todos los grupos</SelectItem>
                  {catalogos.grupos.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ ...dialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-primary">Guardar Asignación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
