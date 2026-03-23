"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, School, GraduationCap, Loader2 } from 'lucide-react';
import { getNiveles, upsertNivel, deleteNivel, getCarreras, upsertCarrera, deleteCarrera } from '@/lib/actions/academic';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function EstructuraAcademica() {
  const { toast } = useToast();
  const [niveles, setNiveles] = useState<any[]>([]);
  const [carreras, setCarreras] = useState<any[]>([]);
  const [selectedNivel, setSelectedNivel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialog states
  const [nivelDialog, setNivelDialog] = useState({ open: false, data: { id: '', nombre: '', descripcion: '', activo: true } });
  const [carreraDialog, setCarreraDialog] = useState({ open: false, data: { id: '', nivel_id: '', nombre: '', clave: '', activo: true } });

  const fetchData = async () => {
    setLoading(true);
    const { data: n } = await getNiveles();
    if (n) setNiveles(n);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (selectedNivel) {
      const fetchCarreras = async () => {
        const { data: c } = await getCarreras(selectedNivel.id);
        if (c) setCarreras(c);
      };
      fetchCarreras();
    } else {
      setCarreras([]);
    }
  }, [selectedNivel]);

  const handleUpsertNivel = async () => {
    if (!nivelDialog.data.nombre) return;
    setActionLoading(true);
    const { error } = await upsertNivel(nivelDialog.data);
    if (!error) {
      toast({ title: "Nivel guardado correctamente" });
      setNivelDialog({ ...nivelDialog, open: false });
      fetchData();
    }
    setActionLoading(false);
  };

  const handleDeleteNivel = async (id: string) => {
    const { error } = await deleteNivel(id);
    if (!error) {
      toast({ title: "Nivel eliminado" });
      fetchData();
      if (selectedNivel?.id === id) setSelectedNivel(null);
    }
  };

  const handleUpsertCarrera = async () => {
    if (!carreraDialog.data.nombre || !selectedNivel) return;
    setActionLoading(true);
    const { error } = await upsertCarrera({ ...carreraDialog.data, nivel_id: selectedNivel.id });
    if (!error) {
      toast({ title: "Carrera guardada correctamente" });
      setCarreraDialog({ ...carreraDialog, open: false });
      const { data: c } = await getCarreras(selectedNivel.id);
      if (c) setCarreras(c);
    }
    setActionLoading(false);
  };

  const handleDeleteCarrera = async (id: string) => {
    const { error } = await deleteCarrera(id);
    if (!error) {
      toast({ title: "Carrera eliminada" });
      if (selectedNivel) {
        const { data: c } = await getCarreras(selectedNivel.id);
        if (c) setCarreras(c);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Niveles y Carreras</h2>
          <p className="text-muted-foreground">Configura la oferta académica de la institución.</p>
        </div>
        <Button className="gap-2" onClick={() => setNivelDialog({ open: true, data: { id: '', nombre: '', descripcion: '', activo: true } })}>
          <Plus size={18} /> Nuevo Nivel
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* NIVELES */}
        <Card className="lg:col-span-4 h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><School size={20} className="text-primary" /> Niveles Educativos</CardTitle>
            <CardDescription>Ej: Bachillerato, Universidad...</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div> : (
              <div className="space-y-2">
                {niveles.map(n => (
                  <div 
                    key={n.id} 
                    onClick={() => setSelectedNivel(n)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-center group ${selectedNivel?.id === n.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-muted/50'}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{n.nombre}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">{n.activo ? 'Activo' : 'Inactivo'}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setNivelDialog({ open: true, data: n }); }}>
                        <Edit size={14} />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => e.stopPropagation()}>
                            <Trash2 size={14} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar nivel {n.nombre}?</AlertDialogTitle>
                            <AlertDialogDescription>Esto eliminará todas las carreras y grupos vinculados. Esta acción no se puede deshacer.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive" onClick={() => handleDeleteNivel(n.id)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARRERAS */}
        <Card className="lg:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <GraduationCap size={20} className="text-primary" /> 
                Carreras en {selectedNivel?.nombre || '...'}
              </CardTitle>
              <CardDescription>Programas académicos vinculados al nivel seleccionado.</CardDescription>
            </div>
            {selectedNivel && (
              <Button size="sm" className="gap-2" onClick={() => setCarreraDialog({ open: true, data: { id: '', nivel_id: selectedNivel.id, nombre: '', clave: '', activo: true } })}>
                <Plus size={16} /> Agregar Carrera
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedNivel ? (
              <div className="py-20 text-center text-muted-foreground italic border-2 border-dashed rounded-3xl">
                Selecciona un nivel del panel izquierdo para gestionar sus carreras.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre de la Carrera</TableHead>
                    <TableHead>Clave</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carreras.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">No hay carreras registradas en este nivel.</TableCell></TableRow>
                  ) : carreras.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-bold">{c.nombre}</TableCell>
                      <TableCell className="font-mono text-xs">{c.clave || 'S/C'}</TableCell>
                      <TableCell><Badge variant={c.activo ? 'default' : 'secondary'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setCarreraDialog({ open: true, data: c })}>
                            <Edit size={16} />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive">
                                <Trash2 size={16} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar carrera {c.nombre}?</AlertDialogTitle>
                                <AlertDialogDescription>Se eliminarán los grados y grupos vinculados.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive" onClick={() => handleDeleteCarrera(c.id)}>Eliminar</AlertDialogAction>
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
      </div>

      {/* DIALOGS */}
      <Dialog open={nivelDialog.open} onOpenChange={(o) => setNivelDialog({ ...nivelDialog, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{nivelDialog.data.id ? 'Editar' : 'Nuevo'} Nivel</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Nombre del Nivel</label>
              <Input value={nivelDialog.data.nombre} onChange={e => setNivelDialog({...nivelDialog, data: {...nivelDialog.data, nombre: e.target.value.toUpperCase()}})} placeholder="EJ. BACHILLERATO" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Descripción</label>
              <Input value={nivelDialog.data.descripcion} onChange={e => setNivelDialog({...nivelDialog, data: {...nivelDialog.data, descripcion: e.target.value}})} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNivelDialog({...nivelDialog, open: false})}>Cancelar</Button>
            <Button onClick={handleUpsertNivel} disabled={actionLoading}>{actionLoading ? <Loader2 className="animate-spin" /> : 'Guardar Nivel'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={carreraDialog.open} onOpenChange={(o) => setCarreraDialog({ ...carreraDialog, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{carreraDialog.data.id ? 'Editar' : 'Nueva'} Carrera</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Nombre de la Carrera</label>
              <Input value={carreraDialog.data.nombre} onChange={e => setCarreraDialog({...carreraDialog, data: {...carreraDialog.data, nombre: e.target.value.toUpperCase()}})} placeholder="EJ. INGENIERÍA EN SISTEMAS" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Clave / RVOE</label>
              <Input value={carreraDialog.data.clave} onChange={e => setCarreraDialog({...carreraDialog, data: {...carreraDialog.data, clave: e.target.value.toUpperCase()}})} placeholder="EJ. BAC-2024" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCarreraDialog({...carreraDialog, open: false})}>Cancelar</Button>
            <Button onClick={handleUpsertCarrera} disabled={actionLoading}>{actionLoading ? <Loader2 className="animate-spin" /> : 'Guardar Carrera'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
