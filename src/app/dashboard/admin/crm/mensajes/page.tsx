
"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, MessageSquare, Clock, Edit, Loader2, User, MoreHorizontal, Calendar, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { updateCRMStatus } from '@/lib/actions/users';
import { ScrollArea } from '@/components/ui/scroll-area';

const STAGES = [
  { id: 'nuevo', label: 'Nuevos Clientes', color: 'bg-amber-500' },
  { id: 'contactando', label: 'Contactando', color: 'bg-blue-500' },
  { id: 'cita', label: 'Cita Programada', color: 'bg-purple-500' },
  { id: 'interesado', label: 'Interesados', color: 'bg-emerald-500' },
  { id: 'inscrito', label: 'Ya Inscrito', color: 'bg-indigo-700' },
  { id: 'descartado', label: 'Descartados', color: 'bg-slate-400' },
];

export default function MensajesCRM() {
  const { toast } = useToast();
  const supabase = createClient();
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  const fetchMensajes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mensajes_contacto')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setMensajes(data || []);
    } catch (err: any) {
      console.error("Error fetching mensajes:", err);
      toast({ variant: "destructive", title: "Error de conexión", description: "No se pudieron cargar los prospectos." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMensajes(); }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    // Optimistic update
    setMensajes(prev => prev.map(m => m.id === id ? { ...m, estatus: newStatus } : m));
    
    const result = await updateCRMStatus('mensajes_contacto', id, { estatus: newStatus });
    if (!result.success) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el estado." });
      fetchMensajes(); // Rollback
    } else {
      toast({ title: "Estado actualizado", description: `Prospecto movido a ${newStatus}` });
    }
  };

  const handleSaveNote = async () => {
    if (!selectedMsg) return;
    const result = await updateCRMStatus('mensajes_contacto', selectedMsg.id, { notas: note });
    if (result.success) {
      toast({ title: "Nota guardada" });
      setIsNoteOpen(false);
      fetchMensajes();
    }
  };

  const getMessagesByStage = (stageId: string) => {
    return mensajes.filter(m => (m.estatus || 'nuevo') === stageId);
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-6">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Pipeline de Ventas</h2>
          <p className="text-muted-foreground text-sm font-medium">Gestiona el flujo de atención a prospectos interesados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-white border-primary/20 text-primary px-3 py-1 font-bold">
            {mensajes.length} TOTAL LEADS
          </Badge>
        </div>
      </div>

      <ScrollArea className="w-full h-full pb-4">
        <div className="flex gap-6 min-w-max h-full px-1">
          {STAGES.map((stage) => {
            const stageMessages = getMessagesByStage(stage.id);
            return (
              <div key={stage.id} className="w-80 flex flex-col bg-slate-100/50 rounded-2xl border border-slate-200/60 p-3 shadow-sm">
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                    <h3 className="font-black text-sm uppercase tracking-wider text-slate-700">{stage.label}</h3>
                  </div>
                  <Badge variant="secondary" className="bg-white shadow-sm text-[10px] font-black h-5">
                    {stageMessages.length}
                  </Badge>
                </div>

                <div className="flex-1 space-y-3">
                  {loading && mensajes.length === 0 ? (
                    <div className="flex justify-center py-10 opacity-50"><Loader2 className="animate-spin" /></div>
                  ) : stageMessages.map((msg) => (
                    <Card key={msg.id} className="border-none shadow-md hover:shadow-lg transition-all duration-300 group overflow-hidden bg-white">
                      <CardHeader className="p-4 pb-2 space-y-0">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                            <Clock size={10} /> {new Date(msg.created_at).toLocaleDateString()}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-primary"
                            onClick={() => { setSelectedMsg(msg); setNote(msg.notas || ''); setIsNoteOpen(true); }}
                          >
                            <Edit size={12} />
                          </Button>
                        </div>
                        <CardTitle className="text-sm font-black text-slate-800 leading-tight">
                          {msg.nombre}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 space-y-3">
                        <div className="text-[10px] space-y-1.5 font-medium text-slate-600">
                          <div className="flex items-center gap-2"><Phone size={10} className="text-primary/60" /> {msg.telefono}</div>
                          <div className="flex items-center gap-2"><Mail size={10} className="text-primary/60" /> {msg.email}</div>
                        </div>

                        {msg.mensaje && (
                          <div className="p-2 bg-slate-50 rounded-md text-[10px] italic text-slate-500 border-l-2 border-primary/20 line-clamp-2">
                            "{msg.mensaje}"
                          </div>
                        )}

                        {msg.notas && (
                          <div className="p-2 bg-amber-50/50 rounded-md text-[9px] border border-amber-100 text-amber-800">
                            <strong>Nota:</strong> {msg.notas}
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex gap-2">
                          <Select 
                            value={msg.estatus || 'nuevo'} 
                            onValueChange={(val) => handleStatusChange(msg.id, val)}
                          >
                            <SelectTrigger className="h-7 text-[9px] bg-slate-50 font-bold uppercase tracking-tighter">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map(s => (
                                <SelectItem key={s.id} value={s.id} className="text-[10px] font-bold uppercase">
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <div className="flex gap-1">
                            <a href={`tel:${msg.telefono}`}>
                              <Button variant="outline" size="icon" className="h-7 w-7 border-slate-200 hover:bg-primary/10 hover:text-primary hover:border-primary/30 shadow-sm">
                                <Phone size={12} />
                              </Button>
                            </a>
                            <a href={`mailto:${msg.email}`}>
                              <Button variant="outline" size="icon" className="h-7 w-7 border-slate-200 hover:bg-primary/10 hover:text-primary hover:border-primary/30 shadow-sm">
                                <Mail size={12} />
                              </Button>
                            </a>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {!loading && stageMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 opacity-30">
                      <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-400 mb-2 flex items-center justify-center">
                        <Info size={20} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest">Sin leads</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User size={18} className="text-primary" /> Seguimiento de {selectedMsg?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Notas del Prospecto</label>
              <Textarea 
                value={note} 
                onChange={(e) => setNote(e.target.value)} 
                placeholder="Escribe aquí los detalles de la llamada, acuerdos o interés particular..." 
                className="min-h-[120px] bg-slate-50 border-slate-200 focus:ring-primary/20" 
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsNoteOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveNote} className="bg-primary px-8">Guardar Seguimiento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
