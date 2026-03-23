
"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, ListTree, FileText, Sparkles, ChevronRight, Plus, Edit, Loader2, ArrowLeft } from 'lucide-react';
import { getNiveles, getCarreras, getMaterias, getUnidades, getTemas, getEjercicios, upsertMateria, upsertUnidad, upsertTema, upsertEjercicio } from '@/lib/actions/academic';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  // Dialog State
  const [dialog, setDialog] = useState<any>({ open: false, type: '', data: {} });

  useEffect(() => {
    getNiveles().then(({ data }) => data && setNiveles(data));
  }, []);

  useEffect(() => {
    if (selNivel) getCarreras(selNivel).then(({ data }) => data && setCarreras(data));
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
          <Select onValueChange={setSelNivel}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Nivel Educativo" /></SelectTrigger>
            <SelectContent>{niveles.map(n => <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>)}</SelectContent>
          </Select>
          <Select onValueChange={setSelCarrera} disabled={!selNivel}>
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
        <Tabs defaultValue="materias" className="w-full">
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
                      onClick={() => { setSelectedMateria(m); fetchUnidades(m.id); }}
                      className={`p-5 rounded-2xl border-2 transition-all cursor-pointer group flex items-center justify-between ${selectedMateria?.id === m.id ? 'border-primary bg-primary/5 shadow-md' : 'border-slate-100 hover:border-primary/30'}`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter">{m.clave || 'SIN CLAVE'}</span>
                        <span className="font-black text-sm">{m.nombre}</span>
                      </div>
                      <ChevronRight className={`transition-transform ${selectedMateria?.id === m.id ? 'translate-x-1 text-primary' : 'text-slate-300'}`} />
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
                  <Button variant="ghost" size="sm" onClick={() => setSelectedMateria(null)} className="mb-2 -ml-2 text-primary">
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
                      onClick={() => { setSelectedUnidad(u); fetchTemas(u.id); }}
                      className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${selectedUnidad?.id === u.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{u.orden}</span>
                        <span className="font-bold">{u.titulo}</span>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TEMAS Y EJERCICIOS (Similar logic applied) */}
          <TabsContent value="temas" className="mt-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between">
                 <div>
                   <Button variant="ghost" size="sm" onClick={() => setSelectedUnidad(null)} className="mb-2 -ml-2 text-primary">
                     <ArrowLeft size={14} className="mr-1" /> Volver a Unidades
                   </Button>
                   <CardTitle className="text-lg">Temas de {selectedUnidad?.titulo}</CardTitle>
                 </div>
                 <Button size="sm" onClick={() => setDialog({ open: true, type: 'tema', data: { titulo: '', contenido: '', orden: temas.length + 1 } })}>
                    <Plus size={16} /> Nuevo Tema
                 </Button>
               </CardHeader>
               <CardContent>
                 {temas.map(t => (
                   <div key={t.id} onClick={() => { setSelectedTema(t); fetchEjercicios(t.id); }} className="p-4 border-b last:border-0 flex justify-between cursor-pointer hover:bg-muted/30">
                     <span className="font-medium">{t.titulo}</span>
                     <ChevronRight size={16} />
                   </div>
                 ))}
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="ejercicios" className="mt-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between">
                 <div>
                   <Button variant="ghost" size="sm" onClick={() => setSelectedTema(null)} className="mb-2 -ml-2 text-primary">
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
                   <TableHeader><TableRow><TableHead>Orden</TableHead><TableHead>Actividad</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
                   <TableBody>
                     {ejercicios.map(e => (
                       <TableRow key={e.id}>
                         <TableCell>{e.orden}</TableCell>
                         <TableCell className="font-bold">{e.titulo}</TableCell>
                         <TableCell className="text-right"><Button variant="ghost" size="icon"><Edit size={14}/></Button></TableCell>
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
                 onChange={e => setDialog({...dialog, data: {...dialog.data, [dialog.type === 'materia' ? 'nombre' : 'titulo']: e.target.value.toUpperCase()}})} 
               />
             </div>
             {(dialog.type === 'materia' || dialog.type === 'unidad' || dialog.type === 'tema' || dialog.type === 'ejercicio') && (
               <div className="space-y-2">
                 <label className="text-xs font-bold uppercase">{dialog.type === 'materia' ? 'Clave' : 'Orden'}</label>
                 <Input 
                   type={dialog.type === 'materia' ? 'text' : 'number'}
                   value={dialog.type === 'materia' ? dialog.data.clave : dialog.data.orden} 
                   onChange={e => setDialog({...dialog, data: {...dialog.data, [dialog.type === 'materia' ? 'clave' : 'orden']: e.target.value}})} 
                 />
               </div>
             )}
          </div>
          <DialogFooter><Button onClick={handleSave}>Guardar Cambios</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
