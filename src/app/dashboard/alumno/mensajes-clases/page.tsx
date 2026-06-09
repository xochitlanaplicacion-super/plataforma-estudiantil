'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Send, Check, CheckCheck, Eye, Users, BookOpen, User, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import {
  enviarMensajeClase,
  obtenerAvisosClase,
  obtenerChatGrupal,
  obtenerChatIndividual,
  obtenerContactosAlumno,
  obtenerGruposAlumno,
  marcarMensajeClaseLeido,
  marcarAvisoClaseVisto
} from '@/lib/actions/mensajes_clases';

type Contacto = {
  profesor_id: string;
  profesor_nombre: string;
  materia_nombre: string;
  grupo_nombre: string;
};

type GrupoClase = {
  materia_id: string;
  materia_nombre: string;
  grupo_id: string;
  grupo_nombre: string;
};

export default function MensajesClasesAlumno() {
  const { toast } = useToast();
  const supabase = createClient();
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState('avisos');
  const [alumnoNombre, setAlumnoNombre] = useState('Alumno');
  
  // Data states
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [grupos, setGrupos] = useState<GrupoClase[]>([]);
  const [avisos, setAvisos] = useState<any[]>([]);
  const [mensajesChat, setMensajesChat] = useState<any[]>([]);
  
  // Selection states
  const [selectedGrupo, setSelectedGrupo] = useState<GrupoClase | null>(null);
  const [selectedContacto, setSelectedContacto] = useState<Contacto | null>(null);
  const [nuevoMsg, setNuevoMsg] = useState('');
  
  // Typing indicators
  const [escribiendo, setEscribiendo] = useState<Record<string, string>>({});
  
  // Unread counts
  const [unreadDirectos, setUnreadDirectos] = useState<Record<string, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { 
      if (data.user) setUserId(data.user.id); 
    });
    const obtenerNombre = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if(user) {
        const { data } = await supabase.from('profiles').select('nombre').eq('id', user.id).single();
        if(data) setAlumnoNombre(data.nombre);
      }
    };
    obtenerNombre();
  }, [supabase]);

  const cargarDatosIniciales = useCallback(async () => {
    if (!userId) return;
    const [resContactos, resAvisos, resGrupos, resUnread] = await Promise.all([
      obtenerContactosAlumno(userId),
      obtenerAvisosClase(userId, 'alumno'),
      obtenerGruposAlumno(userId),
      supabase.from('mensajes_clases').select('remitente_id').eq('destinatario_id', userId).eq('leido', false).eq('tipo_mensaje', 'INDIVIDUAL')
    ]);

    if (resContactos.success && resContactos.data) {
      setContactos(resContactos.data);
    }
    if (resGrupos.success && resGrupos.data) {
      setGrupos(resGrupos.data);
    }
    if (resAvisos.success && resAvisos.data) {
      setAvisos(resAvisos.data);
    }
    if (resUnread.data) {
      const counts = resUnread.data.reduce((acc: Record<string, number>, curr: any) => {
        acc[curr.remitente_id] = (acc[curr.remitente_id] || 0) + 1;
        return acc;
      }, {});
      setUnreadDirectos(counts);
    }
  }, [userId]);

  useEffect(() => { cargarDatosIniciales(); }, [cargarDatosIniciales]);

  const cargarChat = useCallback(async () => {
    if (!userId) return;
    if (tab === 'grupales' && selectedGrupo) {
      const res = await obtenerChatGrupal(selectedGrupo.materia_id, selectedGrupo.grupo_id);
      if (res.success) setMensajesChat(res.data || []);
    } else if (tab === 'directos' && selectedContacto) {
      const res = await obtenerChatIndividual(userId, selectedContacto.profesor_id);
      if (res.success) {
        setMensajesChat(res.data || []);
        // Marcar leídos
        res.data?.forEach(m => {
          if (m.destinatario_id === userId && !m.leido) marcarMensajeClaseLeido(m.id);
        });
      }
    }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    configurarRealtimePresence();
  }, [userId, tab, selectedGrupo, selectedContacto]);

  useEffect(() => {
    if (tab === 'grupales' && selectedGrupo) cargarChat();
    if (tab === 'directos' && selectedContacto) cargarChat();
    if (tab === 'avisos') setMensajesChat([]);
  }, [tab, selectedGrupo, selectedContacto, cargarChat]);

  // ==== REALTIME DB ====
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel('mensajes-clases-alumno')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_clases' }, (payload) => {
        const msg = payload.new as any;
        
        if (msg.tipo_mensaje === 'AVISO') {
          cargarDatosIniciales();
          return;
        }

        const msgCompleto = { ...msg };

        let esDelChatActual = false;
        if (tab === 'grupales' && selectedGrupo && msgCompleto.tipo_mensaje === 'CHAT_GRUPAL' && msgCompleto.materia_id === selectedGrupo.materia_id && msgCompleto.grupo_id === selectedGrupo.grupo_id) {
          esDelChatActual = true;
        } else if (tab === 'directos' && selectedContacto && msgCompleto.tipo_mensaje === 'INDIVIDUAL' && (msgCompleto.remitente_id === userId || msgCompleto.destinatario_id === userId) && (msgCompleto.remitente_id === selectedContacto.profesor_id || msgCompleto.destinatario_id === selectedContacto.profesor_id)) {
          esDelChatActual = true;
        }

        if (esDelChatActual) {
          if (msgCompleto.tipo_mensaje === 'CHAT_GRUPAL') {
            msgCompleto.remitente_nombre = 'Usuario'; 
            msgCompleto.remitente_rol = msgCompleto.remitente_id === userId ? 'alumno' : 'profesor';
            setMensajesChat(prev => {
              if (prev.some(m => m.id === msgCompleto.id)) return prev;
              return [...prev, msgCompleto];
            });
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          } else {
            setMensajesChat(prev => {
              if (prev.some(m => m.id === msgCompleto.id)) return prev;
              return [...prev, msgCompleto];
            });
            if (msgCompleto.destinatario_id === userId && !msgCompleto.leido) marcarMensajeClaseLeido(msgCompleto.id);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          }
        } else {
          // Si el mensaje es para mí, individual y no estoy en ese chat actual, aumentar contador
          if (msgCompleto.tipo_mensaje === 'INDIVIDUAL' && msgCompleto.destinatario_id === userId) {
            setUnreadDirectos(prev => ({ ...prev, [msgCompleto.remitente_id]: (prev[msgCompleto.remitente_id] || 0) + 1 }));
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes_clases' }, (payload) => {
        const msg = payload.new as any;
        setMensajesChat(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [userId, tab, selectedGrupo, selectedContacto, cargarDatosIniciales, cargarChat]);

  // ==== PRESENCE (Typing Indicators) ====
  const configurarRealtimePresence = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    let roomName = '';
    if (tab === 'grupales' && selectedGrupo) {
      roomName = `chat_grupal_${selectedGrupo.grupo_id}_${selectedGrupo.materia_id}`;
    } else if (tab === 'directos' && selectedContacto) {
      const ids = [userId, selectedContacto.profesor_id].sort();
      roomName = `chat_indiv_${ids[0]}_${ids[1]}`;
    } else {
      setEscribiendo({});
      return;
    }

    const channel = supabase.channel(roomName, {
      config: { presence: { key: userId } }
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const typing: Record<string, string> = {};
      Object.keys(state).forEach(key => {
        if (key !== userId) {
          const presences = state[key] as any[];
          presences.forEach(p => {
            if (p.isTyping) typing[key] = p.userName || 'Usuario';
          });
        }
      });
      setEscribiendo(typing);
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ isTyping: false, userName: alumnoNombre.split(' ')[0] });
      }
    });

    channelRef.current = channel;
  };

  const handleTyping = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setNuevoMsg(e.target.value);
    if (channelRef.current) {
      await channelRef.current.track({ isTyping: e.target.value.length > 0, userName: alumnoNombre.split(' ')[0] });
    }
  };

  // ==== ACCIONES ====
  const enviarMsgChat = async () => {
    if (!nuevoMsg.trim() || !userId) return;
    
    let res;
    if (tab === 'grupales' && selectedGrupo) {
      res = await enviarMensajeClase({
        remitente_id: userId,
        materia_id: selectedGrupo.materia_id,
        grupo_id: selectedGrupo.grupo_id,
        tipo_mensaje: 'CHAT_GRUPAL',
        contenido: nuevoMsg
      });
    } else if (tab === 'directos' && selectedContacto) {
      res = await enviarMensajeClase({
        remitente_id: userId,
        destinatario_id: selectedContacto.profesor_id,
        tipo_mensaje: 'INDIVIDUAL',
        contenido: nuevoMsg
      });
    }

    if (res && res.success) {
      setNuevoMsg('');
      if (channelRef.current) await channelRef.current.track({ isTyping: false, userName: alumnoNombre.split(' ')[0] });

      if (res.data) {
        const msgInsertado = res.data;
        setMensajesChat(prev => {
          if (prev.some(m => m.id === msgInsertado.id)) return prev;
          return [...prev, {
            ...msgInsertado,
            remitente_nombre: 'Yo',
            remitente_rol: 'alumno'
          }];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res?.error || 'Error desconocido' });
    }
  };

  const marcarAvisoVisto = async (msgId: string) => {
    await marcarAvisoClaseVisto(msgId, userId);
    setAvisos(prev => prev.map(g => g.id === msgId ? { ...g, yaVisto: true } : g));
  };

  const fmt = (f: string) => { const d = new Date(f); return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); };

  const contactosPorMateria = contactos.reduce((acc, curr) => {
    if (!acc[curr.materia_nombre]) acc[curr.materia_nombre] = [];
    acc[curr.materia_nombre].push(curr);
    return acc;
  }, {} as Record<string, Contacto[]>);

  const usuariosEscribiendoTxt = Object.values(escribiendo).length > 0 
    ? `${Object.values(escribiendo).join(', ')} está${Object.values(escribiendo).length > 1 ? 'n' : ''} escribiendo...` 
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2"><BookOpen size={28} /> Mensajes de Clases</h2>
        <p className="text-muted-foreground">Revisa los avisos de tus profesores y comunícate con ellos o con tu grupo de clase.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="avisos" className="gap-1"><Megaphone size={16} /> Avisos de Profesores</TabsTrigger>
          <TabsTrigger value="grupales" className="gap-1"><Users size={16} /> Chats de Clase</TabsTrigger>
          <TabsTrigger value="directos" className="gap-1"><User size={16} /> Chat Directo</TabsTrigger>
        </TabsList>

        <TabsContent value="avisos">
          <div className="max-w-4xl space-y-4">
            {avisos.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center bg-gray-50 rounded-xl border border-dashed">No hay avisos de tus profesores por ahora.</p>}
            {avisos.map(a => (
              <Card key={a.id} className={cn("rounded-xl transition-all", a.yaVisto ? 'opacity-70' : 'border-l-4 border-l-primary shadow-sm')}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold">{a.materia_nombre}</Badge>
                      <Badge variant="secondary" className="text-[10px] uppercase">Prof. {a.remitente_nombre}</Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{fmt(a.created_at)}</span>
                  </div>
                  <p className="text-sm my-3 leading-relaxed">{a.contenido}</p>
                  <div className="flex justify-end mt-2 pt-2">
                    {!a.yaVisto ? (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => marcarAvisoVisto(a.id)}>Marcar como leído</Button>
                    ) : (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-bold"><CheckCheck size={14}/> Visto</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="grupales">
          <Card className="rounded-2xl border overflow-hidden flex h-[600px] shadow-sm">
            <div className="w-1/3 border-r bg-muted/10 overflow-y-auto">
              <div className="p-4 border-b bg-white sticky top-0"><h3 className="font-bold text-sm">Mis Clases</h3></div>
              <div className="p-2 space-y-1">
                {grupos.length === 0 && <p className="text-xs text-center p-4 text-muted-foreground">No tienes clases asignadas.</p>}
                {grupos.map(g => {
                  const isSelected = selectedGrupo?.materia_id === g.materia_id && selectedGrupo?.grupo_id === g.grupo_id;
                  return (
                    <button 
                      key={`${g.materia_id}_${g.grupo_id}`}
                      className={cn("w-full text-left p-3 rounded-xl transition-all text-sm", isSelected ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-primary/5")}
                      onClick={() => setSelectedGrupo(g)}
                    >
                      <p className="font-bold truncate">{g.materia_nombre}</p>
                      <p className={cn("text-[11px]", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>Chat de Clase</p>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="w-2/3 flex flex-col bg-[#f0ebe3]">
              {selectedGrupo ? (
                <>
                  <div className="p-3 bg-white border-b flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary"><Users size={20} /></div>
                    <div>
                      <p className="font-bold text-sm">{selectedGrupo.materia_nombre}</p>
                      <p className="text-[11px] text-muted-foreground font-semibold">Grupo {selectedGrupo.grupo_nombre}</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {mensajesChat.length === 0 && <p className="text-center text-muted-foreground text-xs py-10 bg-white/50 rounded-xl">Inicia la conversación en esta clase.</p>}
                    {mensajesChat.map(m => {
                      const esMio = m.remitente_id === userId;
                      const esProfe = m.remitente_rol === 'profesor';
                      return (
                        <div key={m.id} className={cn('flex flex-col', esMio ? 'items-end' : 'items-start')}>
                          {!esMio && <span className={cn("text-[10px] font-bold ml-1 mb-1", esProfe ? "text-blue-600" : "text-muted-foreground")}>{m.remitente_nombre} {esProfe && '(Profesor)'}</span>}
                          <div className={cn('max-w-[75%] rounded-2xl px-4 py-2 shadow-sm', esMio ? 'bg-primary text-primary-foreground rounded-tr-sm' : esProfe ? 'bg-blue-100 border border-blue-200 rounded-tl-sm' : 'bg-white rounded-tl-sm')}>
                            <p className={cn("text-sm whitespace-pre-wrap", esProfe && !esMio ? "text-blue-900" : "")}>{m.contenido}</p>
                            <div className={cn('flex items-center gap-1 mt-1 justify-end')}>
                              <span className={cn('text-[9px]', esMio ? 'text-primary-foreground/60' : 'text-muted-foreground/60')}>{fmt(m.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  {usuariosEscribiendoTxt && <div className="px-4 py-1 text-[10px] text-muted-foreground italic bg-white/50">{usuariosEscribiendoTxt}</div>}
                  <div className="p-3 bg-white border-t flex gap-2 items-center">
                    <Input value={nuevoMsg} onChange={handleTyping} placeholder="Escribe a la clase..." className="flex-1" onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMsgChat()} />
                    <Button onClick={enviarMsgChat} className="rounded-xl shrink-0"><Send size={16} /></Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2 opacity-50">
                  <Users size={48} />
                  <p>Selecciona una clase</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="directos">
          <Card className="rounded-2xl border overflow-hidden flex h-[600px] shadow-sm">
            <div className="w-1/3 border-r bg-muted/10 overflow-y-auto">
              <div className="p-4 border-b bg-white sticky top-0"><h3 className="font-bold text-sm">Mis Profesores</h3></div>
              <div className="p-2 space-y-2">
                {contactos.length === 0 && <p className="text-xs text-center p-4 text-muted-foreground">No tienes profesores asignados.</p>}
                {contactos.map(c => {
                  const isSelected = selectedContacto?.profesor_id === c.profesor_id;
                  return (
                    <button 
                      key={c.profesor_id}
                      className={cn("w-full text-left p-3 rounded-xl transition-all text-sm flex items-center gap-3", isSelected ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-primary/5 bg-white")}
                      onClick={() => { setSelectedContacto(c); setUnreadDirectos(prev => ({ ...prev, [c.profesor_id]: 0 })); }}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                         <div className="bg-blue-100 text-blue-700 w-full h-full flex items-center justify-center font-bold text-xs">{c.profesor_nombre.charAt(0)}</div>
                      </Avatar>
                      <div className="overflow-hidden">
                        <p className="font-bold truncate text-xs">Prof. {c.profesor_nombre}</p>
                        <p className={cn("text-[9px] truncate", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>{c.materia_nombre}</p>
                      </div>
                      {unreadDirectos[c.profesor_id] > 0 && (
                        <Badge className={cn("ml-auto border-0 h-5 px-1.5 min-w-5 flex items-center justify-center text-[10px] shadow-sm", isSelected ? "bg-white text-primary" : "bg-red-500 text-white")}>
                          {unreadDirectos[c.profesor_id]}
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="w-2/3 flex flex-col bg-[#f0ebe3]">
              {selectedContacto ? (
                <>
                  <div className="p-3 bg-white border-b flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                       <div className="bg-blue-100 text-blue-700 w-full h-full flex items-center justify-center font-bold text-sm">{selectedContacto.profesor_nombre.charAt(0)}</div>
                    </Avatar>
                    <div>
                      <p className="font-bold text-sm">Prof. {selectedContacto.profesor_nombre}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold">Materia: {selectedContacto.materia_nombre}</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {mensajesChat.length === 0 && <p className="text-center text-muted-foreground text-xs py-10 bg-white/50 rounded-xl">Escríbele una duda a tu profesor.</p>}
                    {mensajesChat.map(m => {
                      const esMio = m.remitente_id === userId;
                      return (
                        <div key={m.id} className={cn('flex', esMio ? 'justify-end' : 'justify-start')}>
                          <div className={cn('max-w-[75%] rounded-2xl px-4 py-2 shadow-sm', esMio ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-white rounded-tl-sm')}>
                            <p className="text-sm whitespace-pre-wrap">{m.contenido}</p>
                            <div className={cn('flex items-center gap-1 mt-1 justify-end')}>
                              <span className={cn('text-[9px]', esMio ? 'text-primary-foreground/60' : 'text-muted-foreground/60')}>{fmt(m.created_at)}</span>
                              {esMio && (m.leido ? <CheckCheck size={12} className="text-blue-300" /> : <Check size={12} className="opacity-50" />)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  {usuariosEscribiendoTxt && <div className="px-4 py-1 text-[10px] text-muted-foreground italic bg-white/50">{usuariosEscribiendoTxt}</div>}
                  <div className="p-3 bg-white border-t flex gap-2 items-center">
                    <Input value={nuevoMsg} onChange={handleTyping} placeholder="Mensaje para el profesor..." className="flex-1" onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMsgChat()} />
                    <Button onClick={enviarMsgChat} className="rounded-xl shrink-0"><Send size={16} /></Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2 opacity-50">
                  <User size={48} />
                  <p>Selecciona un profesor</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
