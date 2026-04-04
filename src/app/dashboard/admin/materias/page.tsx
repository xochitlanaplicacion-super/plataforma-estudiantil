"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, ListTree, FileText, Sparkles, ChevronRight, Plus, Edit, Trash2, Loader2, ArrowLeft, AlertCircle, Youtube, Video, PlusCircle, ExternalLink } from 'lucide-react';
import { getNiveles, getCarreras, getMaterias, getUnidades, getTemas, getEjercicios, upsertMateria, upsertUnidad, upsertTema, upsertEjercicio, deleteMateria, deleteUnidad, deleteTema, deleteEjercicio } from '@/lib/actions/academic';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function MateriasUnidades() {
  const { toast } = useToast();
  const [niveles, setNiveles] = useState<any[]>([]);
  const [carreras, setCarreras] = useState<any[]>([]);
  const [selNivel, setSelNivel] = useState('');
  const [selCarrera, setSelCarrera] = useState('');

  // Drill down states
  const [materias, setMaterias] = useState<any[]>([]);
  const [selectedMateria, setSelectedMateria] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [selectedUnidad, setSelectedUnidad] = useState<any>(null);
  const [temas, setTemas] = useState<any[]>([]);
  const [selectedTema, setSelectedTema] = useState<any>(null);
  const [ejercicios, setEjercicios] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState('materias');

  // Dialog State
  const [dialog, setDialog] = useState<any>({ open: false, type: '', data: {} });

  // Safe Delete State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState<any>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  useEffect(() => {
    getNiveles().then(({ data }) => data && setNiveles(data));
  }, []);

  useEffect(() => {
    if (selNivel) getCarreras(selNivel).then(({ data }) => data && setCarreras(data));
    setSelCarrera('');
    setSelectedMateria(null);
  }, [selNivel]);

  useEffect(() => {
    if (selCarrera) {
      setLoading(true);
      getMaterias(selCarrera).then(({ data }) => {
        data && setMaterias(data);
        setLoading(false);
      });
    }
  }, [selCarrera]);

  const fetchUnidades = async (mId: string) => {
    const { data } = await getUnidades(mId);
    if (data) setUnidades(data);
  };

  const fetchTemas = async (uId: string) => {
    const { data } = await getTemas(uId);
    if (data) setTemas(data);
  };

  const fetchEjercicios = async (tId: string) => {
    const { data } = await getEjercicios(tId);
    if (data) setEjercicios(data);
  };

  const handleSave = async () => {
    let result;
    const d = dialog.data;
    if (dialog.type === 'materia') result = await upsertMateria({...d, carrera_id: selCarrera});
    if (dialog.type === 'unidad') result = await upsertUnidad({...d, materia_id: selectedMateria.id});
    if (dialog.type === 'tema') result = await upsertTema({...d, unidad_id: selectedUnidad.id});
    if (dialog.type === 'ejercicio') result = await upsertEjercicio({...d, tema_id: selectedTema.id});

    if (result && !result.error) {
      toast({ title: "Guardado con éxito" });
      setDialog({ ...dialog, open: false });
      if (dialog.type === 'materia') getMaterias(selCarrera).then(r => r.data && setMaterias(r.data));
      if (dialog.type === 'unidad') fetchUnidades(selectedMateria.id);
      if (dialog.type === 'tema') fetchTemas(selectedUnidad.id);
      if (dialog.type === 'ejercicio') fetchEjercicios(selectedTema.id);
    }
  };

  const promptDelete = (type: string, id: string, title?: string) => {
    setDeleteConfirmData({ type, id, title: title || 'este elemento' });
    setDeleteConfirmInput('');
    setDeleteConfirmOpen(true);
  };

  const executeDelete = async () => {
    if (!deleteConfirmData) return;
    const { type, id } = deleteConfirmData;
    let error;
    if (type === 'materia') ({ error } = await deleteMateria(id));
    if (type === 'unidad') ({ error } = await deleteUnidad(id));
    if (type === 'tema') ({ error } = await deleteTema(id));
    if (type === 'ejercicio') ({ error } = await deleteEjercicio(id));

    if (!error) {
      toast({ title: "Eliminado con éxito", variant: "default" });
      if (type === 'materia') { getMaterias(selCarrera).then(r => r.data && setMaterias(r.data)); setSelectedMateria(null); }
      if (type === 'unidad') { fetchUnidades(selectedMateria.id); setSelectedUnidad(null); }
      if (type === 'tema') { fetchTemas(selectedUnidad.id); setSelectedTema(null); }
      if (type === 'ejercicio') fetchEjercicios(selectedTema.id);
      setDeleteConfirmOpen(false);
      setDialog({ ...dialog, open: false });
    } else {
      toast({ 
        title: "Error al borrar", 
        description: error.message || "Existen registros dependientes. Asegúrate de tener activa la opción de Borrado en Cascada.", 
        variant: "destructive" 
      });
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Materias y Contenidos</h2>
          <p className="text-muted-foreground">Estructura el plan de estudios paso a paso.</p>
        </div>
      </div>

      <Card className="bg-primary/5 border-primary/10">
        <CardContent className="pt-6 flex flex-col md:flex-row gap-4">
          <Select value={selNivel} onValueChange={setSelNivel}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Nivel Educativo" /></SelectTrigger>
            <SelectContent>{niveles.map(n => <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selCarrera} onValueChange={setSelCarrera} disabled={!selNivel}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Programa / Carrera" /></SelectTrigger>
            <SelectContent>{carreras.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selCarrera ? (
        <div className="py-20 text-center text-muted-foreground italic border-2 border-dashed rounded-[40px] bg-white">
          Selecciona una carrera para comenzar a gestionar sus materias.
        </div>
      ) : (
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-12 bg-muted/50 rounded-2xl p-1">
            <TabsTrigger value="materias" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Materias</TabsTrigger>
            <TabsTrigger value="unidades" disabled={!selectedMateria} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Unidades</TabsTrigger>
            <TabsTrigger value="temas" disabled={!selectedUnidad} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Temas</TabsTrigger>
            <TabsTrigger value="ejercicios" disabled={!selectedTema} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Ejercicios</TabsTrigger>
          </TabsList>

          <TabsContent value="materias" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2"><BookOpen size={18} /> Plan de Estudios</CardTitle>
                  <CardDescription>Materias oficiales de la carrera.</CardDescription>
                </div>
                <Button size="sm" onClick={() => setDialog({ open: true, type: 'materia', data: { nombre: '', clave: '' } })}>
                  <Plus size={16} /> Nueva Materia
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {materias.map(m => (
                    <div 
                      key={m.id} 
                      onClick={() => { setSelectedMateria(m); fetchUnidades(m.id); setCurrentTab('unidades'); }}
                      className={`p-5 rounded-2xl border-2 transition-all cursor-pointer group flex items-center justify-between ${selectedMateria?.id === m.id ? 'border-primary bg-primary/5 shadow-md' : 'border-slate-100 hover:border-primary/30'}`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter">{m.clave || 'SIN CLAVE'}</span>
                        <span className="font-black text-sm">{m.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'materia', data: m }); }}>
                          <Edit size={12}/>
                        </Button>
                        <ChevronRight className={`transition-transform ${selectedMateria?.id === m.id ? 'translate-x-1 text-primary' : 'text-slate-300'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unidades" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentTab('materias')} className="mb-2 -ml-2 text-primary">
                    <ArrowLeft size={14} className="mr-1" /> Volver a Materias
                  </Button>
                  <CardTitle className="text-lg flex items-center gap-2"><ListTree size={18} /> Unidades de {selectedMateria?.nombre}</CardTitle>
                </div>
                <Button size="sm" onClick={() => setDialog({ open: true, type: 'unidad', data: { titulo: '', orden: unidades.length + 1 } })}>
                  <Plus size={16} /> Nueva Unidad
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {unidades.map(u => (
                    <div 
                      key={u.id} 
                      onClick={() => { setSelectedUnidad(u); fetchTemas(u.id); setCurrentTab('temas'); }}
                      className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${selectedUnidad?.id === u.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{u.orden}</span>
                        <span className="font-bold">{u.titulo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'unidad', data: u }); }}><Edit size={14}/></Button>
                         <ChevronRight size={16} className="text-slate-300" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="temas" className="mt-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between">
                 <div>
                   <Button variant="ghost" size="sm" onClick={() => setCurrentTab('unidades')} className="mb-2 -ml-2 text-primary">
                     <ArrowLeft size={14} className="mr-1" /> Volver a Unidades
                   </Button>
                   <CardTitle className="text-lg">Temas de {selectedUnidad?.titulo}</CardTitle>
                 </div>
                 <Button size="sm" onClick={() => setDialog({ open: true, type: 'tema', data: { titulo: '', contenido: '', orden: temas.length + 1 } })}>
                    <Plus size={16} /> Nuevo Tema
                 </Button>
               </CardHeader>
               <CardContent>
                 <div className="space-y-2">
                   {temas.map(t => (
                     <div key={t.id} onClick={() => { setSelectedTema(t); fetchEjercicios(t.id); setCurrentTab('ejercicios'); }} className="p-4 border rounded-xl flex items-center justify-between cursor-pointer hover:bg-muted/30">
                       <span className="font-medium">{t.titulo}</span>
                       <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'tema', data: t }); }}><Edit size={14}/></Button>
                         <ChevronRight size={16} />
                       </div>
                     </div>
                   ))}
                 </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="ejercicios" className="mt-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between">
                 <div>
                   <Button variant="ghost" size="sm" onClick={() => setCurrentTab('temas')} className="mb-2 -ml-2 text-primary">
                     <ArrowLeft size={14} className="mr-1" /> Volver a Temas
                   </Button>
                   <CardTitle className="text-lg flex items-center gap-2"><Sparkles size={18} className="text-amber-500" /> Ejercicios de {selectedTema?.titulo}</CardTitle>
                 </div>
                 <Button size="sm" onClick={() => setDialog({ open: true, type: 'ejercicio', data: { titulo: '', descripcion: '', orden: ejercicios.length + 1 } })}>
                    <Plus size={16} /> Actividad
                 </Button>
               </CardHeader>
               <CardContent>
                 <Table>
                   <TableHeader><TableRow><TableHead>Orden</TableHead><TableHead>Actividad</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                   <TableBody>
                     {ejercicios.map(e => (
                       <TableRow key={e.id}>
                         <TableCell>{e.orden}</TableCell>
                         <TableCell className="font-bold">{e.titulo}</TableCell>
                         <TableCell className="text-right">
                           <div className="flex justify-end gap-1">
                             <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, type: 'ejercicio', data: e })}><Edit size={14}/></Button>
                             <Button variant="ghost" size="icon" className="text-destructive" onClick={() => promptDelete('ejercicio', e.id, e.titulo)}><Trash2 size={14}/></Button>
                           </div>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* GLOBAL ACADEMIC DIALOG */}
      <Dialog open={dialog.open} onOpenChange={o => setDialog({...dialog, open: o})}>
        <DialogContent>
          <DialogHeader><DialogTitle className="capitalize">Gestionar {dialog.type}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
               <label className="text-xs font-bold uppercase">Nombre / Título</label>
               <Input 
                 value={dialog.data.nombre || dialog.data.titulo || ''} 
                 onChange={e => {
                   const val = e.target.value.toUpperCase();
                   if (dialog.type === 'materia') setDialog({...dialog, data: {...dialog.data, nombre: val}});
                   else setDialog({...dialog, data: {...dialog.data, titulo: val}});
                 }} 
               />
             </div>
             {(dialog.type === 'materia' || dialog.type === 'unidad' || dialog.type === 'tema' || dialog.type === 'ejercicio') && (
               <div className="space-y-2">
                 <label className="text-xs font-bold uppercase">{dialog.type === 'materia' ? 'Clave' : 'Orden'}</label>
                 <Input 
                   type={dialog.type === 'materia' ? 'text' : 'number'}
                   value={dialog.type === 'materia' ? (dialog.data.clave || '') : (dialog.data.orden || 1)} 
                   onChange={e => {
                     const val = e.target.value;
                     if (dialog.type === 'materia') setDialog({...dialog, data: {...dialog.data, clave: val.toUpperCase()}});
                     else setDialog({...dialog, data: {...dialog.data, orden: parseInt(val)}});
                   }} 
                 />
               </div>
             )}

             {dialog.type === 'tema' && (
               <div className="space-y-4 pt-4 border-t border-slate-100">
                 <div className="flex items-center justify-between">
                   <label className="text-xs font-bold uppercase flex items-center gap-2"><Youtube size={14} className="text-red-500" /> Videos del Tema</label>
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="h-7 px-2 rounded-lg font-bold uppercase text-[9px] gap-1 border-primary/20 text-primary hover:bg-primary/5"
                     onClick={() => {
                       const currentVideos = Array.isArray(dialog.data.videos) ? dialog.data.videos : [];
                       setDialog({...dialog, data: {...dialog.data, videos: [...currentVideos, { titulo: '', url: '', descripcion: '' }]}});
                     }}
                   >
                     <PlusCircle size={12} /> Añadir
                   </Button>
                 </div>
                 <div className="space-y-3">
                   {(!dialog.data.videos || dialog.data.videos.length === 0) ? (
                     <p className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50 rounded-xl border border-dashed">No hay videos vinculados.</p>
                   ) : (
                     dialog.data.videos.map((vid: any, idx: number) => (
                       <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2 relative">
                         <button 
                           className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                           onClick={() => {
                             const newVideos = [...dialog.data.videos];
                             newVideos.splice(idx, 1);
                             setDialog({...dialog, data: {...dialog.data, videos: newVideos}});
                           }}
                         >
                           <Trash2 size={12} />
                         </button>
                         <div className="grid grid-cols-1 gap-2 pr-6">
                           <Input placeholder="Título del Video" className="h-8 text-[11px] font-bold" value={vid.titulo || ''} onChange={e => {
                             const newV = [...dialog.data.videos]; newV[idx].titulo = e.target.value; setDialog({...dialog, data: {...dialog.data, videos: newV}});
                           }} />
                           <div className="relative">
                             <Input placeholder="URL YouTube/Vimeo" className="h-8 text-[11px] pl-7" value={vid.url || ''} onChange={e => {
                               const newV = [...dialog.data.videos]; newV[idx].url = e.target.value; setDialog({...dialog, data: {...dialog.data, videos: newV}});
                             }} />
                             <ExternalLink className="absolute left-2 top-2 text-slate-300" size={12} />
                           </div>
                           <Input placeholder="Descripción (opcional)" className="h-8 text-[11px] italic" value={vid.descripcion || ''} onChange={e => {
                             const newV = [...dialog.data.videos]; newV[idx].descripcion = e.target.value; setDialog({...dialog, data: {...dialog.data, videos: newV}});
                           }} />
                         </div>
                       </div>
                     ))
                   )}
                 </div>
               </div>
             )}
          </div>
          <DialogFooter>
             {dialog.data.id && (
               <Button variant="ghost" className="text-destructive mr-auto" onClick={() => { promptDelete(dialog.type, dialog.data.id, dialog.data.titulo || dialog.data.nombre); setDialog({...dialog, open: false}); }}>Eliminar</Button>
             )}
             <Button onClick={handleSave}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE CONFIRMACIÓN DE BORRADO SEGURO */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto rounded-[32px] p-6 sm:p-8 border-none shadow-2xl custom-scrollbar">
          <DialogHeader className="flex flex-col items-center text-center">
            <div className="h-20 w-20 bg-destructive/10 text-destructive rounded-3xl flex items-center justify-center mb-6 rotate-3">
              <AlertCircle size={40} />
            </div>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight text-slate-800">¿Estás seguro?</DialogTitle>
            <DialogDescription className="text-slate-500 text-lg leading-relaxed pt-4">
              Estás a punto de borrar irremediablemente este elemento: 
              <span className="font-black text-slate-900 block my-3 text-xl italic underline decoration-destructive/30">"{deleteConfirmData?.title}"</span>
              Esta acción eliminará <span className="text-destructive font-black underline">TODO</span> el contenido atado a él (unidades, asignaciones, ejercicios, entregas de alumnos) y <span className="font-black text-slate-900">no se puede deshacer.</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-8">
            <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] text-center mb-4">
                Escribe <span className="text-destructive">BORRAR</span> para confirmar
              </p>
              <Input 
                value={deleteConfirmInput} 
                onChange={e => setDeleteConfirmInput(e.target.value)}
                placeholder="BORRAR"
                className="h-16 text-center text-2xl font-black tracking-[0.5em] uppercase border-none bg-white shadow-inner focus-visible:ring-destructive rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-4">
            <Button variant="ghost" className="flex-1 rounded-2xl h-16 font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600" onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button 
              variant="destructive" 
              className="flex-1 rounded-2xl h-16 font-black uppercase tracking-widest gap-3 shadow-xl shadow-destructive/20 disabled:opacity-20 transition-all active:scale-95"
              disabled={deleteConfirmInput !== 'BORRAR'}
              onClick={executeDelete}
            >
              <Trash2 size={20} /> Confirmar Destrucción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
