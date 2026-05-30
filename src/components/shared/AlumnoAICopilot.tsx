"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useInstitucion } from "@/hooks/use-institucion";
import Image from "next/image";
import {
  X, Send, Copy, Check, Plus, MessageSquare, Loader2, Edit2, ChevronUp, ChevronDown, BookOpen, Sun, Moon
} from "lucide-react";
import { AlumnoExerciseModal } from "./AlumnoExerciseModal";
import { InlineExercise, type ExerciseState } from "./InlineExercise";

// ── Tipos ──────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  tokens_in?: number;
  tokens_out?: number;
  timestamp?: string;
  isHidden?: boolean;
  isExercise?: boolean;
  exerciseType?: "multiple" | "boolean";
  exerciseData?: any;
  exerciseState?: {
    answers: Record<number, string | boolean>;
    evaluated: boolean;
    scoreData: { score: number; failed: string[] } | null;
    order: number[];
    optionsOrder: Record<number, string[]>;
  };
}

interface ChatSession {
  id: string;
  session_name: string;
  messages: ChatMessage[];
  updated_at: string;
}

interface AlumnoAICopilotProps {
  userId: string;
  userName?: string;
  onClose: () => void;
}

// ── Componente Principal ───────────────────────────────────────────────
export function AlumnoAICopilot({ userId, userName, onClose }: AlumnoAICopilotProps) {
  const { config } = useInstitucion();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const isDark = theme === 'dark';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  // Ref siempre actualizado para evitar stale closures en sendMessage
  const activeSessionRef = useRef<ChatSession | null>(null);
  const supabase = createClient();

  // Mantener el ref sincronizado con el estado
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  // ── Hydration Guard ────────────────────────────────────────────────
  useEffect(() => { setHasMounted(true); }, []);

  // ── Cargar sesiones de Supabase ────────────────────────────────────
  const loadSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from("alumno_chat_history")
      .select("id, session_name, messages, updated_at")
      .eq("alumno_id", userId)
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

  // ── Scroll automático — solo cuando llega un NUEVO mensaje o hay streaming activo
  useEffect(() => {
    const count = activeSession?.messages?.length || 0;
    if (streamingText || count > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = count;
  }, [activeSession?.messages?.length, streamingText]);

  // ── Nueva sesión ───────────────────────────────────────────────────
  const createNewSession = async () => {
    const name = `Conversación ${new Date().toLocaleDateString("es-MX", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    })}`;
    const { data, error } = await supabase
      .from("alumno_chat_history")
      .insert({ alumno_id: userId, session_name: name, messages: [] })
      .select("id, session_name, messages, updated_at")
      .single();

    if (error) { console.error("[Copilot] Error creando sesión:", error); return; }
    const newSession = data as ChatSession;
    setSessions((prev) => [newSession, ...prev]);
    setActiveSession(newSession);
  };

  // ── Guardar mensajes en Supabase ───────────────────────────────────
  const saveMessages = async (id: string, msgs: ChatMessage[]) => {
    await supabase.from("alumno_chat_history").update({ messages: msgs, updated_at: new Date().toISOString() }).eq("id", id);
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
    
    await supabase.from("alumno_chat_history").update({ session_name: newTitle.trim() }).eq("id", id);
  };

  // ── Enviar mensaje ─────────────────────────────────────────────────
  const sendMessage = async (customMsg?: ChatMessage) => {
    const text = customMsg ? "" : inputText.trim();
    if (!customMsg && (!text || isThinking)) return;

    // Usar el ref para obtener siempre la sesión más reciente (evita stale closure)
    let session = activeSessionRef.current;
    if (!session) {
      const name = `Conversación ${new Date().toLocaleDateString("es-MX", {
        day: "2-digit", month: "short",
      })}`;
      const { data } = await supabase
        .from("alumno_chat_history")
        .insert({ alumno_id: userId, session_name: name, messages: [] })
        .select("id, session_name, messages, updated_at")
        .single();
      if (!data) return;
      session = data as ChatSession;
      setSessions((prev) => [session!, ...prev]);
      setActiveSession(session);
    }

    const userMessage: ChatMessage = customMsg || {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...(session.messages || []), userMessage];
    setActiveSession({ ...session, messages: updatedMessages });
    setInputText("");
    setIsThinking(true);
    setStreamingText("");

    // Preparar historial para la API (roles user/assistant, sin datos internos)
    const apiMessages = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // El título automático ahora se genera por la misma IA en el stream principal.

    try {
      const response = await fetch("/api/chat/alumno", {
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
              // Limpiar la etiqueta de título si existiera
              const cleanContent = accumulated.replace(/<titulo>[\s\S]*?<\/titulo>\n*/g, "");
              // Stream completo — guardar en Supabase
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
                  
                  supabase.from("alumno_chat_history").update({ session_name: extractedTitle }).eq("id", session.id).then();
                }
              }

              const displayText = accumulated.replace(/<titulo>[\s\S]*?<\/titulo>\n*/g, "");
              // Solo actualizar streaming text si no es un sistema call invisible
              if (userMessage.role !== "system") {
                setStreamingText(displayText);
              }
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

  // ── Render Markdown simple (negritas, listas, enlaces) ─────────────
  const renderMarkdown = (text: string) => {
    const LINK_PLACEHOLDER = "\x00LINK\x00";
    const links: string[] = [];

    // 1. Markdown links [texto](url)
    const linkClass = isDark ? 'text-cyan-300 underline hover:text-cyan-100 break-all font-medium' : 'text-indigo-600 underline hover:text-indigo-800 break-all font-medium';

    let result = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${label}</a>`);
      return LINK_PLACEHOLDER + (links.length - 1) + LINK_PLACEHOLDER;
    });

    // 2. Markdown links [Enlace](url)
    result = result.replace(/\[Enlace\]\((https?:\/\/[^)\s]+)\)/g, (_, url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="${linkClass}">🔗 ${url}</a>`);
      return LINK_PLACEHOLDER + (links.length - 1) + LINK_PLACEHOLDER;
    });

    // 3. URLs desnudas
    result = result.replace(/(https?:\/\/[^\s<"\]]+)/g, (url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${url}</a>`);
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
    <div className="fixed inset-0 z-[99999] flex items-stretch">
      {/* ── FONDO BLUR ── */}
      <div className={cn("absolute inset-0 backdrop-blur-md", isDark ? 'bg-slate-950/70' : 'bg-black/30')} onClick={onClose} />

      {/* ── CONTENEDOR PRINCIPAL ── */}
      <div className={cn("relative m-4 md:m-8 flex-1 flex rounded-[28px] overflow-hidden border", isDark ? 'shadow-[0_0_80px_rgba(99,102,241,0.3)] border-indigo-900/50 bg-[#080514]' : 'shadow-xl border-gray-200 bg-white')}>

        {/* ── SIDEBAR: HISTORIAL DE SESIONES ── */}
        <div className={cn(
          "flex flex-col border-r transition-all duration-300 absolute md:relative z-20 h-full",
          isDark ? 'bg-[#0d0a1e] border-indigo-900/40' : 'bg-[#f9f9f9] border-gray-200',
          sidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden"
        )}>
          <div className={cn("p-4 border-b flex items-center justify-between", isDark ? 'border-indigo-900/40' : 'border-gray-200')}>
            <span className={cn("text-xs font-black uppercase tracking-widest", isDark ? 'text-indigo-400' : 'text-indigo-500')}>Conversaciones</span>
            <button className={cn("md:hidden p-1", isDark ? 'text-indigo-400' : 'text-indigo-500')} onClick={() => setSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <button
            onClick={createNewSession}
            className={cn(
              "mx-3 mt-3 flex items-center gap-2 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border hover:border-indigo-400/50",
              isDark ? 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-gray-200'
            )}
          >
            <Plus size={14} /> Nueva Conversación
          </button>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1 custom-scrollbar">
            {sessions.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => { setActiveSession(s); if(window.innerWidth < 768) setSidebarOpen(false); }}
                className={cn(
                  "w-full text-left p-3 rounded-xl text-xs transition-all group flex items-start gap-2 cursor-pointer",
                  activeSession?.id === s.id
                    ? cn(isDark ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/50' : 'bg-indigo-100 text-indigo-700 border border-indigo-300')
                    : cn(isDark ? 'text-slate-400 hover:bg-white/5 hover:text-slate-300' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-600')
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
              </div>
            ))}
            {sessions.length === 0 && (
              <p className={cn("text-center text-xs py-8", isDark ? 'text-slate-600' : 'text-gray-400')}>No hay conversaciones aún</p>
            )}
          </div>
        </div>

        {/* ── BOT CENTRAL ── */}
        <div className={cn("hidden lg:flex flex-col items-center justify-center w-56 border-r relative shrink-0", isDark ? 'bg-[#08051a] border-indigo-900/40' : 'bg-[#f5f5f5] border-gray-200')}>
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
          {isDark && (
            <>
              <div className={cn(
                "absolute bottom-16 w-36 h-7 rounded-[100%] bg-blue-500/40 blur-[18px]",
                "shadow-[0_0_50px_20px_rgba(59,130,246,0.5)]",
                isThinking ? "animate-pulse-fast" : "animate-pulse-slow"
              )} />
              <div className={cn(
                "absolute bottom-16 w-20 h-4 rounded-[100%] bg-cyan-400/60 blur-[10px]",
                "shadow-[0_0_30px_10px_rgba(34,211,238,0.7)]",
                isThinking ? "animate-pulse-fast" : "animate-pulse-slow"
              )} />
            </>
          )}
          <div className="absolute bottom-8 text-center">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
              isThinking
                ? cn(isDark ? "text-cyan-300 bg-cyan-950/60 border border-cyan-500/40" : "text-cyan-600 bg-cyan-50 border border-cyan-300", "animate-pulse")
                : cn(isDark ? "text-indigo-400 bg-indigo-950/40 border border-indigo-500/30" : "text-indigo-500 bg-gray-50 border border-gray-200")
            )}>
              {isThinking ? "⚡ Pensando..." : "✨ Listo"}
            </span>
          </div>
        </div>

        {/* ── PANEL DE CHAT ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header del chat */}
          <div className={cn("flex items-center gap-3 px-4 md:px-6 py-4 border-b", isDark ? 'border-indigo-900/40 bg-[#0d0a1e]/50' : 'border-gray-200 bg-[#f9f9f9]')}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={cn("p-2 rounded-lg transition-all", isDark ? 'text-indigo-400 hover:bg-indigo-900/30' : 'text-indigo-500 hover:bg-gray-100')}
            >
              <MessageSquare size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className={cn("text-sm font-black uppercase tracking-wider truncate", isDark ? 'text-white' : 'text-gray-900')}>
                {activeSession?.session_name || "Copiloto IA · Tu Asistente"}
              </h2>
              <p className={cn("text-[10px] font-medium uppercase tracking-widest truncate", isDark ? 'text-indigo-400' : 'text-indigo-500')}>
                Ayuda para tus clases en {config.nombre_corto || "tu institución"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* ── BOT MOBILE HEADER ── */}
              {!sidebarOpen && (
                <div className="lg:hidden relative w-10 h-10 mr-1 shrink-0 flex items-center justify-center">
                  <div className={cn("absolute inset-0", isThinking ? "animate-bot-thinking" : "animate-bot-hover")}>
                    <Image
                      src={isThinking ? "/images/THINKINGBOT.png" : "/images/NORMALBOT.png"}
                      alt="Copiloto IA"
                      fill
                      className={cn("object-contain", isDark ? 'drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'drop-shadow-sm')}
                    />
                  </div>
                  {isDark && (
                    <div className={cn(
                      "absolute -bottom-1 w-6 h-1.5 rounded-[100%] bg-blue-500/40 blur-[4px]",
                      isThinking ? "animate-pulse-fast" : "animate-pulse-slow"
                    )} />
                  )}
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
                className={cn("p-2 rounded-xl transition-all hidden sm:block", isDark ? 'text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200' : 'text-indigo-500 hover:bg-gray-100 hover:text-indigo-700')}
              >
                <ChevronDown size={16} />
              </button>
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
                className={cn("p-2 rounded-xl transition-all ml-1", isDark ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900')}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Área de mensajes */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6 custom-scrollbar">
            {displayMessages.length === 0 && !isThinking && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-10 md:py-20">
                <div className="text-5xl">🤖</div>
                <h3 className={cn("text-lg font-black px-4", isDark ? 'text-white' : 'text-gray-900')}>¿En qué te puedo ayudar hoy?</h3>
                <p className={cn("text-sm max-w-xs leading-relaxed px-4", isDark ? 'text-slate-400' : 'text-gray-500')}>
                  Soy tu Asistente IA 24/7. Pregúntame sobre los temas de clase y te ayudaré a entenderlos mejor.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 w-full max-w-lg px-4">
                  {[
                    "🙋‍♂️ Explícame este tema como si tuviera 10 años",
                    "📝 Ayúdame a organizar mis ideas para un ensayo",
                    "❓ No entendí la clase de hoy, ¿me ayudas?",
                    "🧠 Ponme a prueba con preguntas sobre lo que vimos",
                  ].map((sug) => (
                    <button
                      key={sug}
                      onClick={() => setInputText(sug.replace(/^[^\s]+\s/, ""))}
                      className={cn(
                        "text-left p-3 rounded-2xl border text-xs transition-all",
                        isDark ? 'bg-indigo-950/40 hover:bg-indigo-900/40 border-indigo-800/40 hover:border-indigo-600/50 text-slate-300 hover:text-white' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-indigo-300 text-gray-600 hover:text-gray-900'
                      )}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {displayMessages.filter(m => m.role !== "system" && !m.isHidden).map((msg, idx) => {
              const isLastAssistant = msg.role === "assistant" && idx === displayMessages.length - 1;
              return (
              <div
                key={idx}
                ref={isLastAssistant ? lastAssistantRef : undefined}
                className={cn("flex gap-3 group", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className={cn("w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-1", isDark ? 'bg-indigo-900/60 border-indigo-500/40' : 'bg-indigo-50 border-indigo-200')}>
                    <span className="text-sm">🤖</span>
                  </div>
                )}

                <div className={cn(
                  "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm leading-relaxed relative",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : cn("rounded-tl-sm border", isDark ? 'bg-[#1a1035] text-slate-200 border-indigo-900/50' : 'bg-[#f7f7f8] text-gray-800 border-gray-200')
                )}>
                  {msg.isExercise && msg.exerciseData ? (
                    <InlineExercise
                      type={msg.exerciseType!}
                      items={msg.exerciseData.items}
                      exerciseState={msg.exerciseState}
                      onStateChange={(newState: ExerciseState) => {
                        // Persistir el estado del ejercicio en el mensaje
                        if (!activeSession) return;
                        const updatedMsgs = activeSession.messages.map((m, i) =>
                          i === idx ? { ...m, exerciseState: newState } : m
                        );
                        const updatedSession = { ...activeSession, messages: updatedMsgs };
                        setActiveSession(updatedSession);
                        setSessions(prev => prev.map(s => s.id === activeSession.id ? updatedSession : s));
                        // Guardar en Supabase (debounced en efecto de cola)
                        saveMessages(activeSession.id, updatedMsgs);
                      }}
                      onFinish={(_score, _failed, internalPrompt) => {
                        // Enviamos el prompt como "user" para que la IA lo procese garantizado, pero lo ocultamos en la UI.
                        const feedbackPrompt: ChatMessage = {
                          role: "user",
                          content: internalPrompt,
                          isHidden: true,
                          timestamp: new Date().toISOString()
                        };
                        sendMessage(feedbackPrompt);
                      }}
                    />
                  ) : msg.role === "assistant" ? (
                    <div
                      className="prose-sm"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}

                  {/* Botón copiar para respuestas de la IA */}
                  {msg.role === "assistant" && !msg.isExercise && (
                    <button
                      onClick={() => copyMessage(msg.content, idx)}
                      className={cn("absolute top-2 right-2 md:top-3 md:right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all", isDark ? 'bg-indigo-900/50 hover:bg-indigo-700/60 text-indigo-300 hover:text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700')}
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
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-1 text-xs font-black text-white" title={userName || "Alumno"}>
                    {userName ? userName[0].toUpperCase() : "A"}
                  </div>
                )}
              </div>
            );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Input de mensaje */}
          <div className={cn("px-4 md:px-6 pb-4 md:pb-6 pt-2", isDark ? 'bg-[#080514]' : 'bg-white')}>
            <div className={cn("flex items-end gap-2 md:gap-3 border rounded-2xl p-2 md:p-3 focus-within:border-indigo-500/70 transition-all shadow-inner", isDark ? 'bg-[#130f2a] border-indigo-800/50' : 'bg-white border-gray-300')}>
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
                placeholder="Escribe tu pregunta... (Shift+Enter para salto de línea)"
                className={cn("flex-1 bg-transparent text-sm resize-none outline-none min-h-[40px] max-h-[140px] py-2 md:py-2.5 px-2 leading-relaxed", isDark ? 'text-white placeholder-slate-600' : 'text-gray-900 placeholder-gray-400')}
                rows={1}
              />

              <button
                onClick={() => sendMessage()}
                disabled={isThinking || !inputText.trim()}
                className={cn(
                  "p-2.5 md:p-3 rounded-xl transition-all shrink-0 mb-0.5",
                  inputText.trim() && !isThinking
                    ? cn("bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 md:hover:scale-110", isDark ? 'shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)]' : 'shadow-md hover:shadow-lg')
                    : cn("cursor-not-allowed", isDark ? 'bg-indigo-900/20 text-slate-600' : 'bg-gray-100 text-gray-400')
                )}
              >
                {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between mt-2 md:mt-3 gap-2">
              <p className={cn("text-[10px] font-medium", isDark ? 'text-slate-700' : 'text-gray-400')}>
                Asistente IA de {config.nombre_corto} · Las respuestas pueden variar
              </p>
              <button 
                onClick={() => setIsExerciseModalOpen(true)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-[11px] font-semibold", isDark ? 'bg-indigo-900/30 border-indigo-500/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white' : 'bg-indigo-50 border-gray-200 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-700')}
              >
                <BookOpen size={12} />
                Crear Ejercicio IA
              </button>
            </div>
          </div>
        </div>
      </div>

      <AlumnoExerciseModal 
        isOpen={isExerciseModalOpen}
        onClose={() => setIsExerciseModalOpen(false)}
        userId={userId}
        onGenerate={async (config) => {
          setIsThinking(true);
          try {
            const res = await fetch("/api/chat/alumno/generar-ejercicio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...config,
                userId,
                chatMessages: config.source === "chat" ? activeSession?.messages : undefined,
                textoLibre: config.source === "texto" ? config.textoLibre : undefined
              })
            });

            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Error al generar");
            }

            const data = await res.json();
            
            // Si la sesión no existe, la creamos
            let session = activeSession;
            if (!session) {
              const name = `Conversación ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`;
              const { data: newSess } = await supabase.from("alumno_chat_history")
                .insert({ alumno_id: userId, session_name: name, messages: [] })
                .select("id, session_name, messages, updated_at")
                .single();
              if (newSess) {
                session = newSess as ChatSession;
                setSessions(prev => [session!, ...prev]);
                setActiveSession(session);
              }
            }

            if (session) {
              let content = "Aquí tienes el ejercicio generado.";
              if (config.source === "materia" && config.materiaNombre) {
                content = `**Ejercicio de ${config.materiaNombre}**\nUnidad: ${config.unidadNombre || "N/A"}\nTema: ${config.temaNombre || "N/A"}\n\nAquí tienes el ejercicio generado basado en tus materiales.`;
              } else if (config.source === "texto") {
                content = `**Ejercicio generado a partir del texto ingresado.**\n\nAquí tienes las preguntas solicitadas.`;
              }

              const exerciseMsg: ChatMessage = {
                role: "assistant",
                content,
                isExercise: true,
                exerciseType: config.type,
                exerciseData: data,
                timestamp: new Date().toISOString()
              };
              
              const finalMessages = [...(session.messages || []), exerciseMsg];
              setActiveSession(prev => prev ? { ...prev, messages: finalMessages } : null);
              setSessions(prev => prev.map(s => s.id === session!.id ? { ...s, messages: finalMessages, updated_at: new Date().toISOString() } : s));
              await saveMessages(session.id, finalMessages);
            }

          } catch (e: any) {
            alert("Hubo un problema generando el ejercicio: " + e.message);
          } finally {
            setIsThinking(false);
          }
        }}
      />
    </div>,
    document.body
  );
}
