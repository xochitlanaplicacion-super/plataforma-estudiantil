'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { SLIDE_TEMPLATES } from './slide-templates';

// ─── Tipos (compartidos con el editor) ───────────────────
interface SlideElement {
  id: string;
  type: 'text' | 'image';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: {
    fontSize?: string;
    fontWeight?: string;
    fontStyle?: string;
    color?: string;
    textAlign?: string;
  };
}

interface SlideCanvasData {
  elements: SlideElement[];
}

// ─── Helper para parsear contenido ───────────────────────
function parseContent(raw: string | null): { isCanvas: boolean; data: SlideCanvasData; legacyText?: string } {
  if (!raw) return { isCanvas: false, data: { elements: [] } };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.elements)) {
      parsed.elements = parsed.elements.map((el: any, idx: number) => ({
        ...el,
        id: el.id || `healed-viewer-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`
      }));
      return { isCanvas: true, data: parsed };
    }
  } catch {
    // Es texto plano legado
  }
  return { isCanvas: false, data: { elements: [] }, legacyText: raw };
}

// ─── Mapa de estilos legado ──────────────────────────────
const LEGACY_STYLE_MAP: Record<string, string> = {
  'azul': 'bg-slate-900 from-slate-900 to-blue-900 text-white',
  'vino': 'bg-[#4c0519] from-[#4c0519] to-[#8B2332] text-white',
  'verde': 'bg-[#064e3b] from-[#064e3b] to-[#1A4A3F] text-white',
  'oscuro': 'bg-black from-black to-slate-900 text-white',
};

// ─── Componente Viewer ───────────────────────────────────
interface SlideViewerProps {
  slide: {
    titulo?: string;
    contenido?: string;
    imagen_url?: string;
    estilo?: string;
  };
  className?: string;
}

export default function SlideViewer({ slide, className = '' }: SlideViewerProps) {
  const { isCanvas, data, legacyText } = parseContent(slide.contenido || null);
  const templateId = slide.estilo || 'azul';
  const hasCanvasTemplate = !!SLIDE_TEMPLATES[templateId];

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    if (!isCanvas || !hasCanvasTemplate) return;
    const updateScale = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setScale(rect.width / 960);
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [isCanvas, hasCanvasTemplate]);

  // ─── MODO CANVAS (nuevo formato JSON) ──────────────────
  if (isCanvas && hasCanvasTemplate) {
    const TemplateComponent = SLIDE_TEMPLATES[templateId].component;

    return (
      <div 
        ref={containerRef}
        className={cn("w-full relative overflow-hidden", className)} 
        style={{ paddingBottom: '56.25%' /* 16:9 */ }}
      >
        <div 
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: '960px',
            height: '540px',
            transform: `scale(${scale})`,
          }}
        >
          <TemplateComponent>
            {/* Renderizar elementos posicionados por porcentajes */}
            {data.elements.map((el, idx) => (
              <div
                key={el.id || idx}
                className="absolute overflow-hidden"
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                }}
              >
                {el.type === 'text' ? (
                  <div
                    className="w-full h-full overflow-hidden p-1 font-medium"
                    style={{
                      fontSize: el.style?.fontSize || '24px',
                      fontWeight: el.style?.fontWeight || 'normal',
                      fontStyle: el.style?.fontStyle || 'normal',
                      color: el.style?.color || '#ffffff',
                      textAlign: (el.style?.textAlign as any) || 'left',
                      fontFamily: (el.style as any)?.fontFamily || 'inherit',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {el.content}
                  </div>
                ) : (
                  <img
                    src={el.content}
                    alt="Contenido visual"
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                )}
              </div>
            ))}
          </TemplateComponent>
        </div>
      </div>
    );
  }

  // ─── MODO LEGADO (texto plano + colores clásicos) ──────
  const splitImageUrls = (urls: string) => {
    if (!urls) return [];
    return urls.split(/,(?=http|data:)/).map(u => u.trim()).filter(Boolean);
  };

  return (
    <div className={cn(
      "w-full relative bg-gradient-to-br overflow-hidden",
      LEGACY_STYLE_MAP[templateId] || LEGACY_STYLE_MAP['azul'],
      className
    )}
    style={{ paddingBottom: '56.25%' /* 16:9 */ }}
    >
      <div className="absolute inset-0 flex flex-col md:flex-row items-center justify-center gap-8 p-10 md:p-16">
        <div className="flex-1 flex flex-col justify-center max-w-full overflow-hidden">
          {slide.titulo && (
            <h1
              className="font-black uppercase tracking-tight mb-6 leading-tight"
              style={{ fontSize: 'clamp(1.5rem, 5vw, 3.5rem)' }}
            >
              {slide.titulo}
            </h1>
          )}
          {legacyText && (
            <div className="overflow-y-auto max-h-[50vh] pr-4 custom-scrollbar">
              <p
                className="font-medium leading-relaxed opacity-90"
                style={{ fontSize: 'clamp(0.9rem, 2vw, 1.8rem)' }}
              >
                {legacyText}
              </p>
            </div>
          )}
        </div>
        {slide.imagen_url && (
          <div className="flex-1 w-full h-full max-h-[60vh] flex items-center justify-center">
            <div className={cn(
              "grid gap-4 w-full h-full p-4",
              splitImageUrls(slide.imagen_url).length === 1 ? "grid-cols-1" : "grid-cols-2"
            )}>
              {splitImageUrls(slide.imagen_url).map((url, i) => (
                <div key={i} className="relative w-full h-full overflow-hidden rounded-2xl shadow-2xl border border-white/10">
                  <img src={url} alt="Slide" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
