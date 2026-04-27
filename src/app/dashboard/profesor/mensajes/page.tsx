'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Send, Check, CheckCheck, Eye, Globe, Users, BookOpen, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  enviarMensaje, obtenerMensajesUsuario, obtenerConversacion,
  marcarComoLeido, marcarComunicadoVisto, obtenerAdminId,
} from '@/lib/actions/mensajes';

export default function MensajesProfesor() {
  const { toast } = useToast();
  const supabase = createClient();
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState('avisos');
  const [globales, setGlobales] = useState<any[]>([]);
  const [mensajesChat, setMensajesChat] = useState<any[]>([]);
  const [nuevoMsg, setNuevoMsg] = useState('');
  const [adminId, setAdminId] = useState('');
  const [adminNombre, setAdminNombre] = useState('Dirección');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
    obtenerAdminId().then(res => { if (res.success) { setAdminId(res.id); setAdminNombre(res.nombre); } });
  }, []);

  const cargarDatos = useCallback(async () => {
    if (!userId) return;
    const res = await obtenerMensajesUsuario(userId);
    if (res.success && res.data) {
      const d = res.data as { globales: any[]; individuales: any[] };
      setGlobales(d.globales || []);
    }
  }, [userId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const cargarChat = useCallback(async () => {
    if (!userId || !adminId) return;
    const res = await obtenerConversacion(userId, adminId);
    if (res.success) {
      setMensajesChat(res.data);
      for (const m of res.data) { if (m.destinatario_id === userId && !m.leido) await marcarComoLeido(m.id); }
    }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [userId, adminId]);

  useEffect(() => { if (tab === 'chat') cargarChat(); }, [tab, cargarChat]);

  // ═══ REALTIME ═══
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel('mensajes-profesor')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_internos' }, (payload) => {
        const msg = payload.new as any;
        if (msg.tipo_destino === 'INDIVIDUAL' && (msg.destinatario_id === userId || msg.remitente_id === userId)) {
          setMensajesChat(prev => [...prev, msg]);
          if (msg.destinatario_id === userId && !msg.leido) marcarComoLeido(msg.id);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
        if (msg.tipo_destino !== 'INDIVIDUAL') cargarDatos();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes_internos' }, (payload) => {
        const msg = payload.new as any;
        if (msg.tipo_destino === 'INDIVIDUAL') setMensajesChat(prev => prev.map(m => m.id === msg.id ? msg : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mensajes_internos' }, (payload) => {
        const old = payload.old as any;
        setMensajesChat(prev => prev.filter(m => m.id !== old.id));
        setGlobales(prev => prev.filter(g => g.id !== old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, cargarDatos]);

  const enviarMsg = async () => {
    if (!nuevoMsg.trim() || !adminId) return;
    const res = await enviarMensaje({ remitente_id: userId, destinatario_id: adminId, tipo_destino: 'INDIVIDUAL', contenido: nuevoMsg });
    if (res.success) { setNuevoMsg(''); }
    else toast({ variant: 'destructive', title: 'Error', description: res.error });
  };

  const marcarVisto = async (msgId: string) => {
    await marcarComunicadoVisto(msgId, userId);
    setGlobales(prev => prev.map(g => g.id === msgId ? { ...g, yaVisto: true } : g));
    toast({ title: '✓ Marcado como visto' });
  };

  const fmt = (f: string) => { const d = new Date(f); return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); };
  const tipoIcon = (t: string) => t === 'GLOBAL' ? <Globe size={12} /> : t === 'GRUPO' ? <Users size={12} /> : t === 'CARRERA' ? <BookOpen size={12} /> : <Megaphone size={12} />;
  const noVistosCount = globales.filter(g => !g.yaVisto).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2"><MessageSquare size={28} /> Mensajes</h2>
        <p className="text-muted-foreground">Avisos institucionales y chat con Dirección.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="avisos" className="gap-1">📢 Avisos {noVistosCount > 0 && <Badge className="bg-red-500 text-white text-[9px] h-4 px-1.5 rounded-full">{noVistosCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="chat">💬 Chat con Dirección</TabsTrigger>
        </TabsList>
        <TabsContent value="avisos">
          <div className="space-y-3">
            {globales.map(g => (
              <Card key={g.id} className={cn('rounded-2xl transition-all', g.yaVisto ? 'opacity-60 border-gray-200' : 'border-l-4 border-l-primary shadow-md')}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', g.yaVisto ? 'bg-gray-100 text-gray-400' : 'bg-primary/10 text-primary')}>{tipoIcon(g.tipo_destino)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[8px] font-black uppercase">{g.tipo_destino}</Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">{fmt(g.created_at)}</span>
                      </div>
                      <p className="text-sm leading-relaxed">{g.contenido}</p>
                    </div>
                    {!g.yaVisto ? <Button variant="outline" size="sm" className="shrink-0 rounded-xl text-xs gap-1" onClick={() => marcarVisto(g.id)}><Eye size={12} /> Marcar visto</Button>
                      : <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1"><CheckCheck size={14} /> Visto</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {globales.length === 0 && <p className="text-center text-muted-foreground py-10">No hay avisos por el momento.</p>}
          </div>
        </TabsContent>
        <TabsContent value="chat">
          <Card className="rounded-2xl overflow-hidden border">
            <div className="p-3 bg-white border-b flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white font-black text-sm">EZ</div>
              <div><p className="font-bold text-sm">{adminNombre}</p><p className="text-[10px] text-muted-foreground">Dirección Instituto Emiliano Zapata</p></div>
            </div>
            <div className="h-[50vh] overflow-y-auto p-4 space-y-2 bg-[#f0ebe3]">
              {mensajesChat.length === 0 && <div className="text-center text-muted-foreground text-sm py-10"><MessageSquare size={32} className="mx-auto mb-2 opacity-20" /><p>Inicia una conversación con Dirección</p></div>}
              {mensajesChat.map(m => {
                const esMio = m.remitente_id === userId;
                const isDeleted = m.contenido === '🚫 Este mensaje fue eliminado';
                return (
                  <div key={m.id} className={cn('flex', esMio ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[75%] rounded-2xl px-4 py-2 shadow-sm', isDeleted ? 'bg-gray-100 text-gray-500 italic rounded-br-md rounded-bl-md' : esMio ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-white rounded-bl-md')}>
                      <p className="text-sm whitespace-pre-wrap">{m.contenido}</p>
                      <div className={cn('flex items-center gap-1 mt-1', esMio ? 'justify-end' : '')}>
                        <span className={cn('text-[9px]', isDeleted ? 'text-gray-400' : esMio ? 'text-primary-foreground/60' : 'text-muted-foreground')}>{fmt(m.created_at)}</span>
                        {esMio && !isDeleted && (m.leido ? <CheckCheck size={12} className="text-blue-300" /> : <Check size={12} className="text-primary-foreground/40" />)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 bg-white border-t flex gap-2">
              <Input value={nuevoMsg} onChange={e => setNuevoMsg(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1" onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMsg()} />
              <Button onClick={enviarMsg} className="rounded-xl"><Send size={16} /></Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
