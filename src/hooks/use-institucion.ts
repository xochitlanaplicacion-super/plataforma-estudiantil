"use client";

import { useState, useEffect, useCallback } from "react";
import { getInstitucionConfig } from "@/lib/actions/institucion";
import { InstitucionConfig } from "@/lib/types";

const CACHE_PREFIX = "institucion_config_cache:";
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
    const key = `${CACHE_PREFIX}${window.location.hostname.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
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
    localStorage.setItem(`${CACHE_PREFIX}${window.location.hostname.toLowerCase()}`, JSON.stringify(entry));
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

    // La acción del servidor resuelve el tenant por hostname y sólo devuelve
    // configuración pública; las credenciales SMTP nunca llegan al navegador.
    try {
      const resolved = await getInstitucionConfig();
      setConfig(resolved);
      setCache(resolved);
    } catch {
      setConfig(DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, [options?.bypassCache]);

  const refresh = useCallback(() => {
    localStorage.removeItem(`${CACHE_PREFIX}${window.location.hostname.toLowerCase()}`);
    setLoading(true);
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, refresh };
}
