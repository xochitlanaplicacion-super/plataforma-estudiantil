'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Send, Users, Megaphone, Search, Check, CheckCheck, Trash2, ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  enviarMensaje, obtenerComunicados, obtenerListaChats, obtenerConversacion,
  obtenerEstructuraAcademica, eliminarMensaje, marcarComoLeido, marcarChatComoLeido, type TipoDestino,
} from '@/lib/actions/mensajes';
import FormattedContent from '@/components/shared/FormattedContent';

export default function MensajeriaInterna() {
  const { toast } = useToast();
  const supabase = createClient();
  const [adminId, setAdminId] = useState('');
  const [tab, setTab] = useState('comunicados');
  const [comunicados, setComunicados] = useState<any[]>([]);
  const [comunicadoABorrar, setComunicadoABorrar] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState<TipoDestino>('GLOBAL');
  const [nuevoDestinoId, setNuevoDestinoId] = useState('');
  const [filtroDestino, setFiltroDestino] = useState('');
  const [openDestino, setOpenDestino] = useState(false);
  const [nuevoContenido, setNuevoContenido] = useState('');
  const [estructura, setEstructura] = useState<any>({ niveles: [], carreras: [], grupos: [], usuarios: [] });
  const [chats, setChats] = useState<any[]>([]);
  const [chatActivo, setChatActivo] = useState<string | null>(null);
  const [chatNombre, setChatNombre] = useState('');
  const [mensajesChat, setMensajesChat] = useState<any[]>([]);
  const [nuevoMsg, setNuevoMsg] = useState('');
  const [busquedaChat, setBusquedaChat] = useState('');
  const [showNuevoChat, setShowNuevoChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const comunicadoTextareaRef = useRef<HTMLTextAreaElement>(null);

  const applyFormat = (prefix: string, suffix: string = '') => {
    if (!comunicadoTextareaRef.current) return;
    const el = comunicadoTextareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.substring(start, end);
    const replacement = `${prefix}${selected || 'texto'}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    setNuevoContenido(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + (selected ? selected.length : 5));
    }, 50);
  };

  const handlePasteComunicado = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html) return;

    e.preventDefault();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const convertNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();
      const style = el.getAttribute('style') || '';
      const isBold = tagName === 'b' || tagName === 'strong' || style.includes('font-weight: 700') || style.includes('font-weight:bold') || style.includes('font-weight: bold');
      const isItalic = tagName === 'i' || tagName === 'em' || style.includes('font-style: italic') || style.includes('font-style:italic');
      const isUnderline = tagName === 'u' || style.includes('text-decoration: underline') || style.includes('text-decoration:underline');

      let inner = '';
      node.childNodes.forEach(child => {
        inner += convertNode(child);
      });

      if (!inner && tagName !== 'br') return '';

      if (isBold) inner = `<b>${inner}</b>`;
      if (isItalic) inner = `<i>${inner}</i>`;
      if (isUnderline) inner = `<u>${inner}</u>`;

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        return `\n### ${inner}\n`;
      }
      if (tagName === 'li') {
        return `\n• ${inner}`;
      }
      if (['p', 'div'].includes(tagName)) {
        return `\n${inner}`;
      }
      if (tagName === 'br') {
        return '\n';
      }

      return inner;
    };

    let converted = convertNode(doc.body).trim();
    converted = converted.replace(/\n{3,}/g, '\n\n');

    if (!converted) return;

    if (!comunicadoTextareaRef.current) return;
    const el = comunicadoTextareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const currentVal = el.value;

    const newVal = currentVal.substring(0, start) + converted + currentVal.substring(end);
    setNuevoContenido(newVal);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + converted.length, start + converted.length);
    }, 50);
  };

  useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data.user) setAdminId(data.user.id); }); }, []);

  const cargarDatos = useCallback(async () => {
    if (!adminId) return;
    const [comRes, chatRes, estRes] = await Promise.all([obtenerComunicados(), obtenerListaChats(adminId), obtenerEstructuraAcademica()]);
    if (comRes.success) setComunicados(comRes.data);
    if (chatRes.success) setChats(chatRes.data);
    if (estRes.success) setEstructura(estRes);
  }, [adminId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ═══ REALTIME ═══
  useEffect(() => {
    if (!adminId) return;
    const channel = supabase.channel('mensajes-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_internos' }, (payload) => {
        const msg = payload.new as any;
        if (msg.tipo_destino === 'INDIVIDUAL' && (msg.destinatario_id === adminId || msg.remitente_id === adminId)) {
          setMensajesChat(prev => [...prev, msg]);
          if (msg.destinatario_id === adminId && !msg.leido) marcarComoLeido(msg.id);
          // Actualizar lista de chats
          cargarDatos();
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes_internos' }, (payload) => {
        const msg = payload.new as any;
        if (msg.tipo_destino === 'INDIVIDUAL') setMensajesChat(prev => prev.map(m => m.id === msg.id ? msg : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mensajes_internos' }, (payload) => {
        const old = payload.old as any;
        setMensajesChat(prev => prev.filter(m => m.id !== old.id));
        setComunicados(prev => prev.filter(c => c.id !== old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_vistos' }, async () => {
        const comRes = await obtenerComunicados();
        if (comRes.success) setComunicados(comRes.data);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [adminId, cargarDatos]);

  const cargarChat = async (userId: string, nombre: string) => {
    setChatActivo(userId); setChatNombre(nombre);
    const res = await obtenerConversacion(adminId, userId);
    if (res.success) {
      setMensajesChat(res.data);
      await marcarChatComoLeido(adminId, userId);
      setChats(prev => prev.map(c => c.userId === userId ? { ...c, noLeidos: 0 } : c));
    }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const enviarComunicado = async () => {
    if (!nuevoContenido.trim()) return;
    const res = await enviarMensaje({ remitente_id: adminId, tipo_destino: nuevoTipo, destino_id: nuevoTipo === 'GLOBAL' ? null : nuevoDestinoId || null, contenido: nuevoContenido });
    if (res.success) { toast({ title: '📢 Comunicado enviado' }); setShowNuevo(false); setNuevoContenido(''); setNuevoDestinoId(''); setFiltroDestino(''); cargarDatos(); }
    else toast({ variant: 'destructive', title: 'Error', description: res.error });
  };

  const enviarMsgChat = async () => {
    if (!nuevoMsg.trim() || !chatActivo) return;
    const res = await enviarMensaje({ remitente_id: adminId, destinatario_id: chatActivo, tipo_destino: 'INDIVIDUAL', contenido: nuevoMsg });
    if (res.success) { setNuevoMsg(''); /* Realtime lo agrega */ }
  };

  const borrarMensajeChat = async (id: string) => {
    const res = await eliminarMensaje(id);
    if (res.success) { toast({ title: 'Mensaje eliminado' }); }
  };

  const iniciarNuevoChat = async (userId: string, nombre: string) => {
    setShowNuevoChat(false); setChatActivo(userId); setChatNombre(nombre);
    const res = await obtenerConversacion(adminId, userId);
    if (res.success) setMensajesChat(res.data);
    setTab('chats');
  };

  const confirmarBorrarComunicado = async () => {
    if (!comunicadoABorrar) return;
    const id = comunicadoABorrar;
    setComunicados(prev => prev.filter(c => c.id !== id));
    const res = await eliminarMensaje(id, true);
    if (res.success) { toast({ title: 'Comunicado eliminado' }); }
    setComunicadoABorrar(null);
  };

  const fmt = (f: string) => { const d = new Date(f); return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); };

  const chatsFiltrados = chats.filter(c => c.nombre.toLowerCase().includes(busquedaChat.toLowerCase()) || c.matricula?.toLowerCase().includes(busquedaChat.toLowerCase()));

  return (
    <div className="space-y-6">
      <AlertDialog open={!!comunicadoABorrar} onOpenChange={(open) => !open && setComunicadoABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el comunicado y los usuarios ya no podrán verlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrarComunicado} className="bg-red-500 hover:bg-red-600 text-white">Borrar comunicado</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2"><MessageSquare size={28} /> Mensajería Interna</h2>
        <p className="text-muted-foreground">Comunicados globales y chat directo con alumnos y profesores.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="comunicados">📢 Comunicados</TabsTrigger>
          <TabsTrigger value="chats">💬 Chats Individuales</TabsTrigger>
        </TabsList>
        <TabsContent value="comunicados">
          <div className="flex justify-between items-center mb-4">
            <Badge variant="outline" className="text-sm font-bold">{comunicados.length} comunicados</Badge>
            <Button onClick={() => setShowNuevo(true)} className="rounded-xl gap-2"><Megaphone size={16} /> Nuevo Comunicado</Button>
          </div>
          <div className="space-y-3">
            {comunicados.map(c => {
              const pctColor = c.pctVistos >= 80 ? 'text-emerald-600' : c.pctVistos >= 50 ? 'text-amber-600' : 'text-red-500';
              return (
                <Card key={c.id} className="rounded-2xl border-l-4" style={{ borderLeftColor: c.tipo_destino === 'GLOBAL' ? '#6366f1' : c.tipo_destino === 'NIVEL' ? '#8b5cf6' : c.tipo_destino === 'CARRERA' ? '#0ea5e9' : '#f59e0b' }}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[9px] font-black uppercase">{c.tipo_destino}</Badge>
                        <span className="text-xs font-bold text-primary">{c.destinoNombre}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{fmt(c.created_at)}</span>
                      </div>
                      <FormattedContent content={c.contenido} className="mt-1" />
                      <div className="flex items-center gap-3 mt-2">
                        <span className={cn('text-xs font-black', pctColor)}>{c.vistos}/{c.totalDestinatarios} vistos ({c.pctVistos}%)</span>
                        <div className="flex-1 max-w-[200px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', c.pctVistos >= 80 ? 'bg-emerald-500' : c.pctVistos >= 50 ? 'bg-amber-400' : 'bg-red-500')} style={{ width: `${c.pctVistos}%` }} />
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 shrink-0" onClick={() => setComunicadoABorrar(c.id)}><Trash2 size={16} /></Button>
                  </CardContent>
                </Card>
              );
            })}
            {comunicados.length === 0 && <p className="text-center text-muted-foreground py-10">No hay comunicados enviados aún.</p>}
          </div>
        </TabsContent>
        <TabsContent value="chats" className="mt-0 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border rounded-2xl overflow-hidden h-[70vh] min-h-[500px]">
            <div className={cn("border-r flex flex-col h-full overflow-hidden bg-white", chatActivo ? 'hidden md:flex' : 'flex')}>
              <div className="p-3 border-b space-y-2 shrink-0">
                <div className="flex gap-2">
                  <Input placeholder="Buscar chat..." value={busquedaChat} onChange={e => setBusquedaChat(e.target.value)} className="text-sm h-9" />
                  <Button size="sm" variant="outline" onClick={() => setShowNuevoChat(true)} className="shrink-0 h-9"><Users size={14} /></Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {chatsFiltrados.map(c => (
                  <button key={c.userId} onClick={() => cargarChat(c.userId, c.nombre)} className={cn("w-full text-left p-3 border-b hover:bg-primary/5 transition-colors flex items-center gap-3", chatActivo === c.userId && 'bg-primary/10')}>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm shrink-0">{c.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <p className={cn("text-sm truncate", c.noLeidos > 0 ? "font-black text-gray-900" : "font-semibold")}>{c.nombre}</p>
                          {c.noLeidos > 0 && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                        </div>
                        <span className={cn("text-[9px] shrink-0", c.noLeidos > 0 ? "text-green-600 font-bold" : "text-muted-foreground")}>{fmt(c.fecha)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{c.ultimoMensaje}</p>
                    </div>
                    {c.noLeidos > 0 && <Badge className="bg-emerald-500 text-white text-[10px] rounded-full h-5 w-5 flex items-center justify-center p-0">{c.noLeidos}</Badge>}
                  </button>
                ))}
                {chatsFiltrados.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">Sin chats aún</p>}
              </div>
            </div>
            <div className={cn("md:col-span-2 flex flex-col h-full overflow-hidden bg-[#f0ebe3]", !chatActivo ? 'hidden md:flex' : 'flex')}>
              {chatActivo ? (
                <>
                  <div className="p-3 bg-white border-b flex items-center gap-3 shrink-0">
                    <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setChatActivo(null)}><ArrowLeft size={18} /></Button>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm">{chatNombre.split(' ').map(n => n[0]).join('').substring(0, 2)}</div>
                    <div><p className="font-bold text-sm">{chatNombre}</p><p className="text-[10px] text-muted-foreground">Chat individual</p></div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {mensajesChat.map(m => {
                      const esAdmin = m.remitente_id === adminId;
                      const isDeleted = m.contenido === '🚫 Este mensaje fue eliminado';
                      return (
                        <div key={m.id} className={cn('flex items-end gap-1 group', esAdmin ? 'justify-end' : 'justify-start')}>
                          {esAdmin && !isDeleted && <button onClick={() => borrarMensajeChat(m.id)} className="opacity-0 group-hover:opacity-100 transition-opacity mb-1"><Trash2 size={12} className="text-red-400 hover:text-red-600" /></button>}
                          <div className={cn('max-w-[70%] rounded-2xl px-4 py-2 shadow-sm', isDeleted ? 'bg-gray-100 text-gray-500 italic rounded-br-md rounded-bl-md' : esAdmin ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-white rounded-bl-md')}>
                            <p className="text-sm whitespace-pre-wrap">{m.contenido}</p>
                            <div className={cn('flex items-center gap-1 mt-1', esAdmin ? 'justify-end' : 'justify-start')}>
                              <span className={cn('text-[9px]', isDeleted ? 'text-gray-400' : esAdmin ? 'text-primary-foreground/60' : 'text-muted-foreground')}>{fmt(m.created_at)}</span>
                              {esAdmin && !isDeleted && (m.leido ? <CheckCheck size={12} className="text-blue-300" /> : <Check size={12} className="text-primary-foreground/40" />)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="p-3 bg-white border-t flex gap-2 shrink-0">
                    <Input value={nuevoMsg} onChange={e => setNuevoMsg(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1" onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMsgChat()} />
                    <Button onClick={enviarMsgChat} className="rounded-xl"><Send size={16} /></Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center"><div className="text-center text-muted-foreground"><MessageSquare size={48} className="mx-auto mb-3 opacity-20" /><p className="font-bold">Selecciona un chat</p><p className="text-sm">o inicia una nueva conversación</p></div></div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <Dialog open={showNuevo} onOpenChange={setShowNuevo}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Megaphone size={18} className="text-primary" /> Nuevo Comunicado</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-black uppercase text-muted-foreground mb-1 block">Dirigido a</label>
              <Select value={nuevoTipo} onValueChange={v => { setNuevoTipo(v as TipoDestino); setNuevoDestinoId(''); setFiltroDestino(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">🌐 Todos los usuarios</SelectItem>
                  <SelectItem value="NIVEL">🏫 Un Nivel</SelectItem>
                  <SelectItem value="CARRERA">📚 Una Carrera</SelectItem>
                  <SelectItem value="GRUPO">👥 Un Grupo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {nuevoTipo !== 'GLOBAL' && (() => {
              const lista = nuevoTipo === 'NIVEL' ? estructura.niveles : nuevoTipo === 'CARRERA' ? estructura.carreras : estructura.grupos;
              const seleccionado = lista.find((i: any) => i.id === nuevoDestinoId);
              const filtrado = lista.filter((item: any) => {
                const texto = item.nombre + (item.turno ? ` ${item.turno}` : '');
                return texto.toLowerCase().includes(filtroDestino.toLowerCase());
              });
              return (
                <div>
                  <label className="text-xs font-black uppercase text-muted-foreground mb-1 block">Seleccionar {nuevoTipo.toLowerCase()}</label>
                  <div className="relative">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-white hover:bg-muted/30 transition-colors"
                      onClick={() => { setOpenDestino(prev => !prev); setFiltroDestino(''); }}
                    >
                      <span className={seleccionado ? 'text-foreground' : 'text-muted-foreground'}>
                        {seleccionado ? (seleccionado.nombre + (seleccionado.turno ? ` (${seleccionado.turno})` : '')) : `Elegir ${nuevoTipo.toLowerCase()}...`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </button>
                    {openDestino && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg">
                        <div className="p-2 border-b">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                              type="text"
                              placeholder="Buscar..."
                              className="w-full pl-8 pr-3 h-8 text-xs border rounded-md bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary"
                              value={filtroDestino}
                              onChange={e => setFiltroDestino(e.target.value)}
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto p-1">
                          {filtrado.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Sin resultados</p>}
                          {filtrado.map((item: any) => (
                            <button
                              key={item.id}
                              type="button"
                              className={cn('w-full text-left px-3 py-2 text-sm rounded-md hover:bg-primary/10 transition-colors flex items-center gap-2', nuevoDestinoId === item.id && 'bg-primary/10 font-bold text-primary')}
                              onClick={() => { setNuevoDestinoId(item.id); setOpenDestino(false); setFiltroDestino(''); }}
                            >
                              {nuevoDestinoId === item.id && <Check size={14} className="text-primary shrink-0" />}
                              <span>{item.nombre}{item.turno ? ` (${item.turno})` : ''}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-black uppercase text-muted-foreground block">Mensaje</label>
                <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-lg border border-border">
                  <button type="button" onClick={() => applyFormat('<b>', '</b>')} className="px-2 py-0.5 text-xs font-black rounded hover:bg-white transition-colors" title="Negrita"><b>B</b></button>
                  <button type="button" onClick={() => applyFormat('<i>', '</i>')} className="px-2 py-0.5 text-xs italic rounded hover:bg-white transition-colors" title="Cursiva"><i>I</i></button>
                  <button type="button" onClick={() => applyFormat('<u>', '</u>')} className="px-2 py-0.5 text-xs underline rounded hover:bg-white transition-colors" title="Subrayado"><u>U</u></button>
                  <div className="h-3 w-px bg-border mx-0.5" />
                  <button type="button" onClick={() => applyFormat('### ')} className="px-2 py-0.5 text-xs font-bold rounded hover:bg-white transition-colors" title="Título">H3</button>
                  <button type="button" onClick={() => applyFormat('• ')} className="px-2 py-0.5 text-xs rounded hover:bg-white transition-colors" title="Lista">• Lista</button>
                </div>
              </div>
              <Textarea 
                ref={comunicadoTextareaRef}
                value={nuevoContenido} 
                onChange={e => setNuevoContenido(e.target.value)} 
                onPaste={handlePasteComunicado}
                placeholder="Escribe o pega el comunicado (se conservará el formato copiado)..." 
                className="min-h-[140px] font-sans" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNuevo(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={enviarComunicado} className="rounded-xl gap-2" disabled={!nuevoContenido.trim() || (nuevoTipo !== 'GLOBAL' && !nuevoDestinoId)}><Send size={14} /> Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showNuevoChat} onOpenChange={setShowNuevoChat}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Iniciar nuevo chat</DialogTitle></DialogHeader>
          <Input placeholder="Buscar usuario..." className="mb-3" onChange={e => setBusquedaChat(e.target.value)} />
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {estructura.usuarios.filter((u: any) => u.nombre.toLowerCase().includes(busquedaChat.toLowerCase())).map((u: any) => (
              <button key={u.id} onClick={() => iniciarNuevoChat(u.id, u.nombre)} className="w-full text-left p-2 rounded-xl hover:bg-primary/5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{u.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}</div>
                <div><p className="text-sm font-bold">{u.nombre}</p><p className="text-[10px] text-muted-foreground">{u.rol} · {u.carrera}</p></div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
