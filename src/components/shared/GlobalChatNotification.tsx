'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, X, Send, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { enviarMensaje } from '@/lib/actions/mensajes';

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
        // Alumnos y Profesores: buscar mensajes no leídos al iniciar sesión
        const { data, error } = await supabase
          .from('mensajes_internos')
          .select('*, perfiles:remitente_id(nombre, apellidos)')
          .eq('tipo_destino', 'INDIVIDUAL')
          .eq('destinatario_id', userId)
          .eq('leido', false)
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          const formattedMsgs = data.map(m => ({
            ...m,
            remitenteNombre: m.perfiles ? `${(m.perfiles as any).nombre} ${(m.perfiles as any).apellidos}` : 'Usuario'
          }));
          
          const latestMsg = formattedMsgs[formattedMsgs.length - 1];
          setMessages(formattedMsgs);
          setActiveChatId(latestMsg.remitente_id);
          setActiveChatName(latestMsg.remitenteNombre);
          setIsOpen(true);
        }
      }
    };

    checkUnread();

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

        // Forzar la apertura del popup al recibir mensaje nuevo
        if (isAdmin) {
          setAdminUnreadCount(prev => prev + 1);
          setAdminLatestSender(remitenteNombre);
          setIsAdminPopupOpen(false); // trigger re-render bounce
          setTimeout(() => setIsAdminPopupOpen(true), 50);
        } else {
          setMessages(prev => [...prev, { ...msg, remitenteNombre }]);
          setActiveChatId(msg.remitente_id);
          setActiveChatName(remitenteNombre);
          setIsOpen(false); // trigger re-render bounce
          setTimeout(() => setIsOpen(true), 50);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isMessagingPage, isAdmin]);

  const handleReply = async () => {
    if (!replyText.trim() || !activeChatId) return;

    // Mostrar el mensaje optimisticamente
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      remitente_id: userId,
      destinatario_id: activeChatId,
      contenido: replyText,
      created_at: new Date().toISOString(),
      remitenteNombre: 'Tú'
    }]);

    const res = await enviarMensaje({
      remitente_id: userId,
      destinatario_id: activeChatId,
      tipo_destino: 'INDIVIDUAL',
      contenido: replyText
    });

    if (res.success) {
      setReplyText('');
    } else {
      toast({ variant: 'destructive', title: 'Error al enviar', description: res.error });
    }
  };

  if (isMessagingPage) return null;

  if (isAdmin) {
    if (!isAdminPopupOpen || adminUnreadCount === 0) return null;

    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
        <div className="w-80 md:w-96 drop-shadow-2xl">
          <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-xl">
            {/* Header tipo WhatsApp */}
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
              <button 
                onClick={() => setIsAdminPopupOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo del mensaje */}
            <div className="p-5 bg-[url('/images/whatsapp-bg.png')] bg-cover bg-center">
              <div className="bg-white p-4 rounded-xl rounded-tl-none shadow-sm border border-slate-100 relative text-center">
                <h4 className="text-sm font-bold text-slate-800 mb-1">Atención CRM</h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-2">
                  Tienes <strong className="text-green-600">{adminUnreadCount}</strong> mensaje(s) sin leer en tu bandeja.
                  {adminLatestSender && <span><br/><br/><span className="text-xs text-slate-400">Último mensaje de:</span><br/><b>{adminLatestSender}</b></span>}
                </p>
              </div>
            </div>

            {/* Botón de acción */}
            <div className="p-3 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsAdminPopupOpen(false);
                  router.push('/dashboard/admin/crm/mensajeria');
                }}
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

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <Card className="w-80 shadow-2xl border-primary/20 flex flex-col overflow-hidden bg-white">
        {/* Header */}
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

        {/* Messages */}
        <div className="p-3 h-64 overflow-y-auto flex flex-col gap-3 bg-slate-50/50">
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

        {/* Input */}
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
  );
}
