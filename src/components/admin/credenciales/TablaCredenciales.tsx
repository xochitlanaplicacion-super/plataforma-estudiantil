'use client';

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, IdCard, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { toggleAutorizacionCredencial } from '@/lib/actions/credenciales';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CredencialPreview } from './CredencialPreview';

interface TablaCredencialesProps {
  alumnos: any[];
  config: any;
  institucion: any;
}

export function TablaCredenciales({ alumnos: initialAlumnos, config, institucion }: TablaCredencialesProps) {
  const { toast } = useToast();
  const [alumnos, setAlumnos] = useState(initialAlumnos);
  const [searchTerm, setSearchTerm] = useState('');
  const [carreraFilter, setCarreraFilter] = useState('all');
  const [grupoFilter, setGrupoFilter] = useState('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  
  const [selectedAlumno, setSelectedAlumno] = useState<any | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Extract unique filter options
  const carreras = useMemo(() => Array.from(new Set(alumnos.map(a => a.carrera).filter(Boolean))), [alumnos]);
  const grupos = useMemo(() => Array.from(new Set(alumnos.map(a => a.grupo).filter(Boolean))), [alumnos]);

  const filteredAlumnos = useMemo(() => {
    return alumnos.filter(a => {
      const matchSearch = 
        a.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.apellidos?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.matricula?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCarrera = carreraFilter === 'all' || a.carrera === carreraFilter;
      const matchGrupo = grupoFilter === 'all' || a.grupo === grupoFilter;
      return matchSearch && matchCarrera && matchGrupo;
    });
  }, [alumnos, searchTerm, carreraFilter, grupoFilter]);

  const handleToggle = async (id: string, currentState: boolean) => {
    try {
      setTogglingId(id);
      const newState = !currentState;
      // Optimistic update
      setAlumnos(prev => prev.map(a => a.id === id ? { ...a, autorizado: newState } : a));
      
      const res = await toggleAutorizacionCredencial(id, newState);
      if (!res.success) {
        throw new Error(res.error);
      }
      toast({ title: newState ? 'Autorización concedida' : 'Autorización revocada' });
    } catch (error: any) {
      // Revert on error
      setAlumnos(prev => prev.map(a => a.id === id ? { ...a, autorizado: currentState } : a));
      toast({ title: 'Error al actualizar autorización', description: error.message, variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  const getInitials = (n: string, a: string) => `${n?.charAt(0) || ''}${a?.charAt(0) || ''}`.toUpperCase();

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border shadow-sm items-end">
        <div className="flex-1 space-y-1 w-full">
          <label className="text-xs font-semibold text-muted-foreground">Buscar Inteligente</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por matrícula, nombre o apellidos..." 
              className="pl-9" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="w-full sm:w-48 space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Filtrar por Carrera</label>
          <Select value={carreraFilter} onValueChange={setCarreraFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todas las carreras" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {carreras.map(c => <SelectItem key={c as string} value={c as string}>{c as React.ReactNode}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-48 space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Filtrar por Grupo</label>
          <Select value={grupoFilter} onValueChange={setGrupoFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todos los grupos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {grupos.map(g => <SelectItem key={g as string} value={g as string}>{g as React.ReactNode}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Alumno</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead className="text-center">Autorizar Generación</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAlumnos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No se encontraron alumnos con los filtros actuales.
                </TableCell>
              </TableRow>
            ) : (
              filteredAlumnos.map((alumno) => (
                <TableRow key={alumno.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border">
                        {alumno.foto_perfil ? (
                          <AvatarImage src={alumno.foto_perfil} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(alumno.nombre, alumno.apellidos)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div>
                        <p className="font-semibold text-sm">{alumno.nombre} {alumno.apellidos}</p>
                        <p className="text-xs text-muted-foreground">{alumno.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{alumno.carrera || 'Sin Carrera'}</p>
                    <p className="text-xs text-muted-foreground">{alumno.nivel || 'Sin Nivel'} • {alumno.grupo ? `Grupo ${alumno.grupo}` : 'Sin Grupo'}</p>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{alumno.matricula || 'S/N'}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center items-center h-full">
                      {togglingId === alumno.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Switch 
                          checked={alumno.autorizado} 
                          onCheckedChange={() => handleToggle(alumno.id, alumno.autorizado)}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant={alumno.autorizado ? "default" : "secondary"} 
                      size="sm"
                      disabled={!alumno.autorizado}
                      onClick={() => {
                        setSelectedAlumno(alumno);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <IdCard className="h-4 w-4 mr-2" />
                      Generar Credencial
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl border-none shadow-2xl p-0 bg-transparent">
          <DialogHeader className="sr-only">
            <DialogTitle>Descarga de Credencial</DialogTitle>
          </DialogHeader>
          <div className="bg-white/95 backdrop-blur-sm p-6 rounded-2xl flex flex-col items-center max-h-[90vh] overflow-y-auto w-full">
            <h3 className="text-lg font-bold mb-4">Revisión y Descarga</h3>
            {selectedAlumno && (
              <CredencialPreview 
                config={config} 
                institucion={institucion} 
                alumno={selectedAlumno}
                showDownloadOptions={true}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
