"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useInstitucion } from "@/hooks/use-institucion";
import {
  ShieldAlert, Play, AlertTriangle, MessageSquare,
  Loader2, Calendar, RefreshCw, CheckCircle2, Layers,
  ChevronDown, ChevronUp, Users
} from "lucide-react";
import Image from "next/image";
import {
  PieChart, Pie, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, Legend
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { UserChatViewerModal } from "@/components/admin/UserChatViewerModal";

// ── Tipos ──────────────────────────────────────────────────────────────
interface RedListAlert {
  id: string;
  session_id: string;
  user_id: string;
  user_type: string;
  user_name?: string;
  session_name: string;
  motivo: string;
  fecha_chat: string;
  fecha_deteccion: string;
}

interface CategoryStat {
  categoria: string;
  conteo: number;
  user_type: string;
}

interface SyncResult {
  sesiones_analizadas: number;
  alertas_nuevas: number;
  categorias_detectadas: string[];
  message?: string;
}

export default function MonitoreoIAPage() {
  const { config } = useInstitucion();
  const supabase = createClient();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<RedListAlert[]>([]);
  const [alumnoStats, setAlumnoStats] = useState<CategoryStat[]>([]);
  const [profesorStats, setProfesorStats] = useState<CategoryStat[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [days, setDays] = useState(7);
  const [activeTab, setActiveTab] = useState<"alumnos" | "profesores">("alumnos");

  // State para el directorio de usuarios
  const [activeDirectoryTab, setActiveDirectoryTab] = useState<"alumnos" | "profesores">("alumnos");
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [selectedUserForChat, setSelectedUserForChat] = useState<{ id: string, name: string, type: "alumno"|"profesor", defaultSessionId?: string } | null>(null);
  
  // Estado para acordeón de Lista Roja
  const [expandedAlertUsers, setExpandedAlertUsers] = useState<Record<string, boolean>>({});

  const primaryColor = config?.color_primario || "#4f46e5";
  
  // Paleta de colores vibrantes y distintos para la gráfica
  const CHART_COLORS = [
    primaryColor, 
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#06b6d4", // cyan
    "#ec4899", // pink
    "#f97316", // orange
    "#14b8a6", // teal
    "#6366f1", // indigo
  ];

  // ── Carga de datos desde BD local (instántaneo) ────────────────────
  const loadDashboardData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [alertsRes, catsRes, lastSyncRes] = await Promise.all([
        // Lista roja permanente
        supabase
          .from("ai_red_list_alerts")
          .select("*")
          .order("fecha_deteccion", { ascending: false }),

        // Resumen de categorías desde la vista auxiliar
        supabase
          .from("ai_category_summary")
          .select("*"),

        // Fecha del análisis más reciente
        supabase
          .from("ai_session_categories")
          .select("last_analyzed_at")
          .order("last_analyzed_at", { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (alertsRes.data) {
        let alertsData = alertsRes.data;
        if (alertsData.length > 0) {
          const alumnoIds = Array.from(new Set(alertsData.filter(a => a.user_type === "alumno").map(a => a.user_id)));
          const profesorIds = Array.from(new Set(alertsData.filter(a => a.user_type === "profesor").map(a => a.user_id)));

          const nameMap = new Map<string, string>();

          if (alumnoIds.length > 0) {
            const { data: alumnos } = await supabase.from("profiles").select("id, nombre, apellidos").in("id", alumnoIds);
            alumnos?.forEach(a => nameMap.set(a.id, `${a.nombre} ${a.apellidos || ''}`.trim()));
          }
          if (profesorIds.length > 0) {
            const { data: profes } = await supabase.from("profiles").select("id, nombre, apellidos").in("id", profesorIds);
            profes?.forEach(a => nameMap.set(a.id, `${a.nombre} ${a.apellidos || ''}`.trim()));
          }

          alertsData = alertsData.map(a => ({
            ...a,
            user_name: nameMap.get(a.user_id) || a.user_name || "Usuario Desconocido"
          }));
        }
        setAlerts(alertsData);
      }
      if (catsRes.data) {
        setAlumnoStats(catsRes.data.filter((r: any) => r.user_type === "alumno"));
        setProfesorStats(catsRes.data.filter((r: any) => r.user_type === "profesor"));
      }
      if (lastSyncRes.data) setLastSync(lastSyncRes.data.last_analyzed_at);
    } catch (e) {
      console.error("Error cargando datos del dashboard:", e);
    } finally {
      setIsLoadingData(false);
    }
  }, [supabase]);

  const loadDirectory = useCallback(async (type: "alumnos" | "profesores") => {
    setIsLoadingDirectory(true);
    try {
      // type="alumnos" -> API expects "alumno"
      const apiType = type === "alumnos" ? "alumno" : "profesor";
      const res = await fetch(`/api/admin/ia-monitoring/users?type=${apiType}`);
      const data = await res.json();
      if (data.success) {
        setDirectoryUsers(data.users || []);
      }
    } catch (e) {
      console.error("Error loading directory:", e);
    } finally {
      setIsLoadingDirectory(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    loadDirectory(activeDirectoryTab);
  }, [activeDirectoryTab, loadDirectory]);

  // ── Disparar análisis Delta ────────────────────────────────────────
  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/ia-monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();

      if (data.success) {
        setSyncResult(data);
        toast({
          title: data.sesiones_analizadas === 0
            ? "✅ Todo al día. No hay mensajes nuevos."
            : `✅ ${data.sesiones_analizadas} sesión(es) sincronizada(s).`,
        });
        // Recargar las gráficas con la nueva data
        await loadDashboardData();
      } else {
        toast({ title: "Error en el análisis", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de conexión al analizar", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("es-MX", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const currentStats = activeTab === "alumnos" ? alumnoStats : profesorStats;

  const groupedAlerts = React.useMemo(() => {
    const groups: Record<string, { user_id: string; user_name: string; user_type: string; alerts: RedListAlert[] }> = {};
    alerts.forEach(alert => {
      if (!groups[alert.user_id]) {
        groups[alert.user_id] = {
          user_id: alert.user_id,
          user_name: alert.user_name || alert.user_type,
          user_type: alert.user_type,
          alerts: []
        };
      }
      groups[alert.user_id].alerts.push(alert);
    });
    // Sort so users with more alerts appear first
    return Object.values(groups).sort((a, b) => b.alerts.length - a.alerts.length);
  }, [alerts]);

  const toggleUserExpanded = (userId: string) => {
    setExpandedAlertUsers(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Robot Thinking Overlay ────────────────────────────────────── */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="relative w-52 h-52 animate-bot-thinking mb-6">
            <Image
              src="/images/THINKINGBOT.png"
              alt="IA Analizando"
              fill
              className="object-contain drop-shadow-[0_0_40px_rgba(99,102,241,0.9)]"
              priority
            />
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-36 h-7
              bg-blue-500/50 rounded-full blur-xl animate-pulse" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-widest uppercase mb-2">
            Analizando con IA
          </h2>
          <p className="text-blue-200 font-medium text-sm">
            El motor de IA está clasificando los nuevos mensajes...
          </p>
          <div className="flex items-center gap-2 mt-6 bg-white/10 px-5 py-2.5 rounded-full">
            <Loader2 size={14} className="animate-spin text-blue-300" />
            <span className="text-xs text-white font-bold uppercase tracking-wider">
              Procesando únicamente mensajes nuevos
            </span>
          </div>
        </div>
      )}

      {/* ── Encabezado + Controles ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldAlert className="text-red-500" size={26} />
            Auditoría y Monitoreo IA
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Supervisión ética y categorización automática de conversaciones.
          </p>
          {lastSync && !isLoadingData && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <CheckCircle2 size={11} className="text-green-500" />
              Último análisis: {formatDate(lastSync)}
            </p>
          )}
        </div>

        {/* Panel de Sincronización */}
        <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 border-r border-gray-100">
            <Calendar size={15} className="text-gray-400" />
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer"
              disabled={isAnalyzing}
            >
              <option value={1}>Últimas 24 hrs</option>
              <option value={3}>Últimos 3 días</option>
              <option value={7}>Última semana</option>
              <option value={15}>Últimos 15 días</option>
            </select>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-white
              transition-all disabled:opacity-50 hover:shadow-md hover:-translate-y-0.5 text-sm"
            style={{ backgroundColor: primaryColor }}
          >
            {isAnalyzing ? (
              <><Loader2 size={15} className="animate-spin" /> Sincronizando...</>
            ) : (
              <><RefreshCw size={15} /> Sincronizar Análisis</>
            )}
          </button>
        </div>
      </div>

      {/* ── Resultado de Última Sincronización ────────────────────────── */}
      {syncResult && !isAnalyzing && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="text-indigo-500 mt-0.5 shrink-0" size={18} />
          <div>
            {syncResult.sesiones_analizadas === 0 ? (
              <p className="text-sm font-bold text-indigo-700">{syncResult.message}</p>
            ) : (
              <>
                <p className="text-sm font-bold text-indigo-700">
                  Sincronización completada: {syncResult.sesiones_analizadas} sesión(es) procesada(s),{" "}
                  {syncResult.alertas_nuevas} alerta(s) nueva(s).
                </p>
                {syncResult.categorias_detectadas?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs text-indigo-500 font-medium mr-1">Categorías detectadas:</span>
                    {syncResult.categorias_detectadas.map((cat) => (
                      <span key={cat} className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Grid Principal ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Gráficas de Categorías ─────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Pestañas */}
          <div className="border-b border-gray-100 flex items-center">
            {(["alumnos", "profesores"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-4 font-bold text-sm transition-colors capitalize",
                  activeTab === tab
                    ? "border-b-2 text-indigo-600 bg-indigo-50/50"
                    : "text-gray-500 hover:bg-gray-50"
                )}
                style={activeTab === tab ? { borderColor: primaryColor, color: primaryColor } : {}}
              >
                Chats de {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <Layers size={18} style={{ color: primaryColor }} />
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest">
                Categorización de Temas
              </h3>
            </div>

            {isLoadingData ? (
              <div className="h-80 flex items-center justify-center">
                <Loader2 className="animate-spin text-gray-300" size={40} />
              </div>
            ) : currentStats.length === 0 ? (
              <div className="h-80 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
                <RefreshCw className="text-gray-300 mb-3" size={32} />
                <p className="text-sm text-gray-500 font-medium text-center px-6">
                  No hay categorías aún. Presiona "Sincronizar Análisis" para que el sistema clasifique los chats.
                </p>
              </div>
            ) : (
              <div className="h-80 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={currentStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={85}
                      outerRadius={120}
                      paddingAngle={4}
                      dataKey="conteo"
                      nameKey="categoria"
                      stroke="none"
                      cornerRadius={8}
                    >
                      {currentStats.map((entry, index) => {
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                            style={{ filter: "drop-shadow(0px 4px 6px rgba(0,0,0,0.1))" }}
                          />
                        );
                      })}
                    </Pie>
                    <RechartsTooltip
                      cursor={{ fill: "transparent" }}
                      contentStyle={{
                        borderRadius: "16px",
                        border: "none",
                        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                        fontSize: "13px",
                        fontWeight: "bold"
                      }}
                      formatter={(value: any, name: string) => [`${value} sesiones`, name]}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      iconType="circle"
                      formatter={(value) => <span className="text-gray-600 font-medium text-xs ml-1">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Etiqueta central */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                  <span className="text-3xl font-black text-gray-900">
                    {currentStats.reduce((sum, item) => sum + item.conteo, 0)}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Sesiones</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Lista Roja Permanente ─────────────────────────────────────── */}
        <div className="lg:col-span-1 flex flex-col">
          <div className="bg-white rounded-2xl border border-red-200 shadow-[0_4px_20px_rgba(239,68,68,0.08)] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-red-50 to-red-50/30 p-5 border-b border-red-100
              flex items-center justify-between">
              <div>
                <h3 className="font-black text-red-600 flex items-center gap-2 text-sm">
                  <AlertTriangle size={16} />
                  Lista Roja — Infracciones
                </h3>
                <p className="text-xs text-red-400 mt-0.5">Registro permanente y acumulativo</p>
              </div>
              <div className="bg-red-100 text-red-700 font-black text-xs px-2.5 py-1 rounded-full border border-red-200">
                {alerts.length} caso{alerts.length !== 1 ? "s" : ""}
              </div>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar space-y-3"
              style={{ maxHeight: "520px" }}>
              {isLoadingData ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin text-red-300" size={24} />
                </div>
              ) : groupedAlerts.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="text-green-400" size={24} />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">
                    Sin infracciones detectadas
                  </p>
                </div>
              ) : (
                groupedAlerts.map((group) => {
                  const isExpanded = expandedAlertUsers[group.user_id];
                  return (
                    <div
                      key={group.user_id}
                      className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden"
                    >
                      {/* Accordion Header */}
                      <button
                        onClick={() => toggleUserExpanded(group.user_id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-lg",
                            group.user_type === "alumno" ? "bg-blue-500" : "bg-purple-500"
                          )}>
                            {group.user_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-gray-900">{group.user_name}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                                group.user_type === "alumno" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                              )}>
                                {group.user_type}
                              </span>
                              <span className="text-[10px] text-gray-500 font-medium">
                                {group.alerts.length} caso{group.alerts.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-gray-400">
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </button>

                      {/* Accordion Content */}
                      {isExpanded && (
                        <div className="p-4 pt-0 border-t border-gray-50 bg-slate-50/50 space-y-3">
                          {group.alerts.map((alert) => (
                            <div key={alert.id} className="bg-white border border-red-100 rounded-lg p-3 shadow-sm mt-3">
                              <div className="flex justify-between items-start mb-2 gap-2">
                                <h5 className="text-xs font-bold text-gray-900 line-clamp-1" title={alert.session_name}>
                                  {alert.session_name}
                                </h5>
                                <span className="text-[10px] text-gray-400 font-medium shrink-0">
                                  {formatDate(alert.fecha_chat)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700 bg-red-50/50 p-2.5 rounded-lg italic mb-3 leading-relaxed">
                                "{alert.motivo}"
                              </p>
                              <button
                                onClick={() => setSelectedUserForChat({
                                  id: alert.user_id,
                                  name: alert.user_name || alert.user_type.toUpperCase(),
                                  type: alert.user_type as "alumno" | "profesor",
                                  defaultSessionId: alert.session_id
                                })}
                                className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100
                                  py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <MessageSquare size={12} />
                                Ver Chat Completo
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── Directorio de Usuarios de IA (NUEVO) ───────────────────────── */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mt-10">
        <div className="p-8 pb-4">
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2 mb-2">
            <MessageSquare size={24} style={{ color: primaryColor }} />
            Directorio de Historias IA
          </h2>
          <p className="text-sm text-gray-500">
            Explora las conversaciones individuales de cada usuario con la inteligencia artificial.
          </p>
        </div>

        {/* Pestañas de Directorio */}
        <div className="px-8 border-b border-gray-100 flex items-center gap-6">
          {(["alumnos", "profesores"] as const).map((tab) => (
            <button
              key={`dir-${tab}`}
              onClick={() => setActiveDirectoryTab(tab)}
              className={cn(
                "py-4 font-black text-sm transition-all capitalize border-b-2",
                activeDirectoryTab === tab
                  ? "text-gray-900"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
              style={activeDirectoryTab === tab ? { borderColor: primaryColor } : {}}
            >
              {tab} con IA
            </button>
          ))}
        </div>

        <div className="p-8 bg-slate-50/50">
          {isLoadingDirectory ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={32} /></div>
          ) : directoryUsers.length === 0 ? (
            <div className="text-center py-16 text-gray-400 font-medium bg-white rounded-2xl border border-dashed border-gray-200">
              Ningún {activeDirectoryTab.slice(0, -1)} ha utilizado la IA aún.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {directoryUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
                >
                  <div className="mb-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-lg"
                           style={{ backgroundColor: primaryColor }}>
                        {user.nombre.charAt(0)}
                      </div>
                      <span className="bg-gray-100 text-gray-600 font-bold text-xs px-2.5 py-1 rounded-full">
                        {user.total_sesiones} chats
                      </span>
                    </div>
                    <h4 className="font-bold text-gray-900">{user.nombre} {user.apellidos}</h4>
                    {user.matricula && (
                      <p className="text-xs text-gray-500 font-medium">Matrícula: {user.matricula}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedUserForChat({ 
                      id: user.id, 
                      name: `${user.nombre} ${user.apellidos}`, 
                      type: user.user_type 
                    })}
                    className="w-full text-sm font-bold py-2.5 rounded-xl transition-all"
                    style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${primaryColor}25`}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `${primaryColor}15`}
                  >
                    Ver Conversaciones
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Visor de Chats */}
      {selectedUserForChat && (
        <UserChatViewerModal
          isOpen={!!selectedUserForChat}
          onClose={() => setSelectedUserForChat(null)}
          userId={selectedUserForChat.id}
          userName={selectedUserForChat.name}
          userType={selectedUserForChat.type}
          defaultSessionId={selectedUserForChat.defaultSessionId}
          primaryColor={primaryColor}
        />
      )}
    </div>
  );
}
