
"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, Users, Plus, Edit, Loader2 } from 'lucide-react';
import { getNiveles, getCarreras, getGrados, getGrupos, upsertGrado, upsertGrupo } from '@/lib/actions/academic';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function GradosGrupos() {
  const { toast } = useToast();
  const [niveles, setNiveles] = useState<any[]>([]);
  const [carreras, setCarreras] = useState<any[]>([]);
  const [grados, setGrados] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  
  const [selNivel, setSelNivel] = useState('');
  const [selCarrera, setSelCarrera] = useState('');
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [gradoDialog, setGradoDialog] = useState({ open: false, data: { id: '', carrera_id: '', nombre: '', orden: 1 } });
  const [grupoDialog, setGrupoDialog] = useState({ open: false, data: { id: '', carrera_id: '', grado_id: '', nombre: '', turno: 'Matutino' } });

  useEffect(() => {
    getNiveles().then(({ data }) => data && setNiveles(data));
  }, []);

  useEffect(() => {
    if (selNivel) getCarreras(selNivel).then(({ data }) => data && setCarreras(data));
  }, [selNivel]);

  const fetchAcademicData = async (cId: string) => {
    setLoading(true);
    const [gr, gp] = await Promise.all([getGrados(cId), getGrupos(cId)]);
    if (gr.data) setGrados(gr.data);
    if (gp.data) setGrupos(gp.data);
    setLoading(false);
  };

  useEffect(() => {
    if (selCarrera) fetchAcademicData(selCarrera);
  }, [selCarrera]);

  const handleSaveGrado = async () => {
    const { error } = await upsertGrado({ ...gradoDialog.data, carrera_id: selCarrera });
    if (!error) {
      toast({ title: "Grado guardado" });
      setGradoDialog({ ...gradoDialog, open: false });
      fetchAcademicData(selCarrera);
    }
  };

  const handleSaveGrupo = async () => {
    const { error } = await upsertGrupo({ ...grupoDialog.data, carrera_id: selCarrera, grado_id: grupoDialog.data.grado_id || null });
    if (!error) {
      toast({ title: "Grupo guardado" });
      setGrupoDialog({ ...grupoDialog, open: false });
      fetchAcademicData(selCarrera);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Grados y Grupos</h2>
          <p className="text-muted-foreground">Organiza a los alumnos por periodos y secciones.</p>
        </div>
      </div>

      <Card className="bg-primary/5 border-primary/10">
        <CardContent className="pt-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-primary">1. Selecciona Nivel</label>
            <Select onValueChange={setSelNivel}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Nivel Educativo" /></SelectTrigger>
              <SelectContent>{niveles.map(n => <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-primary">2. Selecciona Carrera</label>
            <Select onValueChange={setSelCarrera} disabled={!selNivel}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Programa / Carrera" /></SelectTrigger>
              <SelectContent>{carreras.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selCarrera ? (
        <div className="py-20 text-center text-muted-foreground italic border-2 border-dashed rounded-[40px] bg-white">
          Define el nivel y la carrera arriba para gestionar sus grupos.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GRADOS */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><Layers size={18} className="text-primary" /> Grados Académicos</CardTitle>
                <CardDescription>Opcional: 1er Año, 2do Semestre...</CardDescription>
              </div>
              <Button size="sm" onClick={() => setGradoDialog({ open: true, data: { id: '', carrera_id: selCarrera, nombre: '', orden: grados.length + 1 } })}>
                <Plus size={16} />
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Orden</TableHead><TableHead>Nombre</TableHead><TableHead className="text-right">Editar</TableHead></TableRow></TableHeader>
                <TableBody>
                  {grados.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="font-mono text-xs">{g.orden}</TableCell>
                      <TableCell className="font-bold">{g.nombre}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setGradoDialog({ open: true, data: g })}><Edit size={14}/></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* GRUPOS */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><Users size={18} className="text-primary" /> Grupos de Alumnos</CardTitle>
                <CardDescription>Secciones, fechas de ingreso o tandas.</CardDescription>
              </div>
              <Button size="sm" onClick={() => setGrupoDialog({ open: true, data: { id: '', carrera_id: selCarrera, grado_id: '', nombre: '', turno: 'Matutino' } })}>
                <Plus size={16} />
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Grupo</TableHead><TableHead>Grado</TableHead><TableHead>Turno</TableHead><TableHead className="text-right">Editar</TableHead></TableRow></TableHeader>
                <TableBody>
                  {grupos.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="font-black text-primary">{g.nombre}</TableCell>
                      <TableCell className="text-xs uppercase">{g.grados?.nombre || 'Independiente'}</TableCell>
                      <TableCell className="text-xs italic">{g.turno}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setGrupoDialog({ open: true, data: g })}><Edit size={14}/></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* DIALOGS */}
      <Dialog open={gradoDialog.open} onOpenChange={o => setGradoDialog({...gradoDialog, open: o})}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gestionar Grado</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input value={gradoDialog.data.nombre} onChange={e => setGradoDialog({...gradoDialog, data: {...gradoDialog.data, nombre: e.target.value.toUpperCase()}})} placeholder="EJ. PRIMER SEMESTRE" />
            <Input type="number" value={gradoDialog.data.orden} onChange={e => setGradoDialog({...gradoDialog, data: {...gradoDialog.data, orden: parseInt(e.target.value)}})} placeholder="Orden" />
          </div>
          <DialogFooter><Button onClick={handleSaveGrado}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grupoDialog.open} onOpenChange={o => setGrupoDialog({...grupoDialog, open: o})}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gestionar Grupo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Nombre del Grupo</label>
              <Input value={grupoDialog.data.nombre} onChange={e => setGrupoDialog({...grupoDialog, data: {...grupoDialog.data, nombre: e.target.value.toUpperCase()}})} placeholder="EJ. GRUPO JUNIO 2025" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Vincular a Grado (Opcional)</label>
              <Select value={grupoDialog.data.grado_id || 'ninguno'} onValueChange={v => setGrupoDialog({...grupoDialog, data: {...grupoDialog.data, grado_id: v === 'ninguno' ? '' : v}})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin Grado (Preparatoria Abierta)</SelectItem>
                  {grados.map(g => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Turno</label>
              <Select value={grupoDialog.data.turno} onValueChange={v => setGrupoDialog({...grupoDialog, data: {...grupoDialog.data, turno: v}})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Matutino">Matutino</SelectItem>
                  <SelectItem value="Vespertino">Vespertino</SelectItem>
                  <SelectItem value="Sabatino">Sabatino</SelectItem>
                  <SelectItem value="Virtual">Virtual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleSaveGrupo}>Guardar Grupo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
