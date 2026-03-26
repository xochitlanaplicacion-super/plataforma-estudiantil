
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Search, 
  UserPlus, 
  Loader2, 
  School, 
  Info,
  XCircle,
  Filter,
  RotateCcw
} from 'lucide-react';
import { 
  getNiveles, 
  getCarreras, 
  getGrados, 
  getGrupos, 
  getAlumnosVigentes,
  bulkAssignGroup 
} from '@/lib/actions/academic';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function InscripcionAlumnos() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Catalogos
  const [niveles, setNiveles] = useState<any[]>([]);
  const [carreras, setCarreras] = useState<any[]>([]);
  const [grados, setGrados] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);

  // Filtros Destino
  const [selNivel, setSelNivel] = useState<string>('');
  const [selCarrera, setSelCarrera] = useState<string>('');
  const [selGrado, setSelGrado] = useState<string>('all');
  const [selGrupo, setSelGrupo] = useState<string>('');

  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [alRes, nivRes] = await Promise.all([
      getAlumnosVigentes(),
      getNiveles()
    ]);
    if (alRes.data) setAlumnos(alRes.data);
    if (nivRes.data) setNiveles(nivRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (selNivel) {
      getCarreras(selNivel).then(r => r.data && setCarreras(r.data));
      setSelCarrera('');
      setSelGrado('all');
      setSelGrupo('');
    }
  }, [selNivel]);

  useEffect(() => {
    if (selCarrera) {
      Promise.all([
        getGrados(selCarrera),
        getGrupos(selCarrera)
      ]).then(([gr, gp]) => {
        setGrados(gr.data || []);
        setGrupos(gp.data || []);
      });
      setSelGrado('all');
      setSelGrupo('');
    }
  }, [selCarrera]);

  const clearFilters = () => {
    setSelNivel('');
    setSelCarrera('');
    setSelGrado('all');
    setSelGrupo('');
  };

  // FILTRADO DINÁMICO E INTELIGENTE
  const filteredAlumnos = useMemo(() => {
    return alumnos.filter(a => {
      // 1. Filtro por nombre/matricula
      const nameMatch = `${a.nombre} ${a.apellidos} ${a.matricula}`.toLowerCase().includes(search.toLowerCase());
      
      // 2. Filtro de Seguridad por Nivel (Si se eligió un destino)
      const nivelMatch = !selNivel || a.carreras?.nivel_id === selNivel;
      
      // 3. Filtro de Seguridad por Carrera (Si se eligió una carrera destino)
      const carreraMatch = !selCarrera || a.carrera_id === selCarrera;

      return nameMatch && nivelMatch && carreraMatch;
    });
  }, [alumnos, search, selNivel, selCarrera]);

  // EFECTO: Limpiar selección de alumnos que desaparecieron por filtros de seguridad
  useEffect(() => {
    const visibleIds = filteredAlumnos.map(a => a.id);
    setSelectedIds(prev => prev.filter(id => visibleIds.includes(id)));
  }, [filteredAlumnos]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAlumnos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAlumnos.map(a => a.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleAssign = async () => {
    if (!selGrupo || selectedIds.length === 0) return;
    setSaving(true);
    const res = await bulkAssignGroup(selectedIds, selGrupo);
    if (res.success) {
      toast({ title: "Inscripción Exitosa", description: `${selectedIds.length} alumnos asignados al grupo.` });
      setSelectedIds([]);
      clearFilters(); // Limpiar filtros automáticamente al éxito
      fetchData();
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error || "Error al asignar." });
    }
    setSaving(false);
  };

  const currentGroupMembers = useMemo(() => {
    if (!selGrupo) return [];
    return alumnos.filter(a => a.grupo_id === selGrupo);
  }, [alumnos, selGrupo]);

  const handleRemoveFromGroup = async (userId: string) => {
    setSaving(true);
    const res = await bulkAssignGroup([userId], null);
    if (res.success) {
      toast({ title: "Alumno retirado", description: "El alumno ya no pertenece a este grupo." });
      fetchData();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary font-headline">Inscripción de Alumnos</h2>
          <p className="text-muted-foreground">Asigna masivamente alumnos vigentes a grupos académicos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* PANEL IZQUIERDO: ALUMNOS DISPONIBLES */}
        <Card className="lg:col-span-7 border-muted/60 shadow-xl rounded-[32px] overflow-hidden flex flex-col">
          <CardHeader className="bg-white pb-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Users className="text-primary" size={24} /> Alumnos Vigentes
                </CardTitle>
                <CardDescription className="text-xs">Solo se listan alumnos con estatus Activo y fecha vigente.</CardDescription>
              </div>
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input 
                  placeholder="Buscar alumno..." 
                  className="pl-9 h-9 text-xs rounded-full border-muted bg-slate-50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          
          <div className="px-6 py-2 bg-slate-50 border-y flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="select-all" 
                checked={selectedIds.length > 0 && selectedIds.length === filteredAlumnos.length}
                onCheckedChange={toggleSelectAll}
              />
              <label htmlFor="select-all" className="text-[10px] font-black uppercase text-primary tracking-widest cursor-pointer">
                SELECCIONAR TODOS ({filteredAlumnos.length})
              </label>
            </div>
            {selectedIds.length > 0 && (
              <Badge className="bg-amber-500 text-white border-none text-[10px] font-bold">
                {selectedIds.length} SELECCIONADOS
              </Badge>
            )}
            {(selNivel || selCarrera) && (
              <div className="flex items-center gap-1 text-[9px] font-black text-blue-600 ml-auto uppercase animate-pulse">
                <Filter size={10} /> Filtros de destino activos
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 h-[500px]">
            <div className="p-4 space-y-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                  <Loader2 className="animate-spin text-primary h-8 w-8" />
                  <p className="text-xs font-bold uppercase tracking-widest">Cargando matrícula...</p>
                </div>
              ) : filteredAlumnos.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground italic border-2 border-dashed rounded-3xl p-10">
                  { (selNivel || selCarrera) ? "No hay alumnos vigentes que coincidan con el destino seleccionado." : "No se encontraron alumnos vigentes." }
                </div>
              ) : (
                filteredAlumnos.map((alum) => (
                  <div 
                    key={alum.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer group",
                      selectedIds.includes(alum.id) 
                        ? "border-primary bg-primary/5 shadow-md" 
                        : "border-transparent hover:bg-slate-50"
                    )}
                    onClick={() => toggleSelect(alum.id)}
                  >
                    <Checkbox checked={selectedIds.includes(alum.id)} className="pointer-events-none" />
                    <div className="flex-1 flex flex-col">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-slate-800 uppercase leading-none group-hover:text-primary transition-colors">
                          {alum.nombre} {alum.apellidos}
                        </span>
                        <Badge variant="outline" className="text-[8px] font-black bg-primary/5 text-primary border-primary/20">
                          {alum.carreras?.niveles?.nombre || 'NIVEL NO DEF.'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground">{alum.matricula || 'SIN MATRÍCULA'}</span>
                        <Separator orientation="vertical" className="h-2" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{alum.carreras?.nombre || 'Carrera no def.'}</span>
                      </div>
                    </div>
                    {alum.grupo_id && (
                      <div className="text-right">
                        <Badge variant="outline" className="text-[9px] font-black uppercase text-blue-600 border-blue-200 bg-blue-50">
                          YA ASIGNADO
                        </Badge>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* PANEL DERECHO: DESTINO Y VISTA DE GRUPO */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-muted/60 shadow-xl rounded-[32px] overflow-hidden border-t-4 border-t-primary">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <School className="text-primary" size={20} /> Destino de Inscripción
                </CardTitle>
                <CardDescription>Selecciona a dónde quieres mover a los alumnos.</CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="gap-1 text-[10px] font-black uppercase text-muted-foreground hover:text-primary"
              >
                <RotateCcw size={12} /> Limpiar Filtros
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-primary uppercase tracking-widest">1. Nivel</label>
                  <Select value={selNivel} onValueChange={setSelNivel}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Elegir..." /></SelectTrigger>
                    <SelectContent>
                      {niveles.map(n => <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-primary uppercase tracking-widest">2. Carrera</label>
                  <Select value={selCarrera} onValueChange={setSelCarrera} disabled={!selNivel}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Elegir..." /></SelectTrigger>
                    <SelectContent>
                      {carreras.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-primary uppercase tracking-widest">3. Grado (Opcional)</label>
                  <Select value={selGrado} onValueChange={setSelGrado} disabled={!selCarrera}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Todos los grados..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los grados</SelectItem>
                      {grados.map(g => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-primary uppercase tracking-widest">4. Grupo Destino</label>
                  <Select value={selGrupo} onValueChange={setSelGrupo} disabled={!selCarrera}>
                    <SelectTrigger className="rounded-xl border-primary/30 ring-primary/10 ring-2"><SelectValue placeholder="Seleccionar grupo..." /></SelectTrigger>
                    <SelectContent>
                      {grupos.filter(g => selGrado === 'all' || g.grado_id === selGrado).map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.nombre} ({g.turno})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all gap-2 disabled:opacity-50"
                disabled={!selGrupo || selectedIds.length === 0 || saving}
                onClick={handleAssign}
              >
                {saving ? <Loader2 className="animate-spin" /> : <UserPlus size={20} />}
                Inscribir Alumnos Seleccionados
              </Button>
            </CardContent>
          </Card>

          {/* LISTA DE INTEGRANTES ACTUALES */}
          <Card className="border-muted/60 shadow-xl rounded-[32px] overflow-hidden border-dashed">
            <CardHeader className="bg-slate-50/50">
              <CardTitle className="text-sm font-black uppercase tracking-tighter text-slate-600">Alumnos inscritos en el grupo destino</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[250px]">
                {!selGrupo ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-8 opacity-40">
                    <Info size={32} className="mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                      Selecciona un grupo para ver sus integrantes vigentes.
                    </p>
                  </div>
                ) : currentGroupMembers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground italic text-xs">
                    Este grupo está vacío por ahora.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {currentGroupMembers.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 uppercase">{m.nombre} {m.apellidos}</span>
                          <span className="text-[9px] text-muted-foreground font-mono">{m.matricula}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleRemoveFromGroup(m.id)}
                          disabled={saving}
                        >
                          <XCircle size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
