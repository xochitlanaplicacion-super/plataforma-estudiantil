'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, Type, ImageIcon, Trash2, Move, Maximize2, 
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  ChevronUp, ChevronDown, Palette as PaletteIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SLIDE_TEMPLATES } from './slide-templates';

// ─── Tipos ───────────────────────────────────────────────
export interface SlideElement {
  id: string;
  type: 'text' | 'image';
  content: string;      // texto o URL de imagen
  x: number;            // porcentaje 0-100
  y: number;            // porcentaje 0-100
  width: number;        // porcentaje 0-100
  height: number;       // porcentaje 0-100
  style?: {
    fontSize?: string;
    fontWeight?: string;
    fontStyle?: string;
    color?: string;
    textAlign?: string;
    fontFamily?: string;
  };
}

export interface SlideCanvasData {
  elements: SlideElement[];
}

// ─── Helpers ─────────────────────────────────────────────
export function parseSlideContent(raw: string | null): SlideCanvasData {
  if (!raw) return { elements: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.elements)) {
      // Self-heal: ensure every element has a unique ID
      parsed.elements = parsed.elements.map((el: any, idx: number) => ({
        ...el,
        id: el.id || `healed-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`
      }));
      return parsed;
    }
  } catch {
    // Contenido legado (texto plano): convertir a un solo elemento de texto
    if (raw && raw.trim().length > 0) {
      return {
        elements: [{
          id: 'legacy-text',
          type: 'text',
          content: raw,
          x: 5, y: 20, width: 90, height: 60,
          style: { fontSize: '24px', fontWeight: 'normal', color: '#ffffff', textAlign: 'left' }
        }]
      };
    }
  }
  return { elements: [] };
}

export function serializeSlideContent(data: SlideCanvasData): string {
  return JSON.stringify(data);
}

// ─── Dimensiones base del lienzo (aspect ratio 16:9) ────
const CANVAS_W = 960;
const CANVAS_H = 540;

// ─── Componente Principal ────────────────────────────────
interface SlideCanvasEditorProps {
  templateId: string;
  canvasData: SlideCanvasData;
  titulo: string;
  onChange: (data: SlideCanvasData) => void;
  onTituloChange: (titulo: string) => void;
  onImageUpload?: (file: File) => Promise<string | null>;
  onImageDelete?: (url: string) => Promise<void>;
  onApplyGlobalStyles?: (style: any) => void;
}

