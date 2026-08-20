'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarClock, Edit3, Loader2, Plus, Trash2, Users, Vote, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  borrarEncuesta,
  crearEncuesta,
  editarEncuesta,
  obtenerContextoEncuestas,
  obtenerEncuestas,
  votarEncuesta,
  type AudienciaEncuesta,
  type EncuestaVista,
  type GrupoEncuesta,
} from '@/lib/actions/encuestas';

interface ContextoEncuestas {
  rol: 'superuser' | 'admin' | 'profesor' | 'alumno';
  grupos: GrupoEncuesta[];
  puedeCrear: boolean;
  puedeEncuestarProfesores: boolean;
}

interface FormularioEncuesta {
  titulo: string;
  descripcion: string;
  audiencia: AudienciaEncuesta;
  grupoId: string;
  opciones: string[];
  cierraEn: string;
  activa: boolean;
}

const FORMULARIO_INICIAL: FormularioEncuesta = {
  titulo: '',
  descripcion: '',
  audiencia: 'alumno',
  grupoId: '',
  opciones: ['', ''],
  cierraEn: '',
  activa: true,
};

function aFechaLocal(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fechaLegible(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export default function EncuestasPanel() {
  const { toast } = useToast();
  const [contexto, setContexto] = useState<ContextoEncuestas | null>(null);
  const [encuestas, setEncuestas] = useState<EncuestaVista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [encuestaEditando, setEncuestaEditando] = useState<EncuestaVista | null>(null);
  const [encuestaBorrando, setEncuestaBorrando] = useState<EncuestaVista | null>(null);
  const [formulario, setFormulario] = useState<FormularioEncuesta>(FORMULARIO_INICIAL);
  const [selecciones, setSelecciones] = useState<Record<string, string>>({});
  const [votandoId, setVotandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [contextoRes, encuestasRes] = await Promise.all([
      obtenerContextoEncuestas(),
      obtenerEncuestas(),
    ]);

    if (contextoRes.success) setContexto(contextoRes.data);
    else toast({ variant: 'destructive', title: 'No se pudo cargar el acceso', description: contextoRes.error });

    if (encuestasRes.success) {
      setEncuestas(encuestasRes.data);
      setSelecciones(Object.fromEntries(
        encuestasRes.data.filter((item) => item.votoUsuario).map((item) => [item.id, item.votoUsuario!])
      ));
    } else {
      toast({ variant: 'destructive', title: 'No se pudieron cargar las encuestas', description: encuestasRes.error });
    }
    setCargando(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNueva = () => {
    const profesor = contexto?.rol === 'profesor';
    setEncuestaEditando(null);
    setFormulario({
      ...FORMULARIO_INICIAL,
      grupoId: profesor ? contexto?.grupos[0]?.id || '' : '',
    });
    setDialogoAbierto(true);
  };

  const abrirEdicion = (encuesta: EncuestaVista) => {
    setEncuestaEditando(encuesta);
    setFormulario({
      titulo: encuesta.titulo,
      descripcion: encuesta.descripcion || '',
      audiencia: encuesta.audiencia,
      grupoId: encuesta.grupoId || '',
      opciones: encuesta.opciones.map((opcion) => opcion.texto),
      cierraEn: aFechaLocal(encuesta.cierraEn),
      activa: encuesta.activa,
    });
    setDialogoAbierto(true);
  };

  const cambiarOpcion = (index: number, value: string) => {
    setFormulario((actual) => ({
      ...actual,
      opciones: actual.opciones.map((opcion, posicion) => posicion === index ? value : opcion),
    }));
  };

  const quitarOpcion = (index: number) => {
    setFormulario((actual) => ({ ...actual, opciones: actual.opciones.filter((_, posicion) => posicion !== index) }));
  };

  const opcionesValidas = useMemo(
    () => formulario.opciones.map((opcion) => opcion.trim()).filter(Boolean),
    [formulario.opciones]
  );

  const guardar = async () => {
    if (formulario.titulo.trim().length < 3) {
      toast({ variant: 'destructive', title: 'Escribe un título de al menos 3 caracteres' });
      return;
    }
    if (opcionesValidas.length < 2) {
      toast({ variant: 'destructive', title: 'Incluye al menos dos opciones' });
      return;
    }
    if (formulario.audiencia === 'alumno' && contexto?.rol === 'profesor' && !formulario.grupoId) {
      toast({ variant: 'destructive', title: 'Selecciona uno de tus grupos' });
      return;
    }

    setGuardando(true);
    const input = {
      titulo: formulario.titulo.trim(),
      descripcion: formulario.descripcion.trim() || null,
      audiencia: formulario.audiencia,
      grupoId: formulario.audiencia === 'profesor' ? null : formulario.grupoId || null,
      opciones: opcionesValidas,
      cierraEn: formulario.cierraEn || null,
      activa: formulario.activa,
    };
    const resultado = encuestaEditando
      ? await editarEncuesta(encuestaEditando.id, input)
      : await crearEncuesta(input);
    setGuardando(false);

    if (!resultado.success) {
      toast({ variant: 'destructive', title: 'No se pudo guardar la encuesta', description: resultado.error });
      return;
    }

    const cambioDestinatarios = Boolean(
      encuestaEditando
      && (encuestaEditando.audiencia !== input.audiencia
        || encuestaEditando.grupoId !== input.grupoId)
      && encuestaEditando.totalVotos > 0
    );
    const votosReiniciados = ('votosReiniciados' in resultado && resultado.votosReiniciados) || cambioDestinatarios;
    toast({
      title: encuestaEditando ? 'Encuesta actualizada' : 'Encuesta publicada',
      description: votosReiniciados ? 'Las opciones cambiaron, por lo que los votos anteriores se reiniciaron.' : undefined,
    });
    setDialogoAbierto(false);
    await cargar();
  };

  const confirmarBorrado = async () => {
    if (!encuestaBorrando) return;
    setGuardando(true);
    const resultado = await borrarEncuesta(encuestaBorrando.id);
    setGuardando(false);
    if (!resultado.success) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: resultado.error });
      return;
    }
    setEncuestaBorrando(null);
    toast({ title: 'Encuesta eliminada' });
    await cargar();
  };

  const votar = async (encuesta: EncuestaVista) => {
    const opcionId = selecciones[encuesta.id];
    if (!opcionId) {
      toast({ variant: 'destructive', title: 'Selecciona una opción' });
      return;
    }
    setVotandoId(encuesta.id);
    const resultado = await votarEncuesta(encuesta.id, opcionId);
    setVotandoId(null);
    if (!resultado.success) {
      toast({ variant: 'destructive', title: 'No se pudo registrar tu voto', description: resultado.error });
      return;
    }
    toast({ title: encuesta.votoUsuario ? 'Tu respuesta fue actualizada' : 'Tu voto fue registrado' });
    await cargar();
  };

  if (cargando) {
    return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Cargando encuestas…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold text-foreground"><Vote className="h-5 w-5 text-primary" /> Encuestas</h3>
          <p className="text-sm text-muted-foreground">Participación y resultados dentro de tu institución.</p>
        </div>
        {contexto?.puedeCrear && (
          <Button
            onClick={abrirNueva}
            className="gap-2"
            disabled={contexto.rol === 'profesor' && contexto.grupos.length === 0}
          >
            <Plus className="h-4 w-4" /> Nueva encuesta
          </Button>
        )}
      </div>

      {contexto?.puedeCrear && contexto.rol === 'profesor' && contexto.grupos.length === 0 && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-5 text-sm text-muted-foreground">
            Necesitas tener al menos un grupo activo asignado para crear encuestas a alumnos.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {encuestas.map((encuesta) => (
          <Card key={encuesta.id} className="overflow-hidden border-border bg-card text-card-foreground">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg leading-snug">{encuesta.titulo}</CardTitle>
                  <p className="text-xs text-muted-foreground">Por {encuesta.creadorNombre}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <Badge variant={encuesta.cerrada ? 'secondary' : 'default'}>{encuesta.cerrada ? 'Cerrada' : 'Activa'}</Badge>
                  <Badge variant="outline">{encuesta.audiencia === 'alumno' ? 'Alumnos' : 'Profesores'}</Badge>
                </div>
              </div>
              {encuesta.descripcion && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{encuesta.descripcion}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {encuesta.grupoNombre || `Todos los ${encuesta.audiencia === 'alumno' ? 'alumnos' : 'profesores'}`}</span>
                {encuesta.cierraEn && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Cierra {fechaLegible(encuesta.cierraEn)}</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {encuesta.puedeVotar && (
                <RadioGroup
                  value={selecciones[encuesta.id] || ''}
                  onValueChange={(value) => setSelecciones((actual) => ({ ...actual, [encuesta.id]: value }))}
                  className="space-y-2"
                >
                  {encuesta.opciones.map((opcion) => (
                    <Label
                      key={opcion.id}
                      htmlFor={`${encuesta.id}-${opcion.id}`}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-muted/50"
                    >
                      <RadioGroupItem id={`${encuesta.id}-${opcion.id}`} value={opcion.id} />
                      <span className="font-normal text-foreground">{opcion.texto}</span>
                    </Label>
                  ))}
                </RadioGroup>
              )}

              {!encuesta.puedeVotar && !encuesta.mostrarResultados && (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Esta encuesta no está disponible para responder.</p>
              )}

              {encuesta.mostrarResultados && (
                <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" /> Resultados</span>
                    <span>{encuesta.totalVotos} de {encuesta.totalDestinatarios} respuestas</span>
                  </div>
                  {encuesta.opciones.map((opcion) => (
                    <div key={opcion.id} className="space-y-1.5">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-foreground">{opcion.texto}</span>
                        <span className="shrink-0 font-semibold text-primary">{opcion.porcentaje}% · {opcion.votos}</span>
                      </div>
                      <Progress value={opcion.porcentaje} className="h-2" />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Publicada {fechaLegible(encuesta.createdAt)}</span>
                <div className="flex gap-2">
                  {encuesta.puedeVotar && (
                    <Button size="sm" onClick={() => votar(encuesta)} disabled={votandoId === encuesta.id || !selecciones[encuesta.id]}>
                      {votandoId === encuesta.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {encuesta.votoUsuario ? 'Cambiar voto' : 'Registrar voto'}
                    </Button>
                  )}
                  {encuesta.puedeGestionar && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirEdicion(encuesta)}><Edit3 className="h-3.5 w-3.5" /> Editar</Button>
                      <Button size="sm" variant="destructive" className="gap-1" onClick={() => setEncuestaBorrando(encuesta)}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {encuestas.length === 0 && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Vote className="h-8 w-8 text-primary" />
            <p className="font-semibold text-foreground">No hay encuestas todavía</p>
            <p className="max-w-md text-sm text-muted-foreground">Cuando se publique una encuesta dirigida a tu perfil aparecerá aquí.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogoAbierto} onOpenChange={(open) => !guardando && setDialogoAbierto(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{encuestaEditando ? 'Editar encuesta' : 'Nueva encuesta'}</DialogTitle>
            <DialogDescription>Define la pregunta, su audiencia y las opciones disponibles.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="encuesta-titulo">Título</Label>
              <Input id="encuesta-titulo" maxLength={160} value={formulario.titulo} onChange={(event) => setFormulario((actual) => ({ ...actual, titulo: event.target.value }))} placeholder="¿Qué opción prefieres?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="encuesta-descripcion">Descripción opcional</Label>
              <Textarea id="encuesta-descripcion" maxLength={2000} rows={3} value={formulario.descripcion} onChange={(event) => setFormulario((actual) => ({ ...actual, descripcion: event.target.value }))} placeholder="Agrega contexto o instrucciones para responder." />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Dirigida a</Label>
                <Select
                  value={formulario.audiencia}
                  disabled={contexto?.rol === 'profesor'}
                  onValueChange={(value: AudienciaEncuesta) => setFormulario((actual) => ({ ...actual, audiencia: value, grupoId: value === 'profesor' ? '' : actual.grupoId }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alumno">Alumnos</SelectItem>
                    {contexto?.puedeEncuestarProfesores && <SelectItem value="profesor">Profesores</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              {formulario.audiencia === 'alumno' && (
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Select value={formulario.grupoId || 'todos'} onValueChange={(value) => setFormulario((actual) => ({ ...actual, grupoId: value === 'todos' ? '' : value }))}>
                    <SelectTrigger><SelectValue placeholder="Selecciona un grupo" /></SelectTrigger>
                    <SelectContent>
                      {contexto?.rol !== 'profesor' && <SelectItem value="todos">Todos los alumnos</SelectItem>}
                      {contexto?.grupos.map((grupo) => <SelectItem key={grupo.id} value={grupo.id}>{grupo.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Opciones</Label>
                <span className="text-xs text-muted-foreground">De 2 a 10 opciones</span>
              </div>
              {formulario.opciones.map((opcion, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input maxLength={300} value={opcion} onChange={(event) => cambiarOpcion(index, event.target.value)} placeholder={`Opción ${index + 1}`} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar opción ${index + 1}`} disabled={formulario.opciones.length <= 2} onClick={() => quitarOpcion(index)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" disabled={formulario.opciones.length >= 10} onClick={() => setFormulario((actual) => ({ ...actual, opciones: [...actual.opciones, ''] }))} className="gap-1"><Plus className="h-3.5 w-3.5" /> Agregar opción</Button>
            </div>

            <div className="grid items-end gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="encuesta-cierre">Fecha de cierre opcional</Label>
                <Input id="encuesta-cierre" type="datetime-local" value={formulario.cierraEn} onChange={(event) => setFormulario((actual) => ({ ...actual, cierraEn: event.target.value }))} />
              </div>
              {encuestaEditando && (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="encuesta-activa">Encuesta activa</Label>
                    <p className="text-xs text-muted-foreground">Al apagarla ya no acepta votos.</p>
                  </div>
                  <Switch id="encuesta-activa" checked={formulario.activa} onCheckedChange={(activa) => setFormulario((actual) => ({ ...actual, activa }))} />
                </div>
              )}
            </div>

            {encuestaEditando && encuestaEditando.totalVotos > 0 && (
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Si modificas el texto, orden o cantidad de opciones, los votos anteriores se reiniciarán para conservar resultados coherentes.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAbierto(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {encuestaEditando ? 'Guardar cambios' : 'Publicar encuesta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(encuestaBorrando)} onOpenChange={(open) => !open && !guardando && setEncuestaBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta encuesta?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán también sus opciones y votos. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={guardando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={confirmarBorrado} disabled={guardando}>
                {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Eliminar definitivamente
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
