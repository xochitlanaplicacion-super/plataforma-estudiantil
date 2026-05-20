"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Plus, Trash2, CalendarDays, Save, Phone, Mail } from "lucide-react";
import { getConfiguracionBruta, updateConfiguracion, HorarioBloque } from "@/lib/actions/horarios";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

const DAYS_ORDER = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function HorariosAtencionModal() {
  const [open, setOpen] = useState(false);
  const [bloques, setBloques] = useState<HorarioBloque[]>([]);
  const [telefono, setTelefono] = useState<string>("735 2826206");
  const [correo, setCorreo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadHorarios();
    }
  }, [open]);

  const loadHorarios = async () => {
    const data = await getConfiguracionBruta();
    if (data.horarios_atencion && data.horarios_atencion.length > 0) {
      setBloques(data.horarios_atencion);
    } else {
      // Default initial block
      setBloques([{
        dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],
        hora_inicio: "09:00",
        hora_fin: "18:00"
      }]);
    }
    setTelefono(data.telefono_contacto);
    setCorreo(data.correo_contacto);
  };

  const handleDaySelect = (bIndex: number, day: string) => {
    const updated = [...bloques];
    const b = updated[bIndex];
    if (b.dias.includes(day)) {
      b.dias = b.dias.filter(d => d !== day);
    } else {
      b.dias.push(day);
    }
    setBloques(updated);
  };

  const handleTimeChange = (bIndex: number, field: "hora_inicio" | "hora_fin", val: string) => {
    const updated = [...bloques];
    updated[bIndex][field] = val;
    setBloques(updated);
  };

  const handleAddBlock = () => {
    setBloques([...bloques, { dias: [], hora_inicio: "09:00", hora_fin: "18:00" }]);
  };

  const handleRemoveBlock = (bIndex: number) => {
    if (bloques.length > 1) {
      setBloques(bloques.filter((_, i) => i !== bIndex));
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      // Validar que un bloque no este sin dias
      for (const b of bloques) {
        if (b.dias.length === 0) {
          toast({ variant: "destructive", title: "Error", description: "Todos los bloques deben tener al menos un día seleccionado." });
          return;
        }
      }

      const res = await updateConfiguracion(bloques, telefono, correo);
      if (res.success) {
        toast({ title: "Configuración Guardada", description: "La plataforma responderá dinámicamente con los nuevos horarios, teléfono y correo." });
        setOpen(false);
      } else {
        toast({ variant: "destructive", title: "Error al guardar", description: res.error });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Ocurrió un problema inesperado." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex gap-2 text-sm border-primary/20 text-primary hover:bg-primary/5">
          <CalendarDays className="h-4 w-4" />
          Horario de Atención
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex gap-2 items-center text-primary">
            <Clock className="w-5 h-5" /> Configuración General y Horarios
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Configura los medios de contacto y horarios de atención; se verán aplicados automáticamente en correos y pantallas.
          </p>
        </DialogHeader>

        <div className="space-y-6 my-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4" /> Teléfono
              </label>
              <Input 
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 735 2826206" 
              />
            </div>
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" /> Correo Oficial
              </label>
              <Input 
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="ejemplo@escuela.edu" 
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-4 text-primary">Bloques de Horarios de Atención</h4>
            {bloques.map((b, i) => (
            <div key={i} className="p-4 border rounded-xl bg-card shadow-sm space-y-4 relative">
              {bloques.length > 1 && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleRemoveBlock(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              
              <div>
                <label className="text-sm font-semibold text-foreground mb-2 block">Días de Atención</label>
                <div className="flex flex-wrap gap-3">
                  {DAYS_ORDER.map((d) => (
                    <div key={d} className="flex items-center space-x-1.5">
                      <Checkbox 
                        id={`b${i}-${d}`} 
                        checked={b.dias.includes(d)}
                        onCheckedChange={() => handleDaySelect(i, d)}
                      />
                      <label htmlFor={`b${i}-${d}`} className="text-sm cursor-pointer">{d.substring(0,3)}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Hora Inicio</label>
                  <input 
                    type="time" 
                    value={b.hora_inicio}
                    onChange={(e) => handleTimeChange(i, "hora_inicio", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Hora Cierre</label>
                  <input 
                    type="time" 
                    value={b.hora_fin}
                    onChange={(e) => handleTimeChange(i, "hora_fin", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                  />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={handleAddBlock} className="w-full border-dashed border-2">
            <Plus className="mr-2 h-4 w-4" /> Agregar bloque de horario
          </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            <Save className="w-4 h-4" /> {loading ? "Guardando..." : "Guardar Horarios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
