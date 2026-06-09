'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Send, Check, CheckCheck, Eye, Users, BookOpen, User, Megaphone, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  obtenerContactosProfesor,
  obtenerGruposProfesor,
  marcarMensajeClaseLeido,
  marcarAvisoClaseVisto
} from '@/lib/actions/mensajes_clases';

type Contacto = {
  alumno_id: string;
  alumno_nombre: string;
  matricula: string;
  grupo_id: string;
  grupo_nombre: string;
  materia_nombre: string;
};

type GrupoClase = {
  materia_id: string;
  materia_nombre: string;
  grupo_id: string;
  grupo_nombre: string;
};

export default function MensajesClasesProfesor() {
  const { toast } = useToast();
  const supabase = createClient();
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState('avisos');
  
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
  const [escribiendo, setEscribiendo] = useState<Record<string, string>>({}); // socketId -> userName
  
  // Unread counts
  const [unreadDirectos, setUnreadDirectos] = useState<Record<string, number>>({});
  
  // Form states for AVISOS
  const [avisoTexto, setAvisoTexto] = useState('');
  const [avisoDestino, setAvisoDestino] = useState(''); // "materiaId_grupoId"

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
  }, []);

  const cargarDatosIniciales = useCallback(async () => {
    if (!userId) return;
    const [resContactos, resAvisos, resGrupos, resUnread] = await Promise.all([
      obtenerContactosProfesor(userId),
      obtenerAvisosClase(userId, 'profesor'),
      obtenerGruposProfesor(userId),
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

  // Cargar chat seleccionado
  const cargarChat = useCallback(async () => {
    if (!userId) return;
    if (tab === 'grupales' && selectedGrupo) {
      const res = await obtenerChatGrupal(selectedGrupo.materia_id, selectedGrupo.grupo_id);
      if (res.success) setMensajesChat(res.data || []);
    } else if (tab === 'directos' && selectedContacto) {
      const res = await obtenerChatIndividual(userId, selectedContacto.alumno_id);
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
    // Limpiar chat si cambiamos de tab sin selección
    if (tab === 'avisos') setMensajesChat([]);
  }, [tab, selectedGrupo, selectedContacto, cargarChat]);

  // ==== REALTIME DB ====
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel('mensajes-clases-profesor')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_clases' }, (payload) => {
        const msg = payload.new as any;
        
        // Es aviso
        if (msg.tipo_mensaje === 'AVISO') {
          cargarDatosIniciales();
          return;
        }

        // Es chat actual
        let esDelChatActual = false;
        if (tab === 'grupales' && selectedGrupo && msg.tipo_mensaje === 'CHAT_GRUPAL' && msg.materia_id === selectedGrupo.materia_id && msg.grupo_id === selectedGrupo.grupo_id) {
          esDelChatActual = true;
        } else if (tab === 'directos' && selectedContacto && msg.tipo_mensaje === 'INDIVIDUAL' && (msg.remitente_id === userId || msg.destinatario_id === userId) && (msg.remitente_id === selectedContacto.alumno_id || msg.destinatario_id === selectedContacto.alumno_id)) {
          esDelChatActual = true;
        }

        if (esDelChatActual) {
          // Completar datos si es necesario
          let msgCompleto = { ...msg };
          if (msg.tipo_mensaje === 'CHAT_GRUPAL') {
            msgCompleto.remitente_nombre = 'Usuario'; 
            msgCompleto.remitente_rol = msg.remitente_id === userId ? 'profesor' : 'alumno';
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
            if (msg.destinatario_id === userId && !msg.leido) marcarMensajeClaseLeido(msg.id);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          }
        } else {
          // Si el mensaje es para mí, individual y no estoy en ese chat actual, aumentar contador
          if (msg.tipo_mensaje === 'INDIVIDUAL' && msg.destinatario_id === userId) {
            setUnreadDirectos(prev => ({ ...prev, [msg.remitente_id]: (prev[msg.remitente_id] || 0) + 1 }));
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
      const ids = [userId, selectedContacto.alumno_id].sort();
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
            if (p.isTyping) typing[key] = p.userName || 'Alguien';
          });
        }
      });
      setEscribiendo(typing);
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ isTyping: false, userName: 'Profesor' });
      }
    });

    channelRef.current = channel;
  };

  const handleTyping = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setNuevoMsg(e.target.value);
    if (channelRef.current) {
      await channelRef.current.track({ isTyping: e.target.value.length > 0, userName: 'Profesor' });
    }
  };

  // ==== ACCIONES ====
  const enviarAviso = async () => {
    if (!avisoTexto.trim() || !avisoDestino || !userId) return;
    const [materia_id, grupo_id] = avisoDestino.split('_');
    const res = await enviarMensajeClase({
      remitente_id: userId,
      materia_id,
      grupo_id,
      tipo_mensaje: 'AVISO',
      contenido: avisoTexto
    });
    if (res.success) {
      toast({ title: 'Aviso enviado con éxito' });
      setAvisoTexto('');
      setAvisoDestino('');
      cargarDatosIniciales();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  };

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
        destinatario_id: selectedContacto.alumno_id,
        tipo_mensaje: 'INDIVIDUAL',
        contenido: nuevoMsg
      });
    }

    if (res && res.success) {
      setNuevoMsg('');
      if (channelRef.current) await channelRef.current.track({ isTyping: false, userName: 'Profesor' });
      
      if (res.data) {
        const msgInsertado = res.data;
        setMensajesChat(prev => {
          if (prev.some(m => m.id === msgInsertado.id)) return prev;
          return [...prev, {
            ...msgInsertado,
            remitente_nombre: 'Yo',
            remitente_rol: 'profesor'
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

  // Eliminar agrupación por materias para directos, usamos lista única


  const usuariosEscribiendoTxt = Object.values(escribiendo).length > 0 
    ? `${Object.values(escribiendo).join(', ')} está${Object.values(escribiendo).length > 1 ? 'n' : ''} escribiendo...` 
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2"><BookOpen size={28} /> Mensajes de Clases</h2>
        <p className="text-muted-foreground">Comunícate con tus grupos y alumnos (Avisos, Chats Grupales y Directos).</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto flex-nowrap no-scrollbar pb-1">
          <TabsTrigger value="avisos" className="gap-1 shrink-0"><Megaphone size={16} /> Tablón de Avisos</TabsTrigger>
          <TabsTrigger value="grupales" className="gap-1 shrink-0"><Users size={16} /> Chats Grupales</TabsTrigger>
          <TabsTrigger value="directos" className="gap-1 shrink-0"><User size={16} /> Directos</TabsTrigger>
        </TabsList>

        <TabsContent value="avisos">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <Card className="rounded-2xl border sticky top-6">
                <div className="p-4 bg-muted/30 border-b"><h3 className="font-bold text-sm">Publicar Nuevo Aviso</h3></div>
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Destino (Clase - Grupo)</label>
                    <select 
                      className="w-full text-sm p-2 border rounded-md"
                      value={avisoDestino}
                      onChange={(e) => setAvisoDestino(e.target.value)}
                    >
                      <option value="">Selecciona una clase...</option>
                      {grupos.map(g => (
                        <option key={`${g.materia_id}_${g.grupo_id}`} value={`${g.materia_id}_${g.grupo_id}`}>
                          {g.materia_nombre} - {g.grupo_nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Mensaje</label>
                    <Textarea 
                      placeholder="Escribe el aviso aquí..." 
                      className="resize-none" 
                      rows={5}
                      value={avisoTexto}
                      onChange={(e) => setAvisoTexto(e.target.value)}
                    />
                  </div>
                  <Button className="w-full rounded-xl" onClick={enviarAviso} disabled={!avisoDestino || !avisoTexto.trim()}>
                    <Megaphone size={16} className="mr-2"/> Publicar Aviso
                  </Button>
                </CardContent>
              </Card>
            </div>
            <div className="md:col-span-2 space-y-4">
              <h3 className="font-bold text-lg mb-2">Historial de Avisos</h3>
              {avisos.length === 0 && <p className="text-muted-foreground text-sm py-8 text-center bg-gray-50 rounded-xl border border-dashed">No has publicado ni recibido avisos aún.</p>}
              {avisos.map(a => (
                <Card key={a.id} className={cn("rounded-xl transition-all", a.yaVisto ? 'opacity-70' : 'border-l-4 border-l-primary shadow-sm')}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{a.materia_nombre}</Badge>
                        <Badge variant="secondary" className="text-[10px] uppercase">Grupo {a.grupo_nombre}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{fmt(a.created_at)}</span>
                    </div>
                    <p className="text-sm my-3">{a.contenido}</p>
                    <div className="flex justify-between items-center mt-2 border-t pt-2">
                      <span className="text-[10px] font-semibold text-muted-foreground">Por: {a.remitente_nombre}</span>
                      {a.remitente_id !== userId && !a.yaVisto ? (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => marcarAvisoVisto(a.id)}>Marcar Visto</Button>
                      ) : (
                        <span className="text-[10px] text-emerald-600 flex items-center gap-1"><CheckCheck size={12}/> {a.remitente_id === userId ? 'Enviado' : 'Visto'}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="grupales">
          <Card className="rounded-2xl border overflow-hidden flex h-[600px] shadow-sm">
            {/* Lista de Grupos */}
            <div className={cn("border-r bg-muted/10 overflow-y-auto w-full md:w-1/3 shrink-0", selectedGrupo ? "hidden md:block" : "block")}>
              <div className="p-4 border-b bg-white sticky top-0"><h3 className="font-bold text-sm">Mis Clases</h3></div>
              <div className="p-2 space-y-1">
                {grupos.length === 0 && <p className="text-xs text-center p-4 text-muted-foreground">No tienes grupos asignados.</p>}
                {grupos.map(g => {
                  const isSelected = selectedGrupo?.materia_id === g.materia_id && selectedGrupo?.grupo_id === g.grupo_id;
                  return (
                    <button 
                      key={`${g.materia_id}_${g.grupo_id}`}
                      className={cn("w-full text-left p-3 rounded-xl transition-all text-sm", isSelected ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-primary/5")}
                      onClick={() => setSelectedGrupo(g)}
                    >
                      <p className="font-bold truncate">{g.materia_nombre}</p>
                      <p className={cn("text-[11px]", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>Grupo: {g.grupo_nombre}</p>
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Area de Chat Grupal */}
            <div className={cn("flex-col bg-[#f0ebe3] w-full md:w-2/3 flex-1", selectedGrupo ? "flex" : "hidden md:flex")}>
              {selectedGrupo ? (
                <>
                  <div className="p-3 bg-white border-b flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="md:hidden shrink-0 -ml-2" onClick={() => setSelectedGrupo(null)}>
                      <ArrowLeft size={18} />
                    </Button>
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0"><Users size={20} /></div>
                    <div>
                      <p className="font-bold text-sm">{selectedGrupo.materia_nombre}</p>
                      <p className="text-[11px] text-muted-foreground font-semibold">Chat Grupal - {selectedGrupo.grupo_nombre}</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {mensajesChat.length === 0 && <p className="text-center text-muted-foreground text-xs py-10 bg-white/50 rounded-xl">No hay mensajes en este grupo. ¡Inicia la conversación!</p>}
                    {mensajesChat.map(m => {
                      const esMio = m.remitente_id === userId;
                      const esProfe = m.remitente_rol === 'profesor';
                      return (
                        <div key={m.id} className={cn('flex flex-col', esMio ? 'items-end' : 'items-start')}>
                          {!esMio && <span className="text-[10px] font-bold text-muted-foreground ml-1 mb-1">{m.remitente_nombre} {esProfe && '(Profesor)'}</span>}
                          <div className={cn('max-w-[75%] rounded-2xl px-4 py-2 shadow-sm', esMio ? 'bg-primary text-primary-foreground rounded-tr-sm' : esProfe ? 'bg-blue-100 text-blue-900 rounded-tl-sm' : 'bg-white rounded-tl-sm')}>
                            <p className="text-sm whitespace-pre-wrap">{m.contenido}</p>
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
                    <Input value={nuevoMsg} onChange={handleTyping} placeholder="Escribe al grupo..." className="flex-1" onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMsgChat()} />
                    <Button onClick={enviarMsgChat} className="rounded-xl shrink-0"><Send size={16} /></Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2 opacity-50">
                  <Users size={48} />
                  <p>Selecciona un grupo para chatear</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="directos">
          <Card className="rounded-2xl border overflow-hidden flex h-[600px] shadow-sm">
            {/* Lista de Alumnos agrupados por grupo */}
            <div className={cn("border-r bg-muted/10 overflow-y-auto w-full md:w-1/3 shrink-0", selectedContacto ? "hidden md:block" : "block")}>
              <div className="p-4 border-b bg-white sticky top-0"><h3 className="font-bold text-sm">Mis Alumnos</h3></div>
              <div className="p-2 space-y-1">
                {contactos.length === 0 && <p className="text-xs text-center p-4 text-muted-foreground">No tienes alumnos asignados.</p>}
                {(() => {
                  // Agrupar contactos por grupo
                  const porGrupo = contactos.reduce((acc, c) => {
                    const key = c.grupo_id || 'sin_grupo';
                    if (!acc[key]) acc[key] = { nombre: c.grupo_nombre || 'Sin grupo', alumnos: [] };
                    acc[key].alumnos.push(c);
                    return acc;
                  }, {} as Record<string, { nombre: string; alumnos: Contacto[] }>);

                  return Object.entries(porGrupo).map(([grupoId, grupo]) => (
                    <div key={grupoId} className="mb-2">
                      <div className="px-3 py-2 flex items-center gap-2">
                        <Users size={13} className="text-primary/60" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">{grupo.nombre}</span>
                        <Badge variant="secondary" className="text-[9px] ml-auto h-4 px-1.5">{grupo.alumnos.length}</Badge>
                      </div>
                      {grupo.alumnos.map(c => {
                        const isSelected = selectedContacto?.alumno_id === c.alumno_id;
                        return (
                          <button 
                            key={c.alumno_id}
                            className={cn("w-full text-left p-2.5 pl-5 rounded-xl transition-all text-sm flex items-center gap-3", isSelected ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-primary/5")}
                            onClick={() => { setSelectedContacto(c); setUnreadDirectos(prev => ({ ...prev, [c.alumno_id]: 0 })); }}
                          >
                            <Avatar className="h-7 w-7 shrink-0">
                               <div className={cn("w-full h-full flex items-center justify-center font-bold text-xs", isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary")}>{c.alumno_nombre.charAt(0)}</div>
                            </Avatar>
                            <div className="overflow-hidden">
                              <p className="font-semibold truncate text-xs">{c.alumno_nombre}</p>
                              {c.matricula && <p className={cn("text-[9px] truncate", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>{c.matricula}</p>}
                            </div>
                            {unreadDirectos[c.alumno_id] > 0 && (
                              <Badge className={cn("ml-auto border-0 h-5 px-1.5 min-w-5 flex items-center justify-center text-[10px] shadow-sm", isSelected ? "bg-white text-primary" : "bg-red-500 text-white")}>
                                {unreadDirectos[c.alumno_id]}
                              </Badge>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ));
                })()}
              </div>
            </div>
            {/* Area de Chat Individual */}
            <div className={cn("flex-col bg-[#f0ebe3] w-full md:w-2/3 flex-1", selectedContacto ? "flex" : "hidden md:flex")}>
              {selectedContacto ? (
                <>
                  <div className="p-3 bg-white border-b flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="md:hidden shrink-0 -ml-2" onClick={() => setSelectedContacto(null)}>
                      <ArrowLeft size={18} />
                    </Button>
                    <Avatar className="h-10 w-10 shrink-0">
                       <div className="bg-primary text-primary-foreground w-full h-full flex items-center justify-center font-bold text-sm">{selectedContacto.alumno_nombre.charAt(0)}</div>
                    </Avatar>
                    <div>
                      <p className="font-bold text-sm">{selectedContacto.alumno_nombre}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold">Grupo: {selectedContacto.grupo_nombre}</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {mensajesChat.length === 0 && <p className="text-center text-muted-foreground text-xs py-10 bg-white/50 rounded-xl">Inicia la conversación directa con este alumno.</p>}
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
                    <Input value={nuevoMsg} onChange={handleTyping} placeholder="Mensaje directo..." className="flex-1" onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMsgChat()} />
                    <Button onClick={enviarMsgChat} className="rounded-xl shrink-0"><Send size={16} /></Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2 opacity-50">
                  <User size={48} />
                  <p>Selecciona un alumno para chatear</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
