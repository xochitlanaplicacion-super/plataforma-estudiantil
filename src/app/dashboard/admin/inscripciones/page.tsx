
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Search, 
  UserPlus, 
  Loader2, 
  School, 
  XCircle,
  RotateCcw,
  Layers,
  ArrowRight,
  ChevronLeft,
  GraduationCap
} from 'lucide-react';
import { 
  getNiveles, 
  getCarreras, 
  getGrados, 
  getGrupos, 
  getAllGrupos,
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
  const [allGrupos, setAllGrupos] = useState<any[]>([]);

  // Filtros Destino (Pestaña Inscribir)
  const [selNivel, setSelNivel] = useState<string>('');
  const [selCarrera, setSelCarrera] = useState<string>('');
  const [selGrado, setSelGrado] = useState<string>('all');
  const [selGrupo, setSelGrupo] = useState<string>('');

  // Navegación (Pestaña Gestión)
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [alRes, nivRes, grRes] = await Promise.all([
      getAlumnosVigentes(),
      getNiveles(),
      getAllGrupos()
    ]);
    if (alRes.data) setAlumnos(alRes.data);
    if (nivRes.data) setNiveles(nivRes.data);
    if (grRes.data) setAllGrupos(grRes.data);
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

  // FILTRO: Solo alumnos SIN grupo asignado para la pestaña de Inscripción
  const alumnosSinGrupo = useMemo(() => {
    return alumnos.filter(a => {
      if (a.grupo_id) return false;
      const nameMatch = `${a.nombre} ${a.apellidos} ${a.matricula}`.toLowerCase().includes(search.toLowerCase());
      const nivelMatch = !selNivel || a.carreras?.nivel_id === selNivel;
      const carreraMatch = !selCarrera || a.carrera_id === selCarrera;
      return nameMatch && nivelMatch && carreraMatch;
    });
  }, [alumnos, search, selNivel, selCarrera]);

  // Limpiar selección de alumnos que desaparecieron por filtros de seguridad
  useEffect(() => {
    const visibleIds = alumnosSinGrupo.map(a => a.id);
    setSelectedIds(prev => prev.filter(id => visibleIds.includes(id)));
  }, [alumnosSinGrupo]);

  const toggleSelectAll = () => {
    if (selectedIds.length === alumnosSinGrupo.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(alumnosSinGrupo.map(a => a.id));
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
      clearFilters(); 
      fetchData();
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error || "Error al asignar." });
    }
    setSaving(false);
  };

  const handleRemoveFromGroup = async (userId: string) => {
    setSaving(true);
    const res = await bulkAssignGroup([userId], null);
    if (res.success) {
      toast({ title: "Alumno retirado", description: "El alumno ya no pertenece a este grupo." });
      fetchData();
    }
    setSaving(false);
  };

  // Lógica para Pestaña Gestión: Resumen por Niveles
  const levelSummaries = useMemo(() => {
    return niveles.map(niv => {
      const gruposDeNivel = allGrupos.filter(g => g.carreras?.nivel_id === niv.id);
      const idsGrupos = gruposDeNivel.map(g => g.id);
      const alumnosCount = alumnos.filter(a => a.grupo_id && idsGrupos.includes(a.grupo_id)).length;
      return { ...niv, totalAlumnos: alumnosCount, totalGrupos: gruposDeNivel.length };
    }).filter(n => n.totalGrupos > 0);
  }, [niveles, allGrupos, alumnos]);

  // Grupos del nivel seleccionado organizados por carrera
  const groupsByCareer = useMemo(() => {
    if (!selectedLevelId) return {};
    const filtered = allGrupos.filter(g => g.carreras?.nivel_id === selectedLevelId);
    const grouped: Record<string, any[]> = {};
    filtered.forEach(g => {
      const careerName = g.carreras?.nombre || 'OTRA CARRERA';
      if (!grouped[careerName]) grouped[careerName] = [];
      grouped[careerName].push(g);
    });
    return grouped;
  }, [allGrupos, selectedLevelId]);

  const currentGroupMembers = useMemo(() => {
    if (!selectedGroupId) return [];
    return alumnos.filter(a => a.grupo_id === selectedGroupId);
  }, [alumnos, selectedGroupId]);

  const selectedGroupData = useMemo(() => {
    return allGrupos.find(g => g.id === selectedGroupId);
  }, [allGrupos, selectedGroupId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary font-headline">Matrícula y Salones</h2>
          <p className="text-muted-foreground">Gestión masiva de alumnos vigentes en grupos académicos.</p>
        </div>
      </div>

      <Tabs defaultValue="inscribir" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-2xl h-14 w-full md:w-fit grid grid-cols-2 shadow-sm border">
          <TabsTrigger value="inscribir" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold px-8">
            <UserPlus size={18} className="mr-2" /> Inscribir Alumnos
          </TabsTrigger>
          <TabsTrigger value="grupos" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold px-8">
            <Layers size={18} className="mr-2" /> Gestión de Grupos
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PROCESO DE INSCRIPCIÓN */}
        <TabsContent value="inscribir" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <Card className="lg:col-span-7 border-muted/60 shadow-xl rounded-[32px] overflow-hidden flex flex-col">
              <CardHeader className="bg-white pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Users className="text-primary" size={24} /> Alumnos por Inscribir
                    </CardTitle>
                    <CardDescription className="text-xs">Solo alumnos vigentes que no pertenecen a ningún grupo.</CardDescription>
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
                    checked={selectedIds.length > 0 && selectedIds.length === alumnosSinGrupo.length}
                    onCheckedChange={toggleSelectAll}
                  />
                  <label htmlFor="select-all" className="text-[10px] font-black uppercase text-primary tracking-widest cursor-pointer">
                    SELECCIONAR TODOS ({alumnosSinGrupo.length})
                  </label>
                </div>
                {selectedIds.length > 0 && (
                  <Badge className="bg-amber-500 text-white border-none text-[10px] font-bold">
                    {selectedIds.length} SELECCIONADOS
                  </Badge>
                )}
              </div>

              <ScrollArea className="flex-1 h-[500px]">
                <div className="p-4 space-y-2">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                      <Loader2 className="animate-spin text-primary h-8 w-8" />
                      <p className="text-xs font-bold uppercase tracking-widest">Cargando...</p>
                    </div>
                  ) : alumnosSinGrupo.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground italic border-2 border-dashed rounded-3xl p-10">
                      { (selNivel || selCarrera) ? "No hay alumnos vigentes que coincidan con el destino seleccionado." : "No hay alumnos pendientes de inscribir." }
                    </div>
                  ) : (
                    alumnosSinGrupo.map((alum) => (
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
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>

            <div className="lg:col-span-5 space-y-6">
              <Card className="border-muted/60 shadow-xl rounded-[32px] overflow-hidden border-t-4 border-t-primary">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <School className="text-primary" size={20} /> Destino de Inscripción
                    </CardTitle>
                    <CardDescription>Selecciona a dónde mover a los alumnos.</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-[10px] font-black uppercase text-muted-foreground hover:text-primary">
                    <RotateCcw size={12} /> Limpiar
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
                    className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all gap-2"
                    disabled={!selGrupo || selectedIds.length === 0 || saving}
                    onClick={handleAssign}
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <UserPlus size={20} />}
                    Inscribir Alumnos Seleccionados
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: GESTIÓN DE GRUPOS EXISTENTES */}
        <TabsContent value="grupos" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 flex flex-col gap-6">
              {!selectedLevelId ? (
                // MODO 1: Selección de Niveles
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {levelSummaries.map((niv) => (
                    <Card 
                      key={niv.id} 
                      className="cursor-pointer hover:shadow-xl transition-all border-2 border-slate-100 hover:border-primary/40 group overflow-hidden"
                      onClick={() => setSelectedLevelId(niv.id)}
                    >
                      <div className="h-2 bg-primary/20 group-hover:bg-primary transition-colors" />
                      <CardHeader className="p-8">
                        <div className="flex justify-between items-start">
                          <div className="p-4 rounded-2xl bg-primary/5 text-primary">
                            <School size={32} />
                          </div>
                          <div className="text-right">
                            <span className="text-4xl font-black text-primary">{niv.totalAlumnos}</span>
                            <p className="text-[10px] font-black text-muted-foreground uppercase">Alumnos Vigentes</p>
                          </div>
                        </div>
                        <CardTitle className="text-2xl font-black uppercase mt-6">{niv.nombre}</CardTitle>
                        <CardDescription className="text-xs font-bold text-slate-500 uppercase">
                          {niv.totalGrupos} Grupos registrados
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-8 pb-8 pt-0">
                        <Button variant="outline" className="w-full rounded-xl font-black uppercase text-xs tracking-widest group-hover:bg-primary group-hover:text-white transition-all">
                          Gestionar Niveles <ArrowRight size={14} className="ml-2" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                // MODO 2: Selección de Grupos (Agrupados por Carrera)
                <div className="space-y-10">
                  <Button 
                    variant="ghost" 
                    onClick={() => { setSelectedLevelId(null); setSelectedGroupId(null); }}
                    className="font-black uppercase tracking-tighter text-primary hover:bg-primary/5"
                  >
                    <ChevronLeft size={18} className="mr-1" /> Volver a Niveles
                  </Button>

                  {Object.entries(groupsByCareer).map(([careerName, careerGroups]) => (
                    <div key={careerName} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <GraduationCap className="text-primary/40" size={24} />
                        <h3 className="text-lg font-black text-slate-700 uppercase tracking-tight">{careerName}</h3>
                        <Separator className="flex-1" />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {careerGroups.map((grupo) => {
                          const count = alumnos.filter(a => a.grupo_id === grupo.id).length;
                          const isSelected = selectedGroupId === grupo.id;

                          return (
                            <Card 
                              key={grupo.id} 
                              className={cn(
                                "cursor-pointer transition-all duration-300 hover:shadow-lg border-2",
                                isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-100 hover:border-primary/30"
                              )}
                              onClick={() => setSelectedGroupId(grupo.id)}
                            >
                              <CardHeader className="p-5 pb-2">
                                <div className="flex justify-between items-start">
                                  <Badge variant="outline" className="text-[9px] font-black bg-slate-50 uppercase">{grupo.turno}</Badge>
                                  <div className="text-right">
                                    <span className="text-2xl font-black text-primary">{count}</span>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">Vigentes</p>
                                  </div>
                                </div>
                                <CardTitle className="text-base font-black uppercase mt-2">{grupo.nombre}</CardTitle>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{grupo.grados?.nombre || 'Grado no def.'}</p>
                              </CardHeader>
                              <div className="p-5 pt-0 flex justify-end">
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase gap-1 group">
                                  Ver Integrantes <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                                </Button>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PANEL DERECHO: INTEGRANTES */}
            <div className="lg:col-span-5">
              <Card className="border-muted/60 shadow-xl rounded-[32px] overflow-hidden sticky top-6 border-t-4 border-t-amber-500">
                <CardHeader className="bg-slate-50/50">
                  <div className="flex flex-col">
                    <CardTitle className="text-lg font-black uppercase tracking-tighter text-slate-700">Integrantes de Salón</CardTitle>
                    {selectedGroupData && (
                      <p className="text-xs font-bold text-amber-600 uppercase mt-1">{selectedGroupData.nombre}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    {!selectedGroupId ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center px-10 opacity-40">
                        <Layers size={48} className="mb-4 text-slate-400" />
                        <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed">
                          Selecciona un grupo para gestionar a sus integrantes vigentes.
                        </p>
                      </div>
                    ) : currentGroupMembers.length === 0 ? (
                      <div className="text-center py-20 text-muted-foreground italic text-sm px-10">
                        Este grupo no tiene alumnos inscritos actualmente.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {currentGroupMembers.map(m => (
                          <div key={m.id} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-800 uppercase leading-none">{m.nombre} {m.apellidos}</span>
                              <span className="text-[9px] text-muted-foreground font-mono mt-1">{m.matricula}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-300 hover:text-destructive hover:bg-red-50 transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleRemoveFromGroup(m.id); }}
                              disabled={saving}
                            >
                              <XCircle size={18} />
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
