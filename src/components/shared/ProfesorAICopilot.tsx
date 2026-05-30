"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useInstitucion } from "@/hooks/use-institucion";
import Image from "next/image";
import {
  X, Send, Paperclip, Copy, Check, Plus, MessageSquare, Loader2, Trash2, Edit2, ChevronUp, ChevronDown, Sun, Moon,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tokens_in?: number;
  tokens_out?: number;
  timestamp?: string;
}

interface ChatSession {
  id: string;
  session_name: string;
  messages: ChatMessage[];
  updated_at: string;
}

interface ProfesorAICopilotProps {
  userId: string;
  userName?: string;
  onClose: () => void;
}

// ── Componente Principal ───────────────────────────────────────────────
export function ProfesorAICopilot({ userId, userName, onClose }: ProfesorAICopilotProps) {
  const { config } = useInstitucion();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const isDark = theme === 'dark';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // ── Hydration Guard ────────────────────────────────────────────────
  useEffect(() => { setHasMounted(true); }, []);

  // ── Cargar sesiones de Supabase ────────────────────────────────────
  const loadSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from("profesor_chat_history")
      .select("id, session_name, messages, updated_at")
      .eq("profesor_id", userId)
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) { console.error("[Copilot] Error cargando sesiones:", error); return; }
    const typed = (data || []) as ChatSession[];
    setSessions(typed);
    // Cargar automáticamente la última conversación
    if (typed.length > 0 && !activeSession) {
      setActiveSession(typed[0]);
    }
  }, [userId, supabase, activeSession]);

  useEffect(() => { loadSessions(); }, []);

  // ── Scroll automático ──────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, streamingText]);

  // ── Nueva sesión ───────────────────────────────────────────────────
  const createNewSession = async () => {
    const name = `Conversación ${new Date().toLocaleDateString("es-MX", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    })}`;
    const { data, error } = await supabase
      .from("profesor_chat_history")
      .insert({ profesor_id: userId, session_name: name, messages: [] })
      .select("id, session_name, messages, updated_at")
      .single();

    if (error) { console.error("[Copilot] Error creando sesión:", error); return; }
    const newSession = data as ChatSession;
    setSessions((prev) => [newSession, ...prev]);
    setActiveSession(newSession);
    setPdfText(null);
    setPdfName(null);
  };

  // ── Guardar mensajes en Supabase ───────────────────────────────────
  const saveMessages = async (id: string, msgs: ChatMessage[]) => {
    await supabase.from("profesor_chat_history").update({ messages: msgs, updated_at: new Date().toISOString() }).eq("id", id);
  };

  const saveTitle = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    
    setSessions(prev => prev.map(s => s.id === id ? { ...s, session_name: newTitle.trim() } : s));
    if (activeSession?.id === id) {
      setActiveSession(prev => prev ? { ...prev, session_name: newTitle.trim() } : null);
    }
    setEditingSessionId(null);
    
    await supabase.from("profesor_chat_history").update({ session_name: newTitle.trim() }).eq("id", id);
  };



  // ── Subir PDF ──────────────────────────────────────────────────────
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") return;
    setPdfName(file.name);

    // Convertir el PDF a texto usando el API de PDF.js (via texto legible)
    // Para esta versión usamos FileReader para extraer texto plano del buffer
    const reader = new FileReader();
    reader.onload = async (ev) => {
      // Guardamos el base64 para enviarlo al API — el servidor lo tratará como contexto de texto
      const base64 = (ev.target?.result as string).split(",")[1];
      setPdfText(`[Documento adjunto: ${file.name}] El profesor ha adjuntado un PDF. A continuación el contenido en base64 que el asistente debe procesar como contexto de referencia para responder su pregunta: ${base64.substring(0, 8000)}...`);
    };
    reader.readAsDataURL(file);

    // Limpiar el input para permitir subir el mismo archivo de nuevo
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Enviar mensaje ─────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isThinking) return;

    // Crear sesión si no hay una activa
    let session = activeSession;
    if (!session) {
      const name = `Conversación ${new Date().toLocaleDateString("es-MX", {
        day: "2-digit", month: "short",
      })}`;
      const { data } = await supabase
        .from("profesor_chat_history")
        .insert({ profesor_id: userId, session_name: name, messages: [] })
        .select("id, session_name, messages, updated_at")
        .single();
      if (!data) return;
      session = data as ChatSession;
      setSessions((prev) => [session!, ...prev]);
      setActiveSession(session);
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: pdfText ? `${text}\n\n${pdfText}` : text,
      timestamp: new Date().toISOString(),
    };
    // Mostramos solo el texto visible al usuario (sin el PDF base64)
    const userMessageDisplay: ChatMessage = {
      role: "user",
      content: pdfText ? `📎 **${pdfName}**\n\n${text}` : text,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...(session.messages || []), userMessageDisplay];
    setActiveSession({ ...session, messages: updatedMessages });
    setInputText("");
    setPdfText(null);
    setPdfName(null);
    setIsThinking(true);
    setStreamingText("");

    // Preparar historial para la API (roles user/assistant, sin datos internos)
    const apiMessages = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Reemplazar el último mensaje de usuario con el que incluye el PDF (si existe)
    if (pdfText) {
      apiMessages[apiMessages.length - 1].content = userMessage.content;
    }

    // El título ahora se genera por la misma IA en el stream principal.
    try {
      const response = await fetch("/api/chat/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          userId,
          sessionId: session.id,
          institucionNombre: config?.nombre || config?.nombre_corto,
          aiName: config?.nombre_ia,
          userName: userName
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Error en la respuesta del servidor.");
      }

      // Leer el stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let titleExtracted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const payload = line.replace("data: ", "").trim();
          try {
            const parsed = JSON.parse(payload);
            if (parsed.done) {
              const cleanContent = accumulated.replace(/<titulo>[\s\S]*?<\/titulo>\n*/g, "");
              const assistantMessage: ChatMessage = {
                role: "assistant",
                content: cleanContent,
                tokens_in: parsed.tokens?.prompt,
                tokens_out: parsed.tokens?.completion,
                timestamp: new Date().toISOString(),
              };
              const finalMessages = [...updatedMessages, assistantMessage];
              setActiveSession((prev) =>
                prev ? { ...prev, messages: finalMessages } : null
              );
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === session.id
                    ? { ...s, messages: finalMessages, updated_at: new Date().toISOString() }
                    : s
                )
              );
              await saveMessages(session.id, finalMessages);
              
              setStreamingText("");
            } else if (parsed.delta) {
              accumulated += parsed.delta;

              if (!titleExtracted && updatedMessages.length === 1 && session.session_name.startsWith("Conversación")) {
                const titleMatch = accumulated.match(/<titulo>([\s\S]*?)<\/titulo>/);
                if (titleMatch && titleMatch[1]) {
                  titleExtracted = true;
                  const extractedTitle = titleMatch[1].trim();
                  
                  setSessions(prev => prev.map(s => s.id === session.id ? { ...s, session_name: extractedTitle } : s));
                  setActiveSession(prev => prev?.id === session.id ? { ...prev, session_name: extractedTitle } : prev);
                  
                  supabase.from("profesor_chat_history").update({ session_name: extractedTitle }).eq("id", session.id).then();
                }
              }

              const displayText = accumulated.replace(/<titulo>[\s\S]*?<\/titulo>\n*/g, "");
              setStreamingText(displayText);
            }
          } catch {
            // Ignorar chunks malformados
          }
        }
      }
    } catch (err: any) {
      console.error("[Copilot] Error enviando mensaje:", err);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "⚠️ Ocurrió un error al contactar la IA. Por favor intenta de nuevo.",
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setActiveSession((prev) => prev ? { ...prev, messages: finalMessages } : null);
      await saveMessages(session.id, finalMessages);
    } finally {
      setIsThinking(false);
      setStreamingText("");
    }
  };

  // ── Copiar respuesta ───────────────────────────────────────────────
  const copyMessage = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Eliminar sesión ────────────────────────────────────────────────
  const deleteSession = async (sessionId: string) => {
    await supabase.from("profesor_chat_history").delete().eq("id", sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSession?.id === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setActiveSession(remaining[0] || null);
    }
  };

  // ── Render Markdown simple (negritas, listas, enlaces) ─────────────
  const renderMarkdown = (text: string) => {
    const LINK_PLACEHOLDER = "\x00LINK\x00";
    const links: string[] = [];

    // 1. Markdown links [texto](url)
    let result = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-cyan-300 underline hover:text-cyan-100 break-all font-medium">${label}</a>`);
      return LINK_PLACEHOLDER + (links.length - 1) + LINK_PLACEHOLDER;
    });

    // 2. Markdown links [Enlace](url) — el patrón exacto que usa OpenRouter
    result = result.replace(/\[Enlace\]\((https?:\/\/[^)\s]+)\)/g, (_, url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-cyan-300 underline hover:text-cyan-100 break-all font-medium">🔗 ${url}</a>`);
      return LINK_PLACEHOLDER + (links.length - 1) + LINK_PLACEHOLDER;
    });

    // 3. URLs desnudas que quedaron sin envolver
    result = result.replace(/(https?:\/\/[^\s<"\]]+)/g, (url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-cyan-300 underline hover:text-cyan-100 break-all font-medium">${url}</a>`);
      return LINK_PLACEHOLDER + (links.length - 1) + LINK_PLACEHOLDER;
    });

    // 4. Resto del markdown
    result = result
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^### (.+)$/gm, `<h3 class="text-base font-black mt-3 mb-1 ${isDark ? 'text-indigo-200' : 'text-indigo-700'}">$1</h3>`)
      .replace(/^## (.+)$/gm, `<h2 class="text-lg font-black mt-4 mb-2 ${isDark ? 'text-indigo-100' : 'text-indigo-800'}">$1</h2>`)
      .replace(/^# (.+)$/gm, `<h1 class="text-xl font-black mt-4 mb-2 ${isDark ? 'text-white' : 'text-gray-900'}">$1</h1>`)
      .replace(/^- (.+)$/gm, `<li class="ml-4 list-disc ${isDark ? 'text-slate-300' : 'text-gray-600'}">$1</li>`)
      .replace(/^(\d+)\. (.+)$/gm, `<li class="ml-4 list-decimal ${isDark ? 'text-slate-300' : 'text-gray-600'}"><span class="font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-600'}">$1.</span> $2</li>`)
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, "<br/>");

    // 5. Restaurar enlaces
    result = result.replace(new RegExp(`\x00LINK\x00(\\d+)\x00LINK\x00`, 'g'), (_, i) => links[parseInt(i)]);

    return result;
  };

  // ── Scroll al inicio / fin del último mensaje ─────────────────────
  const scrollToLastMsgTop = () => {
    if (lastAssistantRef.current) {
      lastAssistantRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const scrollToLastMsgBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  };

  if (!hasMounted) return null;

  const messages = activeSession?.messages || [];
  const displayMessages = isThinking && streamingText
    ? [...messages, { role: "assistant" as const, content: streamingText }]
    : messages;

  return createPortal(
    <div className={cn("fixed inset-0 z-[99999] flex items-stretch")}>
      {/* ── MODAL DE CONFIRMACION DE BORRADO ── */}
      {deleteConfirmSession && (
        <div className={cn("absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm rounded-[28px]", isDark ? 'bg-black/60' : 'bg-black/30')} onClick={(e) => e.stopPropagation()}>
          <div className={cn("p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 flex flex-col items-center text-center", isDark ? 'bg-[#1a1035] border border-indigo-500/30' : 'bg-white border border-gray-200')}>
            <Trash2 size={32} className="text-red-400 mb-4 opacity-80" />
            <h3 className={cn("font-bold text-lg mb-2", isDark ? 'text-white' : 'text-gray-900')}>Eliminar conversación</h3>
            <p className={cn("text-sm mb-6", isDark ? 'text-slate-300' : 'text-gray-600')}>¿Estás seguro de que deseas borrar este chat? Esta acción no se puede deshacer.</p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setDeleteConfirmSession(null)}
                className={cn("flex-1 py-2 rounded-xl font-medium transition-colors", isDark ? 'text-slate-300 bg-white/5 hover:bg-white/10' : 'text-gray-600 bg-gray-100 hover:bg-gray-200')}
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  deleteSession(deleteConfirmSession);
                  setDeleteConfirmSession(null);
                }}
                className={cn("flex-1 py-2 rounded-xl text-white font-bold transition-colors")}
                style={{ backgroundColor: config?.color_primario || '#4f46e5' }}
              >
                Sí, borrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FONDO BLUR ── */}
      <div className={cn("absolute inset-0 backdrop-blur-md", isDark ? 'bg-slate-950/70' : 'bg-black/30')} onClick={onClose} />

      {/* ── CONTENEDOR PRINCIPAL ── */}
      <div className={cn("relative m-4 md:m-8 flex-1 flex rounded-[28px] overflow-hidden", isDark ? 'shadow-[0_0_80px_rgba(99,102,241,0.3)] border border-indigo-900/50 bg-[#080514]' : 'shadow-xl border border-gray-200 bg-white')}>

        {/* ── SIDEBAR: HISTORIAL DE SESIONES ── */}
        <div className={cn(
          "flex flex-col transition-all duration-300",
          isDark ? 'bg-[#0d0a1e] border-r border-indigo-900/40' : 'bg-[#f9f9f9] border-r border-gray-200',
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        )}>
          <div className={cn("p-4 flex items-center justify-between", isDark ? 'border-b border-indigo-900/40' : 'border-b border-gray-200')}>
            <span className={cn("text-xs font-black uppercase tracking-widest", isDark ? 'text-indigo-400' : 'text-indigo-500')}>Conversaciones</span>
          </div>
          <button
            onClick={createNewSession}
            className={cn("mx-3 mt-3 flex items-center gap-2 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all", isDark ? 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/50' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-gray-200 hover:border-indigo-300')}
          >
            <Plus size={14} /> Nueva Conversación
          </button>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1 custom-scrollbar">
            {sessions.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveSession(s)}
                className={cn(
                  "w-full text-left p-3 rounded-xl text-xs transition-all group flex items-start gap-2 cursor-pointer",
                  activeSession?.id === s.id
                    ? (isDark ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/50' : 'bg-indigo-100 text-indigo-700 border border-indigo-300')
                    : (isDark ? 'text-slate-400 hover:bg-white/5 hover:text-slate-300' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')
                )}
              >
                <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />
                {editingSessionId === s.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        await saveTitle(s.id, editingTitle);
                      } else if (e.key === 'Escape') {
                        setEditingSessionId(null);
                      }
                    }}
                    onBlur={() => saveTitle(s.id, editingTitle)}
                    autoFocus
                    className={cn("flex-1 rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-indigo-400 w-full min-w-0", isDark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-900')}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate flex-1 font-medium">{s.session_name}</span>
                )}
                
                {editingSessionId !== s.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSessionId(s.id);
                      setEditingTitle(s.session_name);
                    }}
                    className={cn("opacity-0 group-hover:opacity-100 transition-all mr-1 shrink-0", isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-500 hover:text-indigo-600')}
                  >
                    <Edit2 size={11} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmSession(s.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className={cn("text-center text-xs py-8", isDark ? 'text-slate-600' : 'text-gray-400')}>No hay conversaciones aún</p>
            )}
          </div>
        </div>

        {/* ── BOT CENTRAL ── */}
        <div className={cn("hidden lg:flex flex-col items-center justify-center w-56 relative shrink-0", isDark ? 'bg-[#08051a] border-r border-indigo-900/40' : 'bg-[#f5f5f5] border-r border-gray-200')}>

          {/* LOGO DE LA ESCUELA (encima del bot) — solo si existe y no falló */}
          {config.logo_url && !logoError && (
            <div className="absolute top-4 flex items-center justify-center w-48 h-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={config.logo_url}
                alt={config.nombre_corto || "Logo"}
                className="max-h-full max-w-full object-contain opacity-80 hover:opacity-100 transition-opacity"
                onError={() => setLogoError(true)}
              />
            </div>
          )}

          <div className={cn(
            "relative w-44 aspect-square",
            isThinking ? "animate-bot-thinking" : "animate-bot-hover"
          )}>
            <Image
              src={isThinking ? "/images/THINKINGBOT.png" : "/images/NORMALBOT.png"}
              alt="Copiloto IA"
              fill
              className={cn("object-contain", isDark ? 'drop-shadow-[0_0_30px_rgba(99,102,241,0.5)]' : 'drop-shadow-md')}
              priority
            />
          </div>
          {/* Ondas gravitacionales azules */}
          {isDark && <div className={cn(
            "absolute bottom-16 w-36 h-7 rounded-[100%] bg-blue-500/40 blur-[18px]",
            "shadow-[0_0_50px_20px_rgba(59,130,246,0.5)]",
            isThinking ? "animate-pulse-fast" : "animate-pulse-slow"
          )} />}
          {isDark && <div className={cn(
            "absolute bottom-16 w-20 h-4 rounded-[100%] bg-cyan-400/60 blur-[10px]",
            "shadow-[0_0_30px_10px_rgba(34,211,238,0.7)]",
            isThinking ? "animate-pulse-fast" : "animate-pulse-slow"
          )} />}
          {/* Etiqueta estado */}
          <div className="absolute bottom-8 text-center">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
              isThinking
                ? (isDark ? 'text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 animate-pulse' : 'text-cyan-600 bg-cyan-50 border border-cyan-300 animate-pulse')
                : (isDark ? 'text-indigo-400 bg-indigo-950/40 border border-indigo-500/30' : 'text-indigo-500 bg-gray-50 border border-gray-200')
            )}>
              {isThinking ? "⚡ Pensando..." : "✨ Listo"}
            </span>
          </div>
        </div>

        {/* ── PANEL DE CHAT ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header del chat */}
          <div className={cn("flex items-center gap-3 px-6 py-4", isDark ? 'border-b border-indigo-900/40 bg-[#0d0a1e]/50' : 'border-b border-gray-200 bg-[#f9f9f9]')}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={cn("p-2 rounded-lg transition-all", isDark ? 'text-indigo-400 hover:bg-indigo-900/30' : 'text-indigo-500 hover:bg-gray-100')}
            >
              <MessageSquare size={16} />
            </button>
            <div className="flex-1">
              <h2 className={cn("text-sm font-black uppercase tracking-wider", isDark ? 'text-white' : 'text-gray-900')}>
                {activeSession?.session_name || "Copiloto IA · Asistente del Profesor"}
              </h2>
              <p className={cn("text-[10px] font-medium uppercase tracking-widest", isDark ? 'text-indigo-400' : 'text-indigo-500')}>
                Asistente exclusivo de {config.nombre_corto || "tu institución"}
              </p>
            </div>
            {/* Botones navegar último mensaje */}
            <div className="flex items-center gap-1 shrink-0">
              {/* ── BOT MOBILE HEADER ── */}
              {!sidebarOpen && (
                <div className="lg:hidden relative w-10 h-10 mr-1 shrink-0 flex items-center justify-center">
                  <div className={cn("absolute inset-0", isThinking ? "animate-bot-thinking" : "animate-bot-hover")}>
                    <Image
                      src={isThinking ? "/images/THINKINGBOT.png" : "/images/NORMALBOT.png"}
                      alt="Copiloto IA"
                      fill
                      className={cn("object-contain", isDark ? 'drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'drop-shadow-md')}
                    />
                  </div>
                  {isDark && <div className={cn(
                    "absolute -bottom-1 w-6 h-1.5 rounded-[100%] bg-blue-500/40 blur-[4px]",
                    isThinking ? "animate-pulse-fast" : "animate-pulse-slow"
                  )} />}
                </div>
              )}

              <button
                onClick={scrollToLastMsgTop}
                title="Ir al inicio del último mensaje"
                className={cn("p-2 rounded-xl transition-all hidden sm:block", isDark ? 'text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200' : 'text-indigo-500 hover:bg-gray-100 hover:text-indigo-700')}
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={scrollToLastMsgBottom}
                title="Ir al final del último mensaje"
                className={cn("p-2 rounded-xl transition-all", isDark ? 'text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200' : 'text-indigo-500 hover:bg-gray-100 hover:text-indigo-700')}
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={cn(
                'p-2 rounded-xl transition-all',
                isDark ? 'text-yellow-400 hover:bg-indigo-900/30' : 'text-gray-500 hover:bg-gray-100'
              )}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={onClose}
              className={cn("p-2 rounded-xl transition-all", isDark ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900')}
            >
              <X size={18} />
            </button>
          </div>

          {/* Área de mensajes */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
            {displayMessages.length === 0 && !isThinking && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
                <div className="text-5xl">🤖</div>
                <h3 className={cn("text-lg font-black", isDark ? 'text-white' : 'text-gray-900')}>¿En qué te puedo ayudar hoy?</h3>
                <p className={cn("text-sm max-w-xs leading-relaxed", isDark ? 'text-slate-400' : 'text-gray-500')}>
                  Puedo ayudarte a redactar planeaciones, diseñar rúbricas, resumir documentos, crear evaluaciones y mucho más.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 w-full max-w-lg">
                  {[
                    "📋 Hazme una planeación de clase para el tema de fotosíntesis",
                    "📝 Diseña una rúbrica de evaluación para trabajo en equipo",
                    "📊 Resume este artículo pedagógico que te comparto",
                    "🧪 Crea 5 preguntas de examen con sus respuestas",
                  ].map((sug) => (
                    <button
                      key={sug}
                      onClick={() => setInputText(sug.replace(/^[^\s]+\s/, ""))}
                      className={cn("text-left p-3 rounded-2xl text-xs transition-all", isDark ? 'bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-800/40 hover:border-indigo-600/50 text-slate-300 hover:text-white' : 'bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-indigo-300 text-gray-600 hover:text-gray-900')}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {displayMessages.map((msg, idx) => {
              const isLastAssistant = msg.role === "assistant" && idx === displayMessages.length - 1;
              return (
              <div
                key={idx}
                ref={isLastAssistant ? lastAssistantRef : undefined}
                className={cn("flex gap-3 group", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1", isDark ? 'bg-indigo-900/60 border border-indigo-500/40' : 'bg-indigo-50 border border-indigo-200')}>
                    <span className="text-sm">🤖</span>
                  </div>
                )}

                <div className={cn(
                  "max-w-[75%] rounded-2xl px-5 py-4 text-sm leading-relaxed relative",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : (isDark ? 'bg-[#1a1035] text-slate-200 border border-indigo-900/50 rounded-tl-sm' : 'bg-[#f7f7f8] text-gray-800 border border-gray-200 rounded-tl-sm')
                )}>
                  {msg.role === "assistant" ? (
                    <div
                      className="prose-sm"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}

                  {/* Botón copiar para respuestas de la IA */}
                  {msg.role === "assistant" && (
                    <button
                      onClick={() => copyMessage(msg.content, idx)}
                      className={cn("absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all", isDark ? 'bg-indigo-900/50 hover:bg-indigo-700/60 text-indigo-300 hover:text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700')}
                      title="Copiar respuesta"
                    >
                      {copiedId === idx ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                    </button>
                  )}

                  {/* Indicador de escritura */}
                  {msg.role === "assistant" && isThinking && idx === displayMessages.length - 1 && (
                    <span className="inline-flex gap-1 ml-1 align-middle">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-1 text-xs font-black text-white" title={userName || "Profesor"}>
                    {userName ? userName[0].toUpperCase() : "P"}
                  </div>
                )}
              </div>
            );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* PDF adjunto indicator */}
          {pdfName && (
            <div className={cn("mx-6 mb-2 flex items-center gap-2 px-4 py-2 rounded-xl text-xs", isDark ? 'bg-indigo-950/60 border border-indigo-700/40 text-indigo-300' : 'bg-gray-100 border border-gray-200 text-indigo-600')}>
              <Paperclip size={12} />
              <span className="font-medium">{pdfName}</span>
              <button
                onClick={() => { setPdfText(null); setPdfName(null); }}
                className="ml-auto text-red-400 hover:text-red-300"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Input de mensaje */}
          <div className="px-6 pb-6 pt-2">
            <div className={cn("flex items-end gap-3 rounded-2xl p-3 focus-within:border-indigo-500/70 transition-all", isDark ? 'bg-[#130f2a] border border-indigo-800/50' : 'bg-white border border-gray-300')}>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn("p-2 rounded-xl transition-all shrink-0", isDark ? 'text-slate-500 hover:text-indigo-400 hover:bg-indigo-900/40' : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50')}
                title="Adjuntar PDF"
              >
                <Paperclip size={18} />
              </button>

              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Escribe tu pregunta o solicitud... (Shift+Enter para salto de línea)"
                className={cn("flex-1 bg-transparent text-sm resize-none outline-none min-h-[40px] max-h-[140px] py-2 leading-relaxed", isDark ? 'text-white placeholder-slate-600' : 'text-gray-900 placeholder-gray-400')}
                rows={1}
              />

              <button
                onClick={() => sendMessage()}
                disabled={isThinking || !inputText.trim()}
                className={cn(
                  "p-2.5 rounded-xl transition-all shrink-0",
                  inputText.trim() && !isThinking
                    ? (isDark ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:scale-110' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md hover:shadow-lg hover:scale-110')
                    : (isDark ? 'bg-indigo-900/20 text-slate-600 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed')
                )}
              >
                {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className={cn("text-center text-[10px] mt-2 font-medium", isDark ? 'text-slate-700' : 'text-gray-400')}>
              Asistente IA de {config.nombre_corto} · Las respuestas son orientativas
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
