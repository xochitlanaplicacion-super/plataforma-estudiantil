"use client";

import { useInstitucion } from "@/hooks/use-institucion";
import { useEffect } from "react";

// Convierte un color HEX (ej. #8B2332) a un string con formato 'H S L' (ej. '342 61 29' o '342 61% 29%')
// Opcionalmente podemos modificar la luminosidad para crear variantes (ej. para el sidebar)
function hexToHsl(hex: string, lightnessModifier?: number): string {
  if (!hex) return "0 0% 0%";
  
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(x => x + x).join('');
  }

  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;

  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  if (lightnessModifier !== undefined) {
    l = Math.max(0, Math.min(1, l + lightnessModifier));
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { config, loading } = useInstitucion();

  useEffect(() => {
    // Aplicamos los colores globalmente cuando carga la configuración
    if (config.color_primario) {
      const primaryHsl = hexToHsl(config.color_primario);
      const sidebarBgHsl = hexToHsl(config.color_primario, -0.15); // Sidebar 15% más oscuro
      const sidebarAccentHsl = hexToHsl(config.color_primario, -0.05);

      document.documentElement.style.setProperty('--primary', primaryHsl);
      document.documentElement.style.setProperty('--ring', primaryHsl);
      document.documentElement.style.setProperty('--sidebar-background', sidebarBgHsl);
      document.documentElement.style.setProperty('--sidebar-accent', sidebarAccentHsl);
      document.documentElement.style.setProperty('--sidebar-primary', primaryHsl);
    }
    
    if (config.color_secundario) {
      const secondaryHsl = hexToHsl(config.color_secundario);
      document.documentElement.style.setProperty('--secondary', secondaryHsl);
    }
  }, [config.color_primario, config.color_secundario]);

  return <>{children}</>;
}
