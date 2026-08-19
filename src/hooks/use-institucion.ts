"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { InstitucionConfig, TemaLogin } from "@/lib/types";

const CACHE_KEY = "institucion_config_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const DEFAULTS: InstitucionConfig = {
  id: 1,
  nombre_completo: 'Mi Institución',
  nombre_corto: 'Mi Institución',
  siglas: 'MI',
  codigo_matricula: '',
  slogan: 'Plataforma Académica',
  url_plataforma: '',
  nombre_ia: '',
  color_primario: '#0f172a', // Neutral Slate por defecto
  color_secundario: '#334155',
  temas_login: [
    { id: "vino", bgImage: "/images/FONDO_ROJO.png", buttonColor: "#8B2332", textColor: "text-white", glassStyle: "bg-black/20 border-white/30 text-white" },
    { id: "verde", bgImage: "/images/FONDOS_VERDE.png", buttonColor: "#1A4A3F", textColor: "text-white", glassStyle: "bg-black/20 border-white/30 text-white" },
    { id: "beige", bgImage: "/images/fondos_beige.jpg", buttonColor: "#E8D5B7", textColor: "text-[#1A4A3F]", glassStyle: "bg-primary/10 border-primary/20 text-primary" },
  ],
  modo_tema_login: 'aleatorio',
  tema_fijo_index: 0,
  niveles_nombres: [
    { clave: "bachillerato", nombre: "Bachillerato" },
    { clave: "universidad", nombre: "Universidad" },
    { clave: "capacitaciones", nombre: "Capacitaciones" },
  ],
  telefono_contacto: '',
  correo_contacto: '',
  horarios_atencion: [],
};

interface CacheEntry {
  data: InstitucionConfig;
  timestamp: number;
}

function getCached(): InstitucionConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache(data: InstitucionConfig) {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Silently fail if localStorage is full
  }
}

export function useInstitucion(options?: { bypassCache?: boolean }) {
  const [config, setConfig] = useState<InstitucionConfig>(() => {
    if (typeof window !== 'undefined' && !options?.bypassCache) {
      const cached = getCached();
      if (cached) return cached;
    }
    return DEFAULTS;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && !options?.bypassCache) {
      return !getCached();
    }
    return true;
  });

  const fetchConfig = useCallback(async () => {
    // 1. Intentar cache primero (si no está desactivado)
    if (!options?.bypassCache) {
      const cached = getCached();
      if (cached) {
        setConfig(cached);
        setLoading(false);
        return;
      }
    }

    // 2. Fetch desde Supabase
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("configuracion_sistema")
        .select("*")
        .eq("id", 1)
        .single();

      if (error || !data) {
        setConfig(DEFAULTS);
        setLoading(false);
        return;
      }

      const parsed: InstitucionConfig = {
        id: data.id,
        nombre_completo: data.nombre_completo || DEFAULTS.nombre_completo,
        nombre_corto: data.nombre_corto || DEFAULTS.nombre_corto,
        siglas: data.siglas || DEFAULTS.siglas,
        codigo_matricula: data.codigo_matricula ?? DEFAULTS.codigo_matricula,
        slogan: data.slogan || DEFAULTS.slogan,
        direccion: data.direccion || undefined,
        sitio_web: data.sitio_web || undefined,
        url_plataforma: data.url_plataforma || undefined,
        logo_url: data.logo_url || undefined,
        logo_dark_url: data.logo_dark_url || undefined,
        favicon_url: data.favicon_url || undefined,
        color_primario: data.color_primario || DEFAULTS.color_primario,
        color_secundario: data.color_secundario || DEFAULTS.color_secundario,
        temas_login: (data.temas_login as TemaLogin[]) || DEFAULTS.temas_login,
        modo_tema_login: data.modo_tema_login || DEFAULTS.modo_tema_login,
        tema_fijo_index: data.tema_fijo_index ?? DEFAULTS.tema_fijo_index,
        niveles_nombres: (data.niveles_nombres as any[]) || DEFAULTS.niveles_nombres,
        telefono_contacto: data.telefono_contacto || DEFAULTS.telefono_contacto,
        correo_contacto: data.correo_contacto || DEFAULTS.correo_contacto,
        horarios_atencion: (data.horarios_atencion as any[]) || [],
        landing_config: data.landing_config || undefined,
        updated_at: data.updated_at,
        smtp_host: data.smtp_host || undefined,
        smtp_port: data.smtp_port || undefined,
        smtp_user: data.smtp_user || undefined,
        smtp_password: data.smtp_password || undefined,
        smtp_from_name: data.smtp_from_name || undefined,
        nombre_ia: data.nombre_ia || undefined,
      };

      setConfig(parsed);
      setCache(parsed);
    } catch {
      setConfig(DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setLoading(true);
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, refresh };
}
