'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, X, Send, Maximize2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { enviarMensaje, marcarChatComoLeido, marcarComunicadoVisto } from '@/lib/actions/mensajes';
import { obtenerMensajesGrupalesPendientes, marcarAvisoClaseVisto } from '@/lib/actions/mensajes_clases';

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playNote = (freq: number, startTime: number, duration: number, vol: number = 0.3) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playNote(880, now, 0.15, 0.2); // Tono 1
    playNote(1108.73, now + 0.1, 0.25, 0.2); // Tono 2 (más alto)
  } catch (e) {
    // Ignorar si el navegador bloquea el auto-play
  }
};

interface GlobalChatNotificationProps {
  userId: string;
  userRole: string;
}

export function GlobalChatNotification({ userId, userRole }: GlobalChatNotificationProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatName, setActiveChatName] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');

  // Estado para avisos/comunicados (no responden, solo marcan visto)
  const [activeAviso, setActiveAviso] = useState<{ id: string; contenido: string; remitente: string; tipo: string } | null>(null);
  const [isAvisoOpen, setIsAvisoOpen] = useState(false);

  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [adminLatestSender, setAdminLatestSender] = useState<string | null>(null);
  const [isAdminPopupOpen, setIsAdminPopupOpen] = useState(false);

  // Si estamos en la página de mensajería, no mostramos el popup para no duplicar interfaces
  const isMessagingPage = pathname.includes('/mensajeria') || pathname.includes('/mensajes');
  const isAdmin = userRole === 'admin' || userRole === 'superuser';

  useEffect(() => {
    if (!userId || isMessagingPage) return;

    const checkUnread = async () => {
      if (isAdmin) {
        const { count, error } = await supabase
          .from('mensajes_internos')
          .select('*', { count: 'exact', head: true })
          .eq('tipo_destino', 'INDIVIDUAL')
          .eq('destinatario_id', userId)
          .eq('leido', false);

        if (!error && count && count > 0) {
          setAdminUnreadCount(count);
          setIsAdminPopupOpen(true);
        }
      } else {
        // Alumnos y Profesores: primero buscar comunicados no vistos al iniciar sesión
        const { data: vistosData } = await supabase
          .from('mensajes_vistos')
          .select('mensaje_id')
          .eq('usuario_id', userId);

        const idsVistos = (vistosData || []).map((v: any) => v.mensaje_id);

        // Buscar todos los comunicados (no individuales), excluyendo los ya vistos
        const { data: comunicadosPendientes } = await supabase
          .from('mensajes_internos')
          .select('*, perfiles:remitente_id(nombre, apellidos)')
          .neq('tipo_destino', 'INDIVIDUAL')
          .order('created_at', { ascending: false });

        const comunicadosNoVistos = (comunicadosPendientes || []).filter(
          (c: any) => !idsVistos.includes(c.id)
        );

        if (comunicadosNoVistos.length > 0) {
          const latest = comunicadosNoVistos[0];
          const remitente = latest.perfiles as any;
          const remitenteNombre = remitente ? `${remitente.nombre} ${remitente.apellidos}` : 'Control Escolar';
          setActiveAviso({ id: latest.id, contenido: latest.contenido, remitente: remitenteNombre, tipo: latest.tipo_destino });
          setIsAvisoOpen(true);
        }

        // Buscar mensajes privados no leídos (Internos)
        const { data: internosData, error: internosError } = await supabase
          .from('mensajes_internos')
          .select('*, perfiles:remitente_id(nombre, apellidos)')
          .eq('tipo_destino', 'INDIVIDUAL')
          .eq('destinatario_id', userId)
          .eq('leido', false)
          .order('created_at', { ascending: true });

        // Buscar mensajes privados no leídos (Clases)
        const { data: clasesData, error: clasesError } = await supabase
          .from('mensajes_clases')
          .select('*, profiles:remitente_id(nombre, apellidos, rol)')
          .eq('tipo_mensaje', 'INDIVIDUAL')
          .eq('destinatario_id', userId)
          .eq('leido', false)
          .order('created_at', { ascending: true });

        const todosMsg: any[] = [];
        
        if (!internosError && internosData) {
          todosMsg.push(...internosData.map(m => ({
            ...m,
            source: 'internos',
            remitenteNombre: m.perfiles ? `${(m.perfiles as any).nombre} ${(m.perfiles as any).apellidos}` : 'Usuario'
          })));
        }

        if (!clasesError && clasesData) {
          todosMsg.push(...clasesData.map(m => {
            const remitente = m.profiles as any;
            const prefix = remitente?.rol === 'profesor' ? 'Prof. ' : '';
            return {
              ...m,
              source: 'clases',
              remitenteNombre: remitente ? `${prefix}${remitente.nombre} ${remitente.apellidos}` : 'Usuario'
            };
          }));
        }

        if (todosMsg.length > 0) {
          // Ordenar por fecha todos juntos
          todosMsg.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          
          const latestMsg = todosMsg[todosMsg.length - 1];
          setMessages(todosMsg);
          setActiveChatId(latestMsg.remitente_id);
          setActiveChatName(latestMsg.remitenteNombre);
          setIsOpen(true);
          
          // Marcar como leídos al abrir el popup
          if (latestMsg.source === 'internos') {
            marcarChatComoLeido(userId, latestMsg.remitente_id);
          } else {
            supabase.from('mensajes_clases').update({ leido: true }).eq('destinatario_id', userId).eq('remitente_id', latestMsg.remitente_id).then();
          }
        }
      }
    };

    const checkGrupalesFallback = async () => {
      if (isAdmin || isAvisoOpen) return;
      const res = await obtenerMensajesGrupalesPendientes(userId, userRole);
      if (res.success && res.data && res.data.length > 0) {
        // Encontramos mensajes grupales o avisos pendientes
        // Solo mostramos el último
        const latest = res.data[res.data.length - 1];
        
        // Si ya tenemos un activeAviso con el mismo ID, no hacer nada para evitar loop
        if (activeAviso?.id === latest.id) return;
        
        const prefix = latest.profiles?.rol === 'profesor' ? 'Prof. ' : '';
        const remitenteNombre = latest.profiles ? `${prefix}${latest.profiles.nombre} ${latest.profiles.apellidos}` : 'Usuario';
        
        const tituloGrupo = latest.tipo_mensaje === 'CHAT_GRUPAL' && latest.materias 
           ? `${remitenteNombre} (Grupo: ${latest.materias.nombre})` 
           : remitenteNombre;

        playNotificationSound();
        setActiveAviso({ 
          id: latest.id, 
          contenido: latest.contenido, 
          remitente: tituloGrupo, 
          tipo: latest.tipo_mensaje,
          materia_id: latest.materia_id,
          grupo_id: latest.grupo_id
        });
        setIsAvisoOpen(false);
        setTimeout(() => setIsAvisoOpen(true), 50);
      }
    };

    checkUnread();
    
    // Ejecutar inmediatamente y luego cada 10 segundos
    checkGrupalesFallback();
    const fallbackInterval = setInterval(checkGrupalesFallback, 10000);

    // Suscripción a Realtime
    const channel = supabase.channel(`chat_notifications_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_internos' }, async (payload) => {
        const msg = payload.new;

        // Si es el remitente, ignorar
        if (msg.remitente_id === userId) return;

        // Comprobar si el mensaje está dirigido a este usuario
        let isForMe = false;
        
        if (msg.tipo_destino === 'INDIVIDUAL' && msg.destinatario_id === userId) {
          isForMe = true;
        } else if (msg.tipo_destino === 'GLOBAL' && !isAdmin) {
          isForMe = true;
        } else if (!isAdmin && (msg.tipo_destino === 'NIVEL' || msg.tipo_destino === 'CARRERA' || msg.tipo_destino === 'GRUPO')) {
          // Obtener perfil del usuario para saber si pertenece al destino
          const { data: perfil } = await supabase.from('profiles').select('carrera_id, grupo_id, carreras(nivel_id)').eq('id', userId).single();
          if (perfil) {
            const nivelId = (perfil.carreras as any)?.nivel_id;
            if (msg.tipo_destino === 'GRUPO' && msg.destino_id === perfil.grupo_id) isForMe = true;
            if (msg.tipo_destino === 'CARRERA' && msg.destino_id === perfil.carrera_id) isForMe = true;
            if (msg.tipo_destino === 'NIVEL' && msg.destino_id === nivelId) isForMe = true;
          }
        }

        if (!isForMe) return;

        // Obtener datos del remitente
        const { data: remitente } = await supabase.from('profiles').select('nombre, apellidos, rol').eq('id', msg.remitente_id).single();
        const remitenteNombre = remitente ? `${remitente.nombre} ${remitente.apellidos}` : 'Usuario';

        // Reproducir sonido
        playNotificationSound();

        // Forzar la apertura del popup al recibir mensaje nuevo
        if (isAdmin) {
          setAdminUnreadCount(prev => prev + 1);
          setAdminLatestSender(remitenteNombre);
          setIsAdminPopupOpen(false);
          setTimeout(() => setIsAdminPopupOpen(true), 50);
        } else if (msg.tipo_destino !== 'INDIVIDUAL') {
          // Es un AVISO/COMUNICADO: mostrar popup sin caja de respuesta
          setActiveAviso({ id: msg.id, contenido: msg.contenido, remitente: remitenteNombre, tipo: msg.tipo_destino });
          setIsAvisoOpen(false);
          setTimeout(() => setIsAvisoOpen(true), 50);
        } else {
          // Mensaje privado: mostrar popup de chat con respuesta
          setMessages(prev => [...prev, { ...msg, source: 'internos', remitenteNombre }]);
          setActiveChatId(msg.remitente_id);
          setActiveChatName(remitenteNombre);
          setIsOpen(false);
          setTimeout(() => setIsOpen(true), 50);
          marcarChatComoLeido(userId, msg.remitente_id);
        }
      })
      .subscribe();

    // Nueva suscripción para mensajes de clases (Profesor <-> Alumno o Grupal)
    const channelClases = supabase.channel(`chat_clases_notif_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_clases' }, async (payload) => {
        const msg = payload.new;
        if (msg.remitente_id === userId) return;

        // Obtener datos del remitente
        const { data: remitente } = await supabase.from('profiles').select('nombre, apellidos, rol').eq('id', msg.remitente_id).single();
        const remitenteNombre = remitente ? `${remitente.nombre} ${remitente.apellidos}` : 'Usuario';
        const prefix = remitente?.rol === 'profesor' ? 'Prof. ' : '';

        // Manejar mensajes grupales
        if (msg.tipo_mensaje === 'CHAT_GRUPAL') {
          const { data: materia } = await supabase.from('materias').select('nombre').eq('id', msg.materia_id).single();
          if (materia) {
            playNotificationSound();
            setActiveAviso({ 
              id: msg.id, 
              contenido: msg.contenido, 
              remitente: `${prefix}${remitenteNombre} (Grupo: ${materia.nombre})`, 
              tipo: 'CHAT_GRUPAL',
              materia_id: msg.materia_id,
              grupo_id: msg.grupo_id
            });
            setIsAvisoOpen(false);
            setTimeout(() => setIsAvisoOpen(true), 50);
          }
          return;
        }

        // Manejar mensajes individuales
        if (msg.tipo_mensaje === 'INDIVIDUAL' && msg.destinatario_id === userId) {
          playNotificationSound();
          setMessages(prev => [...prev, { ...msg, source: 'clases', remitenteNombre: prefix + remitenteNombre }]);
          setActiveChatId(msg.remitente_id);
          setActiveChatName(prefix + remitenteNombre);
          setIsOpen(false);
          setTimeout(() => setIsOpen(true), 50);
          await supabase.from('mensajes_clases').update({ leido: true }).eq('id', msg.id);
        }
      })
      .subscribe();

    return () => {
      clearInterval(fallbackInterval);
      supabase.removeChannel(channel);
      supabase.removeChannel(channelClases);
    };
  }, [userId, isMessagingPage, isAdmin, userRole, activeAviso?.id]);

  const handleReply = async () => {
    if (!replyText.trim() || !activeChatId) return;

    // Marcar como leídos al responder
    marcarChatComoLeido(userId, activeChatId);

    // Mostrar el mensaje optimisticamente
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      remitente_id: userId,
      destinatario_id: activeChatId,
      contenido: replyText,
      created_at: new Date().toISOString(),
      remitenteNombre: 'Tú'
    }]);

    // Diferenciar si respondemos a admin o a una clase
    // Asumimos por la ruta o el rol, pero para ser seguros intentamos enviar a mensajes_internos por defecto.
    // Opcionalmente podemos mejorar esto para responder correctamente a la clase si el remitente era un profesor.
    // Como es solo notificación rápida, enviamos a mensajes_internos si es Admin o si no, a mensajes_clases.
    
    const lastMsg = messages[messages.length - 1];
    const isClase = lastMsg && lastMsg.source === 'clases';

    let res;
    if (isClase) {
      const { enviarMensajeClase } = await import('@/lib/actions/mensajes_clases');
      res = await enviarMensajeClase({
        remitente_id: userId,
        destinatario_id: activeChatId,
        materia_id: null, 
        grupo_id: null,
        tipo_mensaje: 'INDIVIDUAL',
        contenido: replyText
      });
    } else {
      res = await enviarMensaje({
        remitente_id: userId,
        destinatario_id: activeChatId,
        tipo_destino: 'INDIVIDUAL',
        contenido: replyText
      });
    }

    if (res && res.success) {
      setReplyText('');
    } else {
      toast({ variant: 'destructive', title: 'Error al enviar', description: res?.error || 'Error' });
    }
  };

  if (isMessagingPage) return null;

  // ── Aviso/Comunicado popup (sin caja de respuesta) ──────────────────────────
  const AvisoPopup = isAvisoOpen && activeAviso && !isAdmin ? (
    <div className="fixed top-4 right-4 md:top-auto md:bottom-6 md:right-6 z-[100] animate-in slide-in-from-top-5 md:slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
      <div className="w-[calc(100vw-32px)] md:w-96 drop-shadow-2xl">
        <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-xl">
          {/* Header tipo WhatsApp */}
          <div className="bg-green-500 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <MessageSquare size={16} className="text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-tight">Control Escolar</span>
                <span className="text-[10px] text-green-100 font-medium">Comunicado Institucional</span>
              </div>
            </div>
            <button onClick={() => setIsAvisoOpen(false)} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
              <X size={18} />
            </button>
          </div>
          {/* Cuerpo */}
          <div className="p-5 bg-[url('/images/whatsapp-bg.png')] bg-cover bg-center">
            <div className="bg-white p-4 rounded-xl rounded-tl-none shadow-sm border border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed">{activeAviso.contenido}</p>
              <span className="text-[10px] text-slate-400 mt-2 block text-right">{activeAviso.remitente}</span>
            </div>
          </div>
          {/* Botón Marcar Visto / Ir al chat */}
          <div className="p-3 bg-slate-50 border-t border-slate-100">
            {activeAviso.tipo === 'CHAT_GRUPAL' ? (
              <button
                onClick={() => {
                  setIsAvisoOpen(false);
                  router.push(`/dashboard/${userRole}/mensajes-clases?tab=grupales&grupo_id=${activeAviso.grupo_id || ''}&materia_id=${activeAviso.materia_id || ''}`);
                }}
                className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl text-sm transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
              >
                <Users size={16} />
                Ir al chat de grupo
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (['TODOS', 'ALUMNOS', 'PROFESORES'].includes(activeAviso.tipo)) {
                    await marcarComunicadoVisto(activeAviso.id, userId);
                  } else {
                    await marcarAvisoClaseVisto(activeAviso.id, userId);
                  }
                  setIsAvisoOpen(false);
                }}
                className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl text-sm transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
              >
                <Send size={16} />
                Marcar como enterado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;


  // Admin popup
  if (isAdmin) {
    if (!isAdminPopupOpen || adminUnreadCount === 0) return null;

    return (
      <div className="fixed top-4 right-4 md:top-auto md:bottom-6 md:right-6 z-[100] animate-in slide-in-from-top-5 md:slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
        <div className="w-[calc(100vw-32px)] md:w-96 drop-shadow-2xl">
          <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-xl">
            <div className="bg-green-500 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <MessageSquare size={16} className="text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold leading-tight">Mensajes Nuevos</span>
                  <span className="text-[10px] text-green-100 font-medium">Bandeja de entrada</span>
                </div>
              </div>
              <button onClick={() => setIsAdminPopupOpen(false)} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 bg-[url('/images/whatsapp-bg.png')] bg-cover bg-center">
              <div className="bg-white p-4 rounded-xl rounded-tl-none shadow-sm border border-slate-100 relative text-center">
                <h4 className="text-sm font-bold text-slate-800 mb-1">Atención CRM</h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-2">
                  Tienes <strong className="text-green-600">{adminUnreadCount}</strong> mensaje(s) sin leer en tu bandeja.
                  {adminLatestSender && <span><br/><br/><span className="text-xs text-slate-400">Último mensaje de:</span><br/><b>{adminLatestSender}</b></span>}
                </p>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => { setIsAdminPopupOpen(false); setAdminUnreadCount(0); router.push('/dashboard/admin/crm/mensajeria'); }}
                className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl text-sm transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
              >
                <MessageSquare size={18} />
                Ver mensajes
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Alumnos/Profesores: renderizar ambos popups posibles en un Fragment
  return (
    <>
      {/* Popup de AVISO/COMUNICADO: sin caja de respuesta */}
      {AvisoPopup}

      {/* Popup de MENSAJE PRIVADO: con chat y respuesta */}
      {isOpen && (
        <div className="fixed top-4 right-4 md:top-auto md:bottom-6 md:right-6 z-[100] animate-in slide-in-from-top-5 md:slide-in-from-bottom-5 fade-in duration-300">
          <Card className="w-[calc(100vw-32px)] md:w-80 shadow-2xl border-primary/20 flex flex-col overflow-hidden bg-white">
            <div className="bg-primary text-primary-foreground p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8 border border-white/20">
                  <AvatarFallback className="bg-primary-foreground text-primary text-xs font-bold">
                    {activeChatName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-bold text-sm leading-none">{activeChatName}</span>
                  <span className="text-[10px] opacity-80 mt-1">Chat en vivo</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20 rounded-full" onClick={() => router.push(`/dashboard/${userRole}/mensajes`)}>
                  <Maximize2 size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20 rounded-full" onClick={() => setIsOpen(false)}>
                  <X size={16} />
                </Button>
              </div>
            </div>
            <div className="p-3 h-56 overflow-y-auto flex flex-col gap-3 bg-slate-50/50">
              {messages.map((m, idx) => {
                const isMe = m.remitente_id === userId;
                return (
                  <div key={idx} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                    <span className="text-[9px] text-muted-foreground mb-1 ml-1">{isMe ? 'Tú' : m.remitenteNombre}</span>
                    <div className={`p-2.5 rounded-2xl text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-white border shadow-sm rounded-tl-sm'}`}>
                      {m.contenido}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t bg-white flex items-center gap-2">
              <Input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                placeholder="Escribe tu respuesta..."
                className="rounded-full text-sm h-9"
              />
              <Button size="icon" onClick={handleReply} className="h-9 w-9 rounded-full shrink-0">
                <Send size={14} />
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
