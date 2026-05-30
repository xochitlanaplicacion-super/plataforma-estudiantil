"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, MessageSquare, AlertTriangle, User, Bot, Calendar, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatSession {
  id: string;
  session_name: string;
  messages: ChatMessage[];
  updated_at: string;
  ai_analysis: {
    categoria: string;
    es_alerta: boolean;
    last_analyzed_at: string;
  } | null;
}

interface UserChatViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userType: "alumno" | "profesor";
  primaryColor: string;
}

export function UserChatViewerModal({
  isOpen,
  onClose,
  userId,
  userName,
  userType,
  primaryColor,
}: UserChatViewerModalProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && userId) {
      loadUserChats();
    }
  }, [isOpen, userId]);

  const loadUserChats = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/ia-monitoring/users?userId=${userId}&type=${userType}`);
      const data = await res.json();
      if (data.success) {
        setSessions(data.chats || []);
        if (data.chats && data.chats.length > 0) {
          setActiveSession(data.chats[0]);
        }
      } else {
        setError(data.error || "Error al cargar chats");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col overflow-hidden bg-gray-50 border-0 rounded-2xl shadow-2xl">
        {/* Header */}
        <div 
          className="flex items-center justify-between px-6 py-4 border-b border-gray-200"
          style={{ backgroundColor: `${primaryColor}08` }} // Very light tint
        >
          <div>
            <DialogTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
              <MessageSquare size={20} style={{ color: primaryColor }} />
              Auditoría de Chats: {userName}
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1 capitalize font-medium flex items-center gap-2">
              <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-md text-xs">{userType}</span>
              Modo de solo lectura
            </p>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden h-full">
          {/* Sidebar (List of Sessions) */}
          <div className="w-1/3 min-w-[300px] border-r border-gray-200 bg-white flex flex-col h-full">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Calendar size={15} />
                Historial de Sesiones ({sessions.length})
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {isLoading ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-gray-300" size={32} /></div>
              ) : error ? (
                <p className="text-sm text-red-500 p-4">{error}</p>
              ) : sessions.length === 0 ? (
                <div className="text-center p-8 text-gray-400">
                  <p className="text-sm">No hay chats registrados.</p>
                </div>
              ) : (
                sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => setActiveSession(session)}
                    className={`w-full text-left p-3 rounded-xl transition-all border ${
                      activeSession?.id === session.id 
                        ? `bg-gray-50 border-gray-300 shadow-sm`
                        : `bg-white border-transparent hover:bg-gray-50 hover:border-gray-200`
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-sm text-gray-900 line-clamp-1 flex-1 pr-2"
                          style={{ color: activeSession?.id === session.id ? primaryColor : undefined }}>
                        {session.session_name || "Chat sin título"}
                      </h4>
                      {session.ai_analysis?.es_alerta && (
                        <AlertTriangle size={14} className="text-red-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{formatDate(session.updated_at)}</p>
                    
                    {session.ai_analysis ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                        {session.ai_analysis.categoria}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                        Sin analizar
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col bg-slate-50 relative h-full">
            {activeSession ? (
              <>
                <div className="p-4 bg-white border-b border-gray-200 shadow-sm z-10 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{activeSession.session_name}</h3>
                    <p className="text-xs text-gray-500">Iniciado/Actualizado: {formatDate(activeSession.updated_at)}</p>
                  </div>
                  {activeSession.ai_analysis?.es_alerta && (
                    <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg border border-red-200 flex items-center gap-2 text-sm font-bold">
                      <AlertTriangle size={16} />
                      Alerta Detectada
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {(activeSession.messages || []).filter(m => m.role !== 'system').map((msg, i) => (
                    <div 
                      key={i} 
                      className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === 'user' ? 'bg-gray-200 text-gray-600' : 'text-white'
                      }`}
                      style={{ backgroundColor: msg.role === 'assistant' ? primaryColor : undefined }}>
                        {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                      </div>
                      
                      <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-white border border-gray-200 text-gray-800' 
                          : 'text-white'
                      }`}
                      style={{ backgroundColor: msg.role === 'assistant' ? primaryColor : undefined }}>
                        <div className={`prose prose-sm max-w-none ${msg.role === 'assistant' ? 'prose-invert' : ''}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(activeSession.messages || []).length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                      <Info size={32} />
                      <p>Este chat no tiene mensajes.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <p>Selecciona un chat del panel lateral para ver la transcripción.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
