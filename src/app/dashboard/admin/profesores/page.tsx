
"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GraduationCap, Plus, Trash2, Edit, Loader2, UserCheck, School, BookOpen, Layers, Users } from 'lucide-react';
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
import { cn } from '@/lib/utils';

export default function AsignacionProfesores() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);
  
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

  // Auxiliar para multiselección
  const [selGrados, setSelGrados] = useState<string[]>([]);
  const [selGrupos, setSelGrupos] = useState<string[]>([]);

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

  const handleEdit = (asig: any) => {
    setSelGrados(asig.grado_id ? asig.grado_id.split(',').filter(Boolean) : []);
    setSelGrupos(asig.grupo_id ? asig.grupo_id.split(',').filter(Boolean) : []);
    setDialog({
      open: true,
      data: {
        id: asig.id,
        profesor_id: asig.profesor_id,
        nivel_id: asig.nivel_id,
        carrera_id: asig.carrera_id,
        materia_id: asig.materia_id,
        grado_id: asig.grado_id,
        grupo_id: asig.grupo_id,
        activo: asig.activo
      }
    });
  };

  const toggleSelection = (id: string, type: 'grado' | 'grupo') => {
    if (type === 'grado') {
      setSelGrados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      setSelGrupos(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    }
  };

  const handleSave = async () => {
    if (!dialog.data.profesor_id || !dialog.data.nivel_id || !dialog.data.carrera_id || !dialog.data.materia_id) {
      toast({ variant: "destructive", title: "Campos incompletos", description: "Profesor, Nivel, Carrera y Materia son obligatorios." });
      return;
    }

    const finalData = {
      ...dialog.data,
      grado_id: selGrados.join(','),
      grupo_id: selGrupos.join(',')
    };

    const { error } = await upsertAsignacionProfesor(finalData);
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
          <p className="text-muted-foreground">Gestiona privilegios de acceso múltiples para docentes.</p>
        </div>
        <Button className="gap-2" onClick={() => {
          setSelGrados([]);
          setSelGrupos([]);
          setDialog({ open: true, data: { id: '', profesor_id: '', nivel_id: '', carrera_id: '', grado_id: '', grupo_id: '', materia_id: '', activo: true } });
        }}>
          <Plus size={18} /> Nueva Asignación
        </Button>
      </div>

      <Card className="shadow-sm border-muted/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary h-8 w-8" /></div>
          ) : asignaciones.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground italic border-2 border-dashed m-6 rounded-3xl">
              No hay asignaciones registradas.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold">Profesor</TableHead>
                  <TableHead className="font-bold">Nivel / Carrera</TableHead>
                  <TableHead className="font-bold">Grados / Grupos</TableHead>
                  <TableHead className="font-bold">Materia</TableHead>
                  <TableHead className="text-right font-bold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {asignaciones.map((asig) => (
                  <TableRow key={asig.id} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="font-bold">{asig.profiles?.nombre} {asig.profiles?.apellidos}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold uppercase text-primary">{asig.niveles?.nombre}</span>
                        <span className="text-[10px] text-muted-foreground">{asig.carreras?.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[9px] font-bold">
                          {asig.grado_id ? `${asig.grado_id.split(',').length} Grados` : 'General'}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] font-bold">
                          {asig.grupo_id ? `${asig.grupo_id.split(',').length} Grupos` : 'Todos'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                        {asig.materias?.nombre}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleEdit(asig)}>
                          <Edit size={14} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                              <Trash2 size={14} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar asignación?</AlertDialogTitle>
                              <AlertDialogDescription>El profesor perderá el acceso para gestionar esta materia y sus contenidos asignados.</AlertDialogDescription>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>{dialog.data.id ? 'Editar' : 'Nueva'} Asignación Académica</DialogTitle>
            <DialogDescription>Asigna múltiples grupos y grados a un docente.</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 px-6 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
              {/* Selectores Básicos */}
              <div className="space-y-4">
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
                  <Select value={dialog.data.nivel_id} onValueChange={(val) => setDialog({ ...dialog, data: { ...dialog.data, nivel_id: val, carrera_id: '', materia_id: '' } })}>
                    <SelectTrigger><SelectValue placeholder="Nivel" /></SelectTrigger>
                    <SelectContent>
                      {catalogos.niveles.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest">3. Carrera / Programa</label>
                  <Select value={dialog.data.carrera_id} onValueChange={(val) => {
                    setSelGrados([]);
                    setSelGrupos([]);
                    setDialog({ ...dialog, data: { ...dialog.data, carrera_id: val, materia_id: '' } });
                  }} disabled={!dialog.data.nivel_id}>
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
              </div>

              {/* Multiselectores Integrados (Solución a Transparencia) */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase text-amber-600 tracking-widest flex items-center gap-1">
                      <Layers size={12} /> 5. Grados ({selGrados.length})
                    </label>
                    <Button variant="ghost" className="h-5 text-[9px] uppercase font-bold" onClick={() => setSelGrados([])} disabled={!dialog.data.carrera_id}>Limpiar</Button>
                  </div>
                  <div className={cn(
                    "border rounded-xl bg-slate-50/50 h-[120px] overflow-hidden flex flex-col",
                    !dialog.data.carrera_id && "opacity-50 grayscale"
                  )}>
                    <ScrollArea className="flex-1 p-2">
                      <div className="space-y-1">
                        {catalogos.grados.length === 0 ? (
                          <p className="text-[10px] text-center text-muted-foreground mt-8">Sin grados disponibles</p>
                        ) : catalogos.grados.map((g: any) => (
                          <div 
                            key={g.id} 
                            className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-slate-200 group"
                            onClick={() => toggleSelection(g.id, 'grado')}
                          >
                            <Checkbox checked={selGrados.includes(g.id)} className="pointer-events-none" />
                            <span className="text-xs font-bold text-slate-700 group-hover:text-primary">{g.nombre}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase text-amber-600 tracking-widest flex items-center gap-1">
                      <Users size={12} /> 6. Grupos ({selGrupos.length})
                    </label>
                    <Button variant="ghost" className="h-5 text-[9px] uppercase font-bold" onClick={() => setSelGrupos([])} disabled={!dialog.data.carrera_id}>Limpiar</Button>
                  </div>
                  <div className={cn(
                    "border rounded-xl bg-slate-50/50 h-[120px] overflow-hidden flex flex-col",
                    !dialog.data.carrera_id && "opacity-50 grayscale"
                  )}>
                    <ScrollArea className="flex-1 p-2">
                      <div className="space-y-1">
                        {catalogos.grupos.length === 0 ? (
                          <p className="text-[10px] text-center text-muted-foreground mt-8">Sin grupos disponibles</p>
                        ) : catalogos.grupos.map((g: any) => (
                          <div 
                            key={g.id} 
                            className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-slate-200 group"
                            onClick={() => toggleSelection(g.id, 'grupo')}
                          >
                            <Checkbox checked={selGrupos.includes(g.id)} className="pointer-events-none" />
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-700 group-hover:text-primary leading-none">{g.nombre}</span>
                              <span className="text-[9px] text-muted-foreground uppercase">{g.turno}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 border-t bg-slate-50/50 gap-2">
            <Button variant="outline" onClick={() => setDialog({ ...dialog, open: false })}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-primary px-8">Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
