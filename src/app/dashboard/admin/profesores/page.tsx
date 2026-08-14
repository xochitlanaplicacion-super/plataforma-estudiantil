
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Loader2, 
  Layers, 
  Users, 
  ChevronDown, 
  UserCircle,
  BookOpen,
  School,
  GraduationCap,
  UserRoundCheck,
  ArrowRightLeft
} from 'lucide-react';
import { 
  getNiveles, 
  getCarreras, 
  getGrados, 
  getGrupos, 
  getMaterias, 
  getProfesores, 
  getAsignacionesProfesor,
  upsertAsignacionProfesor,
  deleteAsignacionProfesor,
  replaceProfesorInAssignments
} from '@/lib/actions/academic';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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

  const [replaceDialog, setReplaceDialog] = useState({
    open: false,
    oldProfesorId: '',
    oldProfesorName: '',
    newProfesorId: ''
  });

  const [selGrados, setSelGrados] = useState<string[]>([]);
  const [selGrupos, setSelGrupos] = useState<string[]>([]);
  const [replacing, setReplacing] = useState(false);

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

  // Agrupar asignaciones por profesor para la interfaz
  const groupedData = useMemo(() => {
    return profesores.map(prof => {
      const hisAsignaciones = asignaciones.filter(a => a.profesor_id === prof.id);
      return {
        ...prof,
        asignaciones: hisAsignaciones
      };
    }).sort((a, b) => (b.asignaciones.length - a.asignaciones.length)); // Profesores con más carga arriba
  }, [profesores, asignaciones]);

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
    setSelGrados(asig.grado_id ? [asig.grado_id] : []);
    setSelGrupos(asig.grupo_id ? [asig.grupo_id] : []);
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

  const handleSave = async () => {
    if (!dialog.data.profesor_id || !dialog.data.nivel_id || !dialog.data.carrera_id || !dialog.data.materia_id) {
      toast({ variant: "destructive", title: "Campos incompletos", description: "Profesor, Nivel, Carrera y Materia son obligatorios." });
      return;
    }

    // NORMALIZADO: crear 1 fila por cada combinación grupo-materia
    if (dialog.data.id) {
      // Editando una asignación existente: actualizar con el primer grupo/grado seleccionado
      const finalData = {
        ...dialog.data,
        grado_id: selGrados[0] || null,
        grupo_id: selGrupos[0] || null
      };
      const { error } = await upsertAsignacionProfesor(finalData);
      if (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la asignación." });
        return;
      }
    } else {
      // Creando nueva(s): una fila por cada grupo seleccionado
      const gruposParaCrear = selGrupos.length > 0 ? selGrupos : [null];
      let hasError = false;
      for (const grupoId of gruposParaCrear) {
        const finalData = {
          profesor_id: dialog.data.profesor_id,
          nivel_id: dialog.data.nivel_id,
          carrera_id: dialog.data.carrera_id,
          materia_id: dialog.data.materia_id,
          grado_id: selGrados[0] || null,
          grupo_id: grupoId,
          activo: dialog.data.activo
        };
        const { error } = await upsertAsignacionProfesor(finalData);
        if (error) { hasError = true; break; }
      }
      if (hasError) {
        toast({ variant: "destructive", title: "Error", description: "Hubo un problema al guardar una asignación." });
        return;
      }
    }

    toast({ title: "Asignación guardada", description: selGrupos.length > 1 ? `Se crearon ${selGrupos.length} asignaciones (una por grupo).` : undefined });
    setDialog({ ...dialog, open: false });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteAsignacionProfesor(id);
    if (!error) {
      toast({ title: "Asignación eliminada" });
      fetchData();
    }
  };

  const handleReplace = async () => {
    if (!replaceDialog.newProfesorId) {
      toast({ variant: "destructive", title: "Error", description: "Selecciona el nuevo profesor." });
      return;
    }

    setReplacing(true);
    const result = await replaceProfesorInAssignments(replaceDialog.oldProfesorId, replaceDialog.newProfesorId);
    
    if (result.success) {
      toast({ title: "Cambio realizado", description: "Toda la carga académica ha sido transferida." });
      setReplaceDialog({ ...replaceDialog, open: false, newProfesorId: '' });
      fetchData();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error });
    }
    setReplacing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Carga Académica Docente</h2>
          <p className="text-muted-foreground">Gestiona las materias y grupos asignados por profesor.</p>
        </div>
        <Button className="gap-2 bg-primary shadow-lg hover:scale-105 transition-transform" onClick={() => {
          setSelGrados([]);
          setSelGrupos([]);
          setDialog({ open: true, data: { id: '', profesor_id: '', nivel_id: '', carrera_id: '', grado_id: '', grupo_id: '', materia_id: '', activo: true } });
        }}>
          <Plus size={18} /> Nueva Asignación
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-primary h-10 w-10" />
          <p className="text-muted-foreground font-medium">Cargando directorio de profesores...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <Accordion type="single" collapsible className="space-y-4">
            {groupedData.map((prof) => (
              <AccordionItem 
                key={prof.id} 
                value={prof.id} 
                className="border rounded-2xl bg-white shadow-sm overflow-hidden border-slate-200 px-2"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-6 group">
                  <div className="flex items-center gap-4 text-left w-full">
                    <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                      <UserCircle size={28} />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-lg font-black text-slate-800 uppercase tracking-tight group-hover:text-primary transition-colors">
                        {prof.nombre} {prof.apellidos}
                      </span>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground font-medium">{prof.email}</span>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {prof.asignaciones.length} {prof.asignaciones.length === 1 ? 'ASIGNACIÓN' : 'ASIGNACIONES'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-2">
                  <div className="flex justify-end mb-4">
                    {prof.asignaciones.length > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                        onClick={() => setReplaceDialog({ 
                          open: true, 
                          oldProfesorId: prof.id, 
                          oldProfesorName: `${prof.nombre} ${prof.apellidos}`,
                          newProfesorId: '' 
                        })}
                      >
                        <ArrowRightLeft size={14} /> Reemplazar Profesor
                      </Button>
                    )}
                  </div>

                  {prof.asignaciones.length === 0 ? (
                    <div className="bg-slate-50 border-2 border-dashed rounded-xl p-8 text-center">
                      <p className="text-sm text-muted-foreground italic">Este profesor no tiene materias o grupos asignados todavía.</p>
                      <Button 
                        variant="link" 
                        className="mt-2 text-primary font-bold text-xs"
                        onClick={() => {
                          setSelGrados([]);
                          setSelGrupos([]);
                          setDialog({ open: true, data: { id: '', profesor_id: prof.id, nivel_id: '', carrera_id: '', grado_id: '', grupo_id: '', materia_id: '', activo: true } });
                        }}
                      >
                        + Crear primera asignación
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {prof.asignaciones.map((asig: any) => (
                        <Card key={asig.id} className="border-slate-200 shadow-none hover:shadow-md transition-all group overflow-hidden">
                          <div className="h-1 bg-primary w-full opacity-20 group-hover:opacity-100 transition-opacity" />
                          <CardHeader className="p-4 pb-2 flex flex-row justify-between items-start space-y-0">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-primary uppercase tracking-widest">{asig.niveles?.nombre}</span>
                              <CardTitle className="text-sm font-bold mt-1 line-clamp-1">{asig.materias?.nombre}</CardTitle>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => handleEdit(asig)}>
                                <Edit size={14} />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                    <Trash2 size={14} />
                                  </Button>
                                </AlertDialogTrigger>
                                <AccordionItem value="delete-confirm" className="border-none">
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Retirar asignatura?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Se eliminará el acceso del profesor para gestionar la materia <strong>{asig.materias?.nombre}</strong>.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction className="bg-destructive" onClick={() => handleDelete(asig.id)}>Eliminar</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AccordionItem>
                              </AlertDialog>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-0 space-y-3">
                            <div className="flex flex-col text-[11px] text-muted-foreground bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <span className="font-bold text-slate-600 uppercase text-[9px] mb-1">Carrera / Programa:</span>
                              <span className="font-medium text-slate-800">{asig.carreras?.nombre}</span>
                            </div>
                            
                            {asig.grupos ? (
                              <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px] shrink-0 mt-0.5">G</span>
                                <p className="text-[10px] font-bold text-primary/80 uppercase leading-snug break-words">
                                  {asig.grupos.grados?.nombre ? `${asig.grupos.grados.nombre} - ` : ''}{asig.grupos.nombre}
                                </p>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {asig.grado_id ? (
                                  <Badge variant="outline" className="text-[9px] bg-amber-50 border-amber-200 text-amber-700">Grado General</Badge>
                                ) : <Badge variant="outline" className="text-[9px] bg-slate-50">Gral.</Badge>}
                                <Badge variant="secondary" className="text-[9px]">Todos los grupos</Badge>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                      <button 
                        onClick={() => {
                          setSelGrados([]);
                          setSelGrupos([]);
                          setDialog({ open: true, data: { id: '', profesor_id: prof.id, nivel_id: '', carrera_id: '', grado_id: '', grupo_id: '', materia_id: '', activo: true } });
                        }}
                        className="border-2 border-dashed rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:bg-slate-50 hover:text-primary transition-all py-8"
                      >
                        <Plus size={16} /> <span className="text-xs font-bold uppercase">Asignar Materia</span>
                      </button>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* DIÁLOGO DE REEMPLAZO */}
      <Dialog open={replaceDialog.open} onOpenChange={(o) => setReplaceDialog({ ...replaceDialog, open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="text-amber-600" size={20} /> Reemplazo Masivo
            </DialogTitle>
            <DialogDescription>
              Se transferirán todas las materias y grupos de <strong>{replaceDialog.oldProfesorName}</strong> a un nuevo docente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-primary tracking-widest">Seleccionar Nuevo Profesor</label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                value={replaceDialog.newProfesorId} 
                onChange={(e) => setReplaceDialog({ ...replaceDialog, newProfesorId: e.target.value })}
              >
                <option value="">Elegir docente para el relevo...</option>
                {profesores.filter(p => p.id !== replaceDialog.oldProfesorId).map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
                ))}
              </select>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 leading-relaxed">
              <strong>Nota:</strong> Este proceso actualizará todas las asignaciones vinculadas. El profesor original quedará sin carga y podrá ser dado de baja del sistema sin errores.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReplaceDialog({ ...replaceDialog, open: false })}>Cancelar</Button>
            <Button 
              className="bg-primary px-8" 
              disabled={!replaceDialog.newProfesorId || replacing}
              onClick={handleReplace}
            >
              {replacing ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar Relevo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE ASIGNACIÓN */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <School className="text-primary" size={20} />
              {dialog.data.id ? 'Editar' : 'Nueva'} Asignación Académica
            </DialogTitle>
            <DialogDescription>Configura los privilegios de acceso para el docente seleccionado.</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 px-6 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest">1. Profesor</label>
                  <select 
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={dialog.data.profesor_id} 
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, profesor_id: e.target.value } })}
                  >
                    <option value="">Seleccionar Docente...</option>
                    {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest">2. Nivel Educativo</label>
                  <select 
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={dialog.data.nivel_id} 
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, nivel_id: e.target.value, carrera_id: '', materia_id: '' } })}
                  >
                    <option value="">Seleccionar Nivel...</option>
                    {catalogos.niveles.map((n: any) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest">3. Carrera / Programa</label>
                  <select 
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                    disabled={!dialog.data.nivel_id}
                    value={dialog.data.carrera_id} 
                    onChange={(e) => {
                      setSelGrados([]);
                      setSelGrupos([]);
                      setDialog({ ...dialog, data: { ...dialog.data, carrera_id: e.target.value, materia_id: '' } });
                    }} 
                  >
                    <option value="">Seleccionar Carrera...</option>
                    {catalogos.carreras.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest">4. Materia Específica</label>
                  <select 
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                    disabled={!dialog.data.carrera_id}
                    value={dialog.data.materia_id} 
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, materia_id: e.target.value } })}
                  >
                    <option value="">Seleccionar Materia...</option>
                    {catalogos.materias.map((m: any) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>

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
                            onClick={(e) => {
                              e.preventDefault();
                              setSelGrados(prev => prev.includes(g.id) ? prev.filter(i => i !== g.id) : [...prev, g.id]);
                            }}
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
                            onClick={(e) => {
                              e.preventDefault();
                              setSelGrupos(prev => prev.includes(g.id) ? prev.filter(i => i !== g.id) : [...prev, g.id]);
                            }}
                          >
                            <Checkbox checked={selGrupos.includes(g.id)} className="pointer-events-none" />
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-700 group-hover:text-primary leading-none">{g.nombre}</span>
                              <span className="text-[9px] text-muted-foreground uppercase mt-1">{g.turno}</span>
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
