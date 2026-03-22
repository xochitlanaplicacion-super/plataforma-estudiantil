"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Phone, MessageSquare, Clock, Filter, CheckCircle2, MoreVertical, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { updateCRMStatus } from '@/lib/actions/users';

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
    const { data } = await supabase.from('mensajes_contacto').select('*').order('created_at', { ascending: false });
    if (data) setMensajes(data);
    setLoading(false);
  };

  useEffect(() => { fetchMensajes(); }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const result = await updateCRMStatus('mensajes_contacto', id, { estatus: newStatus });
    if (result.success) {
      toast({ title: "Estatus actualizado", description: `Estado cambiado a ${newStatus}` });
      fetchMensajes();
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-primary">Prospectos (Mensajes)</h2>
          <p className="text-muted-foreground">Pipeline de atención inicial a interesados.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? <div className="col-span-full py-20 text-center">Cargando prospectos...</div> : 
          mensajes.map((msg) => (
            <Card key={msg.id} className={`border-l-4 ${msg.estatus === 'nuevo' ? 'border-l-amber-500' : 'border-l-primary/20'}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Badge variant={msg.estatus === 'nuevo' ? 'default' : 'secondary'} className="capitalize text-[10px]">
                    {msg.estatus}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(msg.created_at).toLocaleDateString()}</span>
                </div>
                <CardTitle className="text-lg mt-2">{msg.nombre}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail size={14} /> {msg.email}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone size={14} /> {msg.telefono}</div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-xs italic">"{msg.mensaje || 'Sin mensaje'}"</div>
                
                {msg.notas && <div className="p-2 border rounded-md text-[10px] bg-amber-50 border-amber-200"><strong>Nota:</strong> {msg.notas}</div>}

                <div className="flex gap-2">
                  <Select value={msg.estatus} onValueChange={(val) => handleStatusChange(msg.id, val)}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nuevo">Nuevo</SelectItem>
                      <SelectItem value="contactando">Contactando</SelectItem>
                      <SelectItem value="cita">Cita Programada</SelectItem>
                      <SelectItem value="interesado">Interesado</SelectItem>
                      <SelectItem value="descartado">Descartado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setSelectedMsg(msg); setNote(msg.notas || ''); setIsNoteOpen(true); }}><Edit size={14} /></Button>
                </div>
              </CardContent>
              <div className="px-6 pb-4 flex gap-2">
                <a href={`tel:${msg.telefono}`} className="flex-1"><Button variant="secondary" className="w-full h-8 text-[10px] gap-1"><Phone size={12} /> Llamar</Button></a>
                <a href={`mailto:${msg.email}`} className="flex-1"><Button variant="outline" className="w-full h-8 text-[10px] gap-1"><Mail size={12} /> Correo</Button></a>
              </div>
            </Card>
          ))
        }
      </div>

      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Seguimiento de {selectedMsg?.nombre}</DialogTitle></DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escribe aquí las notas del seguimiento..." className="min-h-[150px]" />
          <DialogFooter><Button onClick={handleSaveNote}>Guardar Nota</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}