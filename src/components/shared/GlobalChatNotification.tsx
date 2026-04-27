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

  // Si estamos en la página de mensajería, no mostramos el popup para no duplicar interfaces
  const isMessagingPage = pathname.includes('/mensajeria') || pathname.includes('/mensajes');
  const isAdmin = userRole === 'admin' || userRole === 'superuser';

  useEffect(() => {
    if (!userId || isMessagingPage) return;

    // Verificar si el admin tiene mensajes sin leer al iniciar sesión
    const checkUnread = async () => {
      if (isAdmin) {
        const { count, error } = await supabase
          .from('mensajes_internos')
          .select('*', { count: 'exact', head: true })
          .eq('tipo_destino', 'INDIVIDUAL')
          .eq('destinatario_id', userId)
          .eq('leido', false);

        if (!error && count && count > 0) {
          toast({
            title: "Tienes mensajes nuevos",
            description: `Tienes ${count} mensaje(s) sin leer en tu bandeja.`,
            action: (
              <Button size="sm" onClick={() => router.push('/dashboard/admin/crm/mensajeria')}>
                Ver mensajes
              </Button>
            ),
            duration: 10000,
          });
        }
      }
    };

    checkUnread();

    // Suscripción a Realtime
    const channel = supabase.channel('global_chat_notifications')
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

        // Lógica de visualización
        if (isAdmin) {
          // Toast elegante para admin
          toast({
            title: `Nuevo mensaje de ${remitenteNombre}`,
            description: msg.contenido.length > 50 ? msg.contenido.substring(0, 50) + '...' : msg.contenido,
            action: (
              <Button size="sm" onClick={() => router.push('/dashboard/admin/crm/mensajeria')}>
                Responder
              </Button>
            ),
          });
        } else {
          // Popup flotante para alumnos y profesores
          setMessages(prev => [...prev, { ...msg, remitenteNombre }]);
          setActiveChatId(msg.remitente_id);
          setActiveChatName(remitenteNombre);
          setIsOpen(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isMessagingPage, isAdmin, supabase, toast, router]);

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

  if (isAdmin || isMessagingPage || !isOpen) return null;

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
