"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BookOpen, 
  ListTree, 
  FileText, 
  Sparkles, 
  ChevronRight, 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  ArrowLeft,
  Users,
  GraduationCap
} from 'lucide-react';
import { 
  getMyAsignaciones, 
  getUnidades, 
  getTemas, 
  getEjercicios, 
  upsertUnidad, 
  upsertTema, 
  upsertEjercicio, 
  deleteUnidad, 
  deleteTema, 
  deleteEjercicio 
} from '@/lib/actions/academic';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ProfesorDashboard() {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  
  // Drill down states
  const [selectedMateria, setSelectedMateria] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [selectedUnidad, setSelectedUnidad] = useState<any>(null);
  const [temas, setTemas] = useState<any[]>([]);
  const [selectedTema, setSelectedTema] = useState<any>(null);
  const [ejercicios, setEjercicios] = useState<any[]>([]);

  const [currentTab, setCurrentTab] = useState('materias');
  const [dialog, setDialog] = useState<any>({ open: false, type: '', data: {} });

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await getMyAsignaciones(user.id);
      if (data) setAsignaciones(data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchInitialData(); }, []);

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
    if (!selectedMateria?.id && dialog.type === 'unidad') return;
    
    try {
      if (dialog.type === 'unidad') result = await upsertUnidad({...d, materia_id: selectedMateria.id});
      if (dialog.type === 'tema') result = await upsertTema({...d, unidad_id: selectedUnidad.id});
      if (dialog.type === 'ejercicio') result = await upsertEjercicio({...d, tema_id: selectedTema.id});

      if (result && !result.error) {
        toast({ title: "Guardado con éxito" });
        setDialog({ ...dialog, open: false });
        if (dialog.type === 'unidad') fetchUnidades(selectedMateria.id);
        if (dialog.type === 'tema') fetchTemas(selectedUnidad.id);
        if (dialog.type === 'ejercicio') fetchEjercicios(selectedTema.id);
      } else {
        toast({ variant: "destructive", title: "Error", description: result?.error?.message || "No se pudo guardar." });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (type: string, id: string) => {
    let error;
    if (type === 'unidad') ({ error } = await deleteUnidad(id));
    if (type === 'tema') ({ error } = await deleteTema(id));
    if (type === 'ejercicio') ({ error } = await deleteEjercicio(id));

    if (!error) {
      toast({ title: "Eliminado correctamente" });
      if (type === 'unidad') { fetchUnidades(selectedMateria.id); setSelectedUnidad(null); }
      if (type === 'tema') { fetchTemas(selectedUnidad.id); setSelectedTema(null); }
      if (type === 'ejercicio') fetchEjercicios(selectedTema.id);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-primary h-10 w-10" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Cargando mis asignaturas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black font-headline tracking-tight text-primary uppercase">Panel Docente</h2>
          <p className="text-muted-foreground font-medium">Gestiona el contenido de tus materias asignadas.</p>
        </div>
      </div>

      {asignaciones.length === 0 ? (
        <Card className="border-2 border-dashed rounded-[40px] p-20 text-center bg-white shadow-inner">
          <BookOpen className="mx-auto h-20 w-20 text-slate-200 mb-6" />
          <h3 className="text-xl font-black text-slate-800 uppercase">Sin materias asignadas</h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">
            Aún no tienes carga académica vinculada. Contacta a la dirección para habilitar tus materias.
          </p>
        </Card>
      ) : (
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-14 bg-muted/50 rounded-2xl p-1 shadow-sm border mb-8">
            <TabsTrigger value="materias" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">
              Mis Materias
            </TabsTrigger>
            <TabsTrigger value="unidades" disabled={!selectedMateria} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">
              Unidades
            </TabsTrigger>
            <TabsTrigger value="temas" disabled={!selectedUnidad} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">
              Temas
            </TabsTrigger>
            <TabsTrigger value="ejercicios" disabled={!selectedTema} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">
              Actividades
            </TabsTrigger>
          </TabsList>

          <TabsContent value="materias" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {asignaciones.map((asig) => (
                <Card 
                  key={asig.id} 
                  onClick={() => { setSelectedMateria(asig.materias); fetchUnidades(asig.materia_id); setCurrentTab('unidades'); }}
                  className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-slate-100 hover:border-primary/40 group relative overflow-hidden bg-white rounded-3xl"
                >
                  <div className="h-2 bg-primary/20 group-hover:bg-primary transition-colors" />
                  <CardHeader className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <Badge variant="outline" className="text-[9px] font-black bg-primary/5 text-primary border-primary/20 uppercase tracking-tighter">
                        {asig.niveles?.nombre}
                      </Badge>
                      <div className="p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-primary transition-colors">
                        <ChevronRight size={20} />
                      </div>
                    </div>
                    <CardTitle className="text-xl font-black text-slate-800 uppercase leading-tight group-hover:text-primary transition-colors">
                      {asig.materias?.nombre}
                    </CardTitle>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2">{asig.carreras?.nombre}</p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 pt-0 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-tighter bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <Users size={14} className="text-primary/60" />
                      GRUPOS: {asig.grupo_id ? asig.grupo_id.split(',').length : 'GENERAL'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="unidades" className="mt-0">
            <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden">
              <CardHeader className="bg-slate-50/50 pb-6 border-b">
                <div className="flex flex-row items-center justify-between">
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentTab('materias')} className="mb-2 -ml-2 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/5">
                      <ArrowLeft size={14} className="mr-1" /> Volver a Materias
                    </Button>
                    <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3">
                      <ListTree className="text-primary" size={24} /> {selectedMateria?.nombre}
                    </CardTitle>
                    <CardDescription className="text-xs font-bold uppercase tracking-tight text-slate-500 mt-1">Gestión de unidades didácticas</CardDescription>
                  </div>
                  <Button size="lg" className="rounded-2xl bg-primary text-white font-black uppercase tracking-widest gap-2 shadow-lg" onClick={() => setDialog({ open: true, type: 'unidad', data: { titulo: '', orden: unidades.length + 1 } })}>
                    <Plus size={18} /> Nueva Unidad
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {unidades.length === 0 ? (
                    <div className="py-20 text-center text-muted-foreground italic bg-slate-50 rounded-3xl border-2 border-dashed">
                      No has creado unidades para esta materia aún.
                    </div>
                  ) : unidades.map((u) => (
                    <div 
                      key={u.id} 
                      onClick={() => { setSelectedUnidad(u); fetchTemas(u.id); setCurrentTab('temas'); }}
                      className={`p-6 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all duration-300 group ${selectedUnidad?.id === u.id ? 'bg-primary/5 border-primary shadow-md' : 'border-slate-50 hover:border-primary/20 hover:bg-white hover:shadow-lg'}`}
                    >
                      <div className="flex items-center gap-6">
                        <span className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-lg shadow-lg group-hover:scale-110 transition-transform">{u.orden}</span>
                        <div className="flex flex-col">
                          <span className="font-black text-slate-800 text-lg uppercase leading-none">{u.titulo}</span>
                          <span className="text-[10px] font-bold text-slate-400 mt-2 tracking-widest uppercase">Unidad de aprendizaje</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-primary hover:bg-primary/5" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'unidad', data: u }); }}>
                           <Edit size={18}/>
                         </Button>
                         <ChevronRight size={20} className="text-slate-300 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="temas" className="mt-0">
             <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden">
               <CardHeader className="bg-slate-50/50 pb-6 border-b">
                 <div className="flex flex-row items-center justify-between">
                   <div>
                     <Button variant="ghost" size="sm" onClick={() => setCurrentTab('unidades')} className="mb-2 -ml-2 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/5">
                       <ArrowLeft size={14} className="mr-1" /> Volver a Unidades
                     </Button>
                     <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3">
                       <FileText className="text-primary" size={24} /> {selectedUnidad?.titulo}
                     </CardTitle>
                     <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Temarios y contenido didáctico</p>
                   </div>
                   <Button size="lg" className="rounded-2xl bg-primary text-white font-black uppercase tracking-widest gap-2 shadow-lg" onClick={() => setDialog({ open: true, type: 'tema', data: { titulo: '', contenido: '', orden: temas.length + 1 } })}>
                      <Plus size={18} /> Nuevo Tema
                   </Button>
                 </div>
               </CardHeader>
               <CardContent className="p-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {temas.length === 0 ? (
                     <div className="md:col-span-2 py-20 text-center text-muted-foreground italic bg-slate-50 rounded-3xl border-2 border-dashed">
                       Esta unidad aún no tiene temas publicados.
                     </div>
                   ) : temas.map((t) => (
                     <div key={t.id} onClick={() => { setSelectedTema(t); fetchEjercicios(t.id); setCurrentTab('ejercicios'); }} className="p-6 border-2 border-slate-50 rounded-[24px] flex items-center justify-between cursor-pointer hover:bg-white hover:shadow-xl hover:border-primary/20 transition-all group">
                       <div className="flex flex-col">
                         <span className="font-black text-slate-700 uppercase tracking-tight leading-tight">{t.titulo}</span>
                         <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Contenido disponible</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'tema', data: t }); }}>
                           <Edit size={16}/>
                         </Button>
                         <ChevronRight size={18} className="text-slate-200 group-hover:text-primary transition-colors" />
                       </div>
                     </div>
                   ))}
                 </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="ejercicios" className="mt-0">
             <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden">
               <CardHeader className="bg-slate-50/50 pb-6 border-b">
                 <div className="flex flex-row items-center justify-between">
                   <div>
                     <Button variant="ghost" size="sm" onClick={() => setCurrentTab('temas')} className="mb-2 -ml-2 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/5">
                       <ArrowLeft size={14} className="mr-1" /> Volver a Temas
                     </Button>
                     <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3">
                       <Sparkles className="text-amber-500" size={24} /> Actividades de {selectedTema?.titulo}
                     </CardTitle>
                     <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Prácticas y reforzamiento</p>
                   </div>
                   <Button size="lg" className="rounded-2xl bg-amber-500 text-white font-black uppercase tracking-widest gap-2 shadow-lg hover:bg-amber-600" onClick={() => setDialog({ open: true, type: 'ejercicio', data: { titulo: '', descripcion: '', orden: ejercicios.length + 1 } })}>
                      <Plus size={18} /> Nueva Actividad
                   </Button>
                 </div>
               </CardHeader>
               <CardContent className="p-6">
                 <Table>
                   <TableHeader className="bg-slate-50/50">
                     <TableRow>
                       <TableHead className="font-black uppercase text-[10px] text-slate-500">Orden</TableHead>
                       <TableHead className="font-black uppercase text-[10px] text-slate-500">Descripción de la Actividad</TableHead>
                       <TableHead className="text-right font-black uppercase text-[10px] text-slate-500">Acciones</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {ejercicios.length === 0 ? (
                       <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground italic">Sin actividades registradas.</TableCell></TableRow>
                     ) : ejercicios.map((e) => (
                       <TableRow key={e.id} className="hover:bg-amber-50/30 transition-colors">
                         <TableCell className="font-black text-slate-400">{e.orden}</TableCell>
                         <TableCell className="font-bold text-slate-700 uppercase tracking-tight">{e.titulo}</TableCell>
                         <TableCell className="text-right">
                           <div className="flex justify-end gap-2">
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => setDialog({ open: true, type: 'ejercicio', data: e })}>
                               <Edit size={16}/>
                             </Button>
                             <AlertDialog>
                               <AlertDialogTrigger asChild>
                                 <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-50">
                                   <Trash2 size={16}/>
                                 </Button>
                               </AlertDialogTrigger>
                               <AlertDialogContent className="rounded-3xl">
                                 <AlertDialogHeader>
                                   <AlertDialogTitle className="font-black uppercase">¿Eliminar actividad?</AlertDialogTitle>
                                   <AlertDialogDescription>Esta acción no se puede deshacer. Los alumnos ya no verán esta tarea en su portal.</AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                                   <AlertDialogAction className="bg-destructive rounded-xl" onClick={() => handleDelete('ejercicio', e.id)}>Eliminar Permanentemente</AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
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

      {/* PROFESSOR ACADEMIC DIALOG */}
      <Dialog open={dialog.open} onOpenChange={o => setDialog({...dialog, open: o})}>
        <DialogContent className="max-w-xl rounded-[32px]">
          <DialogHeader>
            <DialogTitle className="capitalize font-black text-2xl uppercase tracking-tight text-primary">
              {dialog.data.id ? 'Editar' : 'Nueva'} {dialog.type}
            </DialogTitle>
            <DialogDescription className="text-xs uppercase font-bold text-slate-400">Completa la información técnica del contenido.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-6">
             <div className="space-y-2">
               <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Título del Contenido</label>
               <Input 
                 placeholder="EJ. INTRODUCCIÓN A LA LÓGICA"
                 className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20 uppercase font-bold"
                 value={dialog.data.titulo || ''} 
                 onChange={e => setDialog({...dialog, data: {...dialog.data, titulo: e.target.value.toUpperCase()}})} 
               />
             </div>
             
             <div className="space-y-2">
               <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Orden en el Programa</label>
               <Input 
                 type="number"
                 className="h-12 rounded-xl bg-slate-50 border-slate-200"
                 value={dialog.data.orden || 1} 
                 onChange={e => setDialog({...dialog, data: {...dialog.data, orden: parseInt(e.target.value)}})} 
               />
             </div>

             {dialog.type === 'tema' && (
               <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Contenido / Descripción</label>
                 <textarea 
                   rows={6}
                   className="w-full p-4 rounded-xl bg-slate-50 border-slate-200 text-sm focus:ring-primary/20 outline-none"
                   placeholder="Redacta aquí el contenido del tema..."
                   value={dialog.data.contenido || ''}
                   onChange={e => setDialog({...dialog, data: {...dialog.data, contenido: e.target.value}})}
                 />
               </div>
             )}
          </div>
          <DialogFooter className="gap-2">
             {dialog.data.id && (
               <Button variant="ghost" className="text-destructive font-black uppercase text-xs mr-auto hover:bg-red-50" onClick={() => { handleDelete(dialog.type, dialog.data.id); setDialog({...dialog, open: false}); }}>Eliminar {dialog.type}</Button>
             )}
             <Button variant="outline" className="rounded-xl px-6 font-bold" onClick={() => setDialog({ ...dialog, open: false })}>Cancelar</Button>
             <Button className="bg-primary px-8 rounded-xl font-black uppercase tracking-widest shadow-lg" onClick={handleSave}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
