"use client";

import { useInstitucion } from "@/hooks/use-institucion";
import { useEffect } from "react";

// Convierte un color HEX (ej. #8B2332 o #06b895) a HSL string 'H S% L%'
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
    l = Math.max(0.05, Math.min(0.95, l + lightnessModifier));
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Calcula la luminosidad percibida (WCAG estándar)
function getLuminance(hex: string): number {
  if (!hex) return 0;
  const cleanHex = hex.replace(/^#/, '');
  const fullHex = cleanHex.length === 3 ? cleanHex.split('').map(x => x + x).join('') : cleanHex;
  const r = parseInt(fullHex.substring(0, 2), 16) / 255;
  const g = parseInt(fullHex.substring(2, 4), 16) / 255;
  const b = parseInt(fullHex.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { config } = useInstitucion();

  useEffect(() => {
    if (config.color_primario) {
      const primaryHex = config.color_primario;
      const primaryLuminance = getLuminance(primaryHex);
      const isLightBg = primaryLuminance > 0.65;

      const primaryHsl = hexToHsl(primaryHex);
      // Para la barra lateral, oscurecemos proporcionalmente para profundidad premium
      const sidebarBgHsl = hexToHsl(primaryHex, isLightBg ? -0.05 : -0.15);
      const sidebarAccentHsl = hexToHsl(primaryHex, isLightBg ? -0.12 : 0.08);

      const root = document.documentElement;

      // Color primario y sus contrastes
      root.style.setProperty('--primary', primaryHsl);
      root.style.setProperty('--primary-foreground', isLightBg ? '0 0% 10%' : '0 0% 100%');
      root.style.setProperty('--ring', primaryHsl);

      // Barra Lateral inteligente (se adapta automáticamente con máximo contraste)
      root.style.setProperty('--sidebar-background', sidebarBgHsl);
      root.style.setProperty('--sidebar-foreground', isLightBg ? '222 47% 11%' : '0 0% 100%');
      root.style.setProperty('--sidebar-primary', primaryHsl);
      root.style.setProperty('--sidebar-primary-foreground', isLightBg ? '0 0% 10%' : '0 0% 100%');
      root.style.setProperty('--sidebar-accent', sidebarAccentHsl);
      root.style.setProperty('--sidebar-accent-foreground', isLightBg ? '222 47% 11%' : '0 0% 100%');
      root.style.setProperty('--sidebar-border', isLightBg ? '0 0% 0% / 0.1' : '0 0% 100% / 0.15');
      root.style.setProperty('--sidebar-ring', primaryHsl);
    }
    
    if (config.color_secundario) {
      const secondaryHsl = hexToHsl(config.color_secundario);
      const secondaryLuminance = getLuminance(config.color_secundario);
      document.documentElement.style.setProperty('--secondary', secondaryHsl);
      document.documentElement.style.setProperty('--secondary-foreground', secondaryLuminance > 0.6 ? '0 0% 10%' : '0 0% 100%');
    }
  }, [config.color_primario, config.color_secundario]);

  return <>{children}</>;
}