export default function SlideCanvasEditor({
  templateId,
  canvasData,
  titulo,
  onChange,
  onTituloChange,
  onImageUpload,
  onImageDelete,
  onApplyGlobalStyles
}: SlideCanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calcular la escala del lienzo vs el contenedor real
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasScale(rect.width / CANVAS_W);
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const selectedElement = canvasData.elements.find(e => e.id === selectedId);

  // ─── Acciones ──────────────────────────────────────────
  const addTextElement = () => {
    const newEl: SlideElement = {
      id: `text-${Date.now()}`,
      type: 'text',
      content: 'Escribe aquí...',
      x: 10, y: 30, width: 40, height: 15,
      style: { fontSize: '24px', fontWeight: 'bold', color: '#ffffff', textAlign: 'left' }
    };
    onChange({ elements: [...canvasData.elements, newEl] });
    setSelectedId(newEl.id);
  };

  const addImageElement = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    const url = await onImageUpload(file);
    if (url) {
      const newEl: SlideElement = {
        id: `img-${Date.now()}`,
        type: 'image',
        content: url,
        x: 50, y: 20, width: 30, height: 40,
      };
      onChange({ elements: [...canvasData.elements, newEl] });
      setSelectedId(newEl.id);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateElement = useCallback((id: string, patch: Partial<SlideElement>) => {
    onChange({
      elements: canvasData.elements.map(el => el.id === id ? { ...el, ...patch } : el)
    });
  }, [canvasData, onChange]);

  const deleteElement = (id: string) => {
    // Si es una imagen subida por el usuario, borrarla del bucket
    const el = canvasData.elements.find(e => e.id === id);
    if (el?.type === 'image' && el.content && onImageDelete) {
      onImageDelete(el.content).catch(err =>
        console.error('Error al borrar imagen del bucket:', err)
      );
    }
    onChange({ elements: canvasData.elements.filter(el => el.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const moveLayer = (id: string, dir: 'up' | 'down') => {
    const idx = canvasData.elements.findIndex(el => el.id === id);
    if (idx === -1) return;
    const newEls = [...canvasData.elements];
    const targetIdx = dir === 'up' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= newEls.length) return;
    [newEls[idx], newEls[targetIdx]] = [newEls[targetIdx], newEls[idx]];
    onChange({ elements: newEls });
  };

  // Obtener el componente de la plantilla
  const TemplateComponent = SLIDE_TEMPLATES[templateId]?.component || SLIDE_TEMPLATES['azul']?.component;

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de título */}
      <Input
        className="text-xl h-14 font-black uppercase border-none bg-white/5 text-white focus:bg-white/10 rounded-2xl px-6"
        value={titulo}
        onChange={e => onTituloChange(e.target.value.toUpperCase())}
        placeholder="TÍTULO DE LA DIAPOSITIVA"
      />

      {/* Barra de herramientas */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-2 font-bold text-[10px] uppercase bg-blue-600/10 border-blue-600/30 text-blue-400 hover:bg-blue-600/20"
          onClick={addTextElement}
        >
          <Type size={14} /> Texto
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-2 font-bold text-[10px] uppercase bg-emerald-600/10 border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/20"
          onClick={addImageElement}
        >
          <ImageIcon size={14} /> Imagen
        </Button>

        {selectedElement && (
          <>
            <div className="h-6 w-px bg-white/10 mx-2" />
            {selectedElement.type === 'text' && (
              <>
                <Button
                  variant="ghost" size="icon"
                  className={cn("h-8 w-8 rounded-lg text-white/60 hover:text-white", selectedElement.style?.fontWeight === 'bold' && 'bg-white/10 text-white')}
                  onClick={() => updateElement(selectedElement.id, { style: { ...selectedElement.style, fontWeight: selectedElement.style?.fontWeight === 'bold' ? 'normal' : 'bold' } })}
                ><Bold size={14} /></Button>
                <Button
                  variant="ghost" size="icon"
                  className={cn("h-8 w-8 rounded-lg text-white/60 hover:text-white", selectedElement.style?.fontStyle === 'italic' && 'bg-white/10 text-white')}
                  onClick={() => updateElement(selectedElement.id, { style: { ...selectedElement.style, fontStyle: selectedElement.style?.fontStyle === 'italic' ? 'normal' : 'italic' } })}
                ><Italic size={14} /></Button>
                <div className="h-6 w-px bg-white/10 mx-1" />
                {(['left', 'center', 'right'] as const).map(align => (
                  <Button
                    key={align}
                    variant="ghost" size="icon"
                    className={cn("h-8 w-8 rounded-lg text-white/60 hover:text-white", selectedElement.style?.textAlign === align && 'bg-white/10 text-white')}
                    onClick={() => updateElement(selectedElement.id, { style: { ...selectedElement.style, textAlign: align } })}
                  >
                    {align === 'left' ? <AlignLeft size={14} /> : align === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                  </Button>
                ))}
                <div className="h-6 w-px bg-white/10 mx-1" />
                <select
                  className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-white text-[10px] font-bold"
                  value={(selectedElement.style as any)?.fontFamily || 'Nunito'}
                  onChange={e => updateElement(selectedElement.id, { style: { ...selectedElement.style, fontFamily: e.target.value } })}
                >
                  {['Nunito', 'Inter', 'Poppins', 'Roboto', 'Patrick Hand', 'Caveat', 'Comfortaa', 'Comic Sans MS', 'Arial', 'Georgia'].map(f => (
                    <option key={f} value={f} className="bg-slate-900" style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>
                <div className="h-6 w-px bg-white/10 mx-1" />
                <div className="relative flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden h-8 w-16" title="Tamaño de fuente">
                  <input
                    type="text"
                    className="w-full h-full bg-transparent text-white text-[12px] font-bold pl-2 pr-1 outline-none"
                    value={(selectedElement.style?.fontSize || '24px').replace('px', '')}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      updateElement(selectedElement.id, { style: { ...selectedElement.style, fontSize: val ? `${val}px` : '' } });
                    }}
                  />
                  <span className="text-[10px] text-white/40 font-bold pr-2 select-none pointer-events-none">px</span>
                </div>
                <input
                  type="color"
                  className="h-8 w-8 rounded-lg cursor-pointer border border-white/10"
                  value={selectedElement.style?.color || '#ffffff'}
                  onChange={e => updateElement(selectedElement.id, { style: { ...selectedElement.style, color: e.target.value } })}
                />
                {onApplyGlobalStyles && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-2 rounded-lg bg-purple-500/20 text-purple-300 hover:text-white hover:bg-purple-500/40 text-[10px] uppercase font-bold tracking-wider ml-2" 
                    onClick={() => onApplyGlobalStyles(selectedElement.style)}
                    title="Aplicar fuente y color a todas las diapositivas"
                  >
                    <PaletteIcon size={14} className="mr-1" /> Global
                  </Button>
                )}
              </>
            )}
            <div className="h-6 w-px bg-white/10 mx-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-white/40 hover:text-white" onClick={() => moveLayer(selectedElement.id, 'up')}><ChevronUp size={14} /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-white/40 hover:text-white" onClick={() => moveLayer(selectedElement.id, 'down')}><ChevronDown size={14} /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteElement(selectedElement.id)}><Trash2 size={14} /></Button>
          </>
        )}
      </div>

      {/* Lienzo 16:9 */}
      <div 
        ref={containerRef}
        className="w-full relative overflow-hidden rounded-2xl shadow-2xl border border-white/10" 
        style={{ paddingBottom: `${(CANVAS_H / CANVAS_W) * 100}%` }}
      >
        <div
          ref={canvasRef}
          className="absolute top-0 left-0 origin-top-left cursor-crosshair"
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            transform: `scale(${canvasScale})`,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvas === 'bg') {
              setSelectedId(null);
            }
          }}
        >
          {/* Fondo de plantilla */}
          {TemplateComponent ? (
            <TemplateComponent className="pointer-events-none">
              <div data-canvas="bg" className="w-full h-full" />
            </TemplateComponent>
          ) : (
            <div className="w-full h-full bg-slate-900" data-canvas="bg" />
          )}

          {/* Elementos arrastrables */}
          {canvasData.elements.map((el, zIndex) => {
            const pxX = (el.x / 100) * CANVAS_W;
            const pxY = (el.y / 100) * CANVAS_H;
            const pxW = (el.width / 100) * CANVAS_W;
            const pxH = (el.height / 100) * CANVAS_H;

            return (
              <Rnd
                key={el.id}
                scale={canvasScale}
                position={{ x: pxX, y: pxY }}
                size={{ width: pxW, height: pxH }}
                bounds="parent"
                dragHandleClassName="drag-handle"
                onDragStop={(_e, d) => {
                  updateElement(el.id, {
                    x: (d.x / CANVAS_W) * 100,
                    y: (d.y / CANVAS_H) * 100,
                  });
                }}
                onResizeStop={(_e, _dir, ref, _delta, pos) => {
                  updateElement(el.id, {
                    width: (parseInt(ref.style.width) / CANVAS_W) * 100,
                    height: (parseInt(ref.style.height) / CANVAS_H) * 100,
                    x: (pos.x / CANVAS_W) * 100,
                    y: (pos.y / CANVAS_H) * 100,
                  });
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedId(el.id);
                }}
                style={{ zIndex: zIndex + 10 }}
                className={cn(
                  "group",
                  selectedId === el.id && "ring-2 ring-blue-500 ring-offset-0"
                )}
                enableResizing={selectedId === el.id ? {
                  top: false, right: false, bottom: false, left: false,
                  topRight: true, bottomRight: true, bottomLeft: true, topLeft: true
                } : false}
                disableDragging={false}
                resizeHandleStyles={{
                  bottomRight: { cursor: 'nwse-resize', width: 12, height: 12, background: '#3b82f6', borderRadius: 3 },
                  bottomLeft: { cursor: 'nesw-resize', width: 12, height: 12, background: '#3b82f6', borderRadius: 3 },
                  topRight: { cursor: 'nesw-resize', width: 12, height: 12, background: '#3b82f6', borderRadius: 3 },
                  topLeft: { cursor: 'nwse-resize', width: 12, height: 12, background: '#3b82f6', borderRadius: 3 },
                }}
              >
                {el.type === 'text' ? (
                  <div className="w-full h-full relative">
                    <textarea
                      value={el.content}
                      onChange={e => {
                        updateElement(el.id, { content: e.target.value });
                      }}
                      className="w-full h-full outline-none overflow-hidden p-2 resize-none bg-transparent border-none cursor-text custom-scrollbar focus:ring-0 focus:outline-none"
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
                      placeholder="Escribe aquí..."
                    />
                    
                    {/* Manija de arrastre flotante */}
                    {selectedId === el.id && (
                      <div className="drag-handle absolute -top-8 left-0 bg-blue-600 hover:bg-blue-700 text-white h-7 px-2 rounded-lg cursor-move flex items-center justify-center gap-1 shadow-lg select-none pointer-events-auto z-50">
                        <Move size={12} />
                        <span className="text-[9px] font-black uppercase tracking-wider">Mover</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="drag-handle w-full h-full cursor-move">
                    <img
                      src={el.content}
                      alt="Elemento visual"
                      className="w-full h-full object-contain pointer-events-none select-none"
                      draggable={false}
                    />
                  </div>
                )}
              </Rnd>
            );
          })}
        </div>
      </div>

      {/* Input de archivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
