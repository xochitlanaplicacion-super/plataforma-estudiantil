"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useInstitucion } from "@/hooks/use-institucion";
import {
  ShieldAlert, Play, AlertTriangle, MessageSquare,
  Loader2, Calendar, RefreshCw, CheckCircle2, Layers
} from "lucide-react";
import Image from "next/image";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Tipos ──────────────────────────────────────────────────────────────
interface RedListAlert {
  id: string;
  session_id: string;
  user_id: string;
  user_type: string;
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

  const [alerts, setAlerts] = useState<RedListAlert[]>([]);
  const [alumnoStats, setAlumnoStats] = useState<CategoryStat[]>([]);
  const [profesorStats, setProfesorStats] = useState<CategoryStat[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [days, setDays] = useState(7);
  const [activeTab, setActiveTab] = useState<"alumnos" | "profesores">("alumnos");

  const primaryColor = config?.color_primario || "#4f46e5";

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

      if (alertsRes.data) setAlerts(alertsRes.data);
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

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

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
        toast.success(
          data.sesiones_analizadas === 0
            ? "✅ Todo al día. No hay mensajes nuevos."
            : `✅ ${data.sesiones_analizadas} sesión(es) sincronizada(s).`
        );
        // Recargar las gráficas con la nueva data
        await loadDashboardData();
      } else {
        toast.error("Error en el análisis: " + data.error);
      }
    } catch {
      toast.error("Error de conexión al analizar");
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
            DeepSeek V4 Flash está clasificando los nuevos mensajes...
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
              <Layers size={15} className="text-gray-400" />
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                Categorización de Temas (acumulado permanente)
              </h3>
            </div>

            {isLoadingData ? (
              <div className="h-72 flex items-center justify-center">
                <Loader2 className="animate-spin text-gray-300" size={32} />
              </div>
            ) : currentStats.length === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <RefreshCw className="text-gray-300 mb-3" size={32} />
                <p className="text-sm text-gray-500 font-medium text-center px-6">
                  No hay categorías aún. Presiona "Sincronizar Análisis" para que DeepSeek clasifique los chats.
                </p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={currentStats}
                    layout="vertical"
                    margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="categoria"
                      type="category"
                      width={160}
                      tick={{ fontSize: 12, fontWeight: 600, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                        fontSize: "12px",
                      }}
                      formatter={(value: any) => [`${value} sesiones`, "Total"]}
                    />
                    <Bar dataKey="conteo" radius={[0, 6, 6, 0]} barSize={26}>
                      {currentStats.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={primaryColor}
                          opacity={Math.max(0.4, 1 - index * 0.12)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
              ) : alerts.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="text-green-400" size={24} />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">
                    Sin infracciones detectadas
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm
                      hover:border-red-200 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                        alert.user_type === "alumno"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-purple-50 text-purple-600"
                      )}>
                        {alert.user_type}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {formatDate(alert.fecha_chat)}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 line-clamp-1 mb-1.5"
                      title={alert.session_name}>
                      {alert.session_name}
                    </h4>
                    <p className="text-xs text-gray-600 bg-red-50 p-2.5 rounded-lg italic mb-3 leading-relaxed">
                      "{alert.motivo}"
                    </p>
                    <button
                      className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100
                        py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <MessageSquare size={12} />
                      Ver Chat Completo
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
