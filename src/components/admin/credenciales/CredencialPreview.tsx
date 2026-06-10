'use client';

import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Loader2, FileImage, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// ============================================================
// Pattern generator functions (pure CSS patterns)
// ============================================================
function getPatternCSS(tipo: string, color: string, escala: number): React.CSSProperties {
  const s = escala;
  const c = color;
  switch (tipo) {
    case 'puntos':
      return { backgroundImage: `radial-gradient(circle, ${c} 1.5px, transparent 1.5px)`, backgroundSize: `${s}px ${s}px` };
    case 'rayas_diag':
      return { backgroundImage: `repeating-linear-gradient(45deg, ${c} 0, ${c} 1px, transparent 1px, transparent ${s}px)` };
    case 'rayas_horiz':
      return { backgroundImage: `repeating-linear-gradient(0deg, ${c} 0, ${c} 1px, transparent 1px, transparent ${s}px)` };
    case 'cuadricula':
      return { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: `${s}px ${s}px` };
    case 'rombos':
      return { backgroundImage: `linear-gradient(45deg, ${c} 25%, transparent 25%), linear-gradient(-45deg, ${c} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${c} 75%), linear-gradient(-45deg, transparent 75%, ${c} 75%)`, backgroundSize: `${s}px ${s}px` };
    case 'hexagonos':
      return { backgroundImage: `radial-gradient(circle farthest-side at 0% 50%, ${c} 23.5%, transparent 0) ${s/4}px 0, radial-gradient(circle farthest-side at 0% 50%, ${c} 24%, transparent 0) ${s*3/4}px ${s/2}px`, backgroundSize: `${s}px ${s}px` };
    case 'chevron':
      return { backgroundImage: `linear-gradient(135deg, ${c} 25%, transparent 25%) -${s/2}px 0, linear-gradient(225deg, ${c} 25%, transparent 25%) -${s/2}px 0, linear-gradient(315deg, ${c} 25%, transparent 25%), linear-gradient(45deg, ${c} 25%, transparent 25%)`, backgroundSize: `${s}px ${s}px` };
    case 'escamas':
      return { backgroundImage: `radial-gradient(circle at 50% 0%, transparent 70%, ${c} 70%, ${c} 72%, transparent 72%), radial-gradient(circle at 0% 50%, transparent 70%, ${c} 70%, ${c} 72%, transparent 72%)`, backgroundSize: `${s}px ${s}px` };
    case 'cruces':
      return { backgroundImage: `linear-gradient(${c} 2px, transparent 2px), linear-gradient(90deg, ${c} 2px, transparent 2px)`, backgroundSize: `${s}px ${s}px`, backgroundPosition: `center center` };
    case 'estrellas':
      return { backgroundImage: `radial-gradient(circle, ${c} 1px, transparent 1px), radial-gradient(circle, ${c} 1px, transparent 1px)`, backgroundSize: `${s}px ${s}px`, backgroundPosition: `0 0, ${s/2}px ${s/2}px` };
    case 'circulos_conc':
      return { backgroundImage: `radial-gradient(circle, transparent 40%, ${c} 40%, ${c} 43%, transparent 43%)`, backgroundSize: `${s}px ${s}px` };
    case 'ondas':
      return { backgroundImage: `radial-gradient(circle at 100% 50%, transparent 20%, ${c} 21%, ${c} 22%, transparent 23%, transparent 100%), radial-gradient(circle at 0% 50%, transparent 20%, ${c} 21%, ${c} 22%, transparent 23%, transparent 100%)`, backgroundSize: `${s}px ${s/2}px` };
    default:
      return {};
  }
}

// ============================================================
// Panel left SVG path definitions (viewBox="0 0 100 100" preserveAspectRatio="none")
// ============================================================
function getPanelSvgPath(diseno: string): string {
  switch (diseno) {
    case 'ondas':
      // Smooth 'S' wave
      return 'M0,0 L85,0 C115,30 65,70 85,100 L0,100 Z';
    case 'diagonal':
      return 'M0,0 L100,0 L80,100 L0,100 Z';
    case 'arco':
      return 'M0,0 L70,0 Q130,50 70,100 L0,100 Z';
    case 'doble_onda':
      return 'M0,0 L85,0 Q105,25 85,50 Q65,75 85,100 L0,100 Z';
    case 'geometrico':
      return 'M0,0 L100,0 L80,25 L100,50 L80,75 L100,100 L0,100 Z';
    default: // 'plano'
      return 'M0,0 L100,0 L100,100 L0,100 Z';
  }
}

interface CredencialPreviewProps {
  config: {
    color_primario: string;
    color_secundario: string;
    color_texto_primario: string;
    color_texto_secundario: string;
    fuente_principal: string;
    fuente_secundaria: string;
    trama_tipo?: string;
    trama_imagen_url?: string | null;
    trama_escala?: number;
    trama_rotacion?: number;
    trama_opacidad?: number;
    logo_x?: number;
    logo_y?: number;
    panel_diseno?: string;
  };
  alumno: {
    nombre: string;
    apellidos: string;
    nivel: string;
    carrera: string;
    matricula: string;
    foto_perfil: string | null;
    fecha_inicio?: string | null;
    fecha_expiracion?: string | null;
  } | null;
  institucion: {
    logo_url?: string;
    nombre_completo?: string;
    nombre_corto?: string;
  };
  showDownloadOptions?: boolean;
}

export function CredencialPreview({ config, alumno, institucion, showDownloadOptions = false }: CredencialPreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Dynamic font injection
  useEffect(() => {
    const fonts = [config.fuente_principal, config.fuente_secundaria].filter(Boolean);
    const uniqueFonts = Array.from(new Set(fonts));
    
    uniqueFonts.forEach(font => {
      const fontId = `font-${font.replace(/\s+/g, '-')}`;
      if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:wght@400;600;700&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, [config.fuente_principal, config.fuente_secundaria]);

  const handleDownload = async (format: 'png' | 'pdf') => {
    if (!cardRef.current) return;

    try {
      if (format === 'png') setIsDownloadingPng(true);
      else setIsDownloadingPdf(true);

      const canvas = await html2canvas(cardRef.current, {
        scale: 4, // High quality for PVC printers
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      if (format === 'png') {
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `credencial_${alumno?.matricula || 'demo'}.png`;
        link.href = url;
        link.click();
      } else {
        // PDF CR80 size (85.6mm x 54mm) landscape
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: [85.6, 54]
        });
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, 85.6, 54);
        pdf.save(`credencial_${alumno?.matricula || 'demo'}.pdf`);
      }
    } catch (error) {
      console.error('Error generating credential:', error);
    } finally {
      setIsDownloadingPng(false);
      setIsDownloadingPdf(false);
    }
  };

  const getInitials = (n: string, a: string) => {
    return `${n?.charAt(0) || ''}${a?.charAt(0) || ''}`.toUpperCase() || 'AL';
  };

  const safeNombre = alumno?.nombre || '';
  const safeApellidos = alumno?.apellidos || '';
  const safeMatricula = alumno?.matricula || '';
  const safeNivel = alumno?.nivel || '';
  const safeCarrera = alumno?.carrera || '';

  // Trama config with defaults
  const tramaTipo = config.trama_tipo || 'ninguno';
  const tramaEscala = config.trama_escala ?? 50;
  const tramaRotacion = config.trama_rotacion ?? 0;
  const tramaOpacidad = (config.trama_opacidad ?? 10) / 100;
  const tramaImagenUrl = config.trama_imagen_url || null;
  const logoX = config.logo_x ?? 0;
  const logoY = config.logo_y ?? 0;
  const panelDiseno = config.panel_diseno || 'plano';
  const panelSvgPath = getPanelSvgPath(panelDiseno);

  // Build pattern layer style
  const isImagePattern = tramaTipo === 'imagen' && tramaImagenUrl;
  const patternStyle: React.CSSProperties = isImagePattern
    ? {
        backgroundImage: `url(${tramaImagenUrl})`,
        backgroundSize: `${tramaEscala}px ${tramaEscala}px`,
        backgroundRepeat: 'repeat',
        filter: 'brightness(0) invert(1)',
      }
    : tramaTipo !== 'ninguno'
      ? getPatternCSS(tramaTipo, 'rgba(255,255,255,1)', tramaEscala)
      : {};

  const showPattern = tramaTipo !== 'ninguno';

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Container proportional to standard ID Card (CR80) 1011x638 */}
      <div 
        ref={cardRef} 
        className="relative w-full max-w-[600px] overflow-hidden rounded-xl shadow-2xl shrink-0 flex"
        style={{ 
          aspectRatio: '1011/638',
          backgroundColor: config.color_primario,
          color: config.color_texto_primario,
          fontFamily: `"${config.fuente_principal}", sans-serif`
        }}
      >
          {/* Background Pattern Layer — Oversized + Rotated to fill corners */}
          {showPattern && (
            <div 
              className="absolute pointer-events-none" 
              style={{
                width: '200%',
                height: '200%',
                top: '-50%',
                left: '-50%',
                opacity: tramaOpacidad,
                transform: `rotate(${tramaRotacion}deg)`,
                ...patternStyle,
                zIndex: 1,
              }}
            />
          )}

          {/* Left Column Background Shape (SVG) */}
          <div className="absolute top-0 left-0 w-[40%] h-full z-10 pointer-events-none">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={panelSvgPath} fill="#ffffff" />
            </svg>
          </div>

          {/* Left Column - Logo Container */}
          <div className="w-1/3 h-full flex flex-col items-center justify-center p-4 relative z-20">
            <div 
              className="w-full h-full flex items-center justify-center"
              style={{ 
                transform: `translate(${logoX}px, ${logoY}px)`,
              }}
            >
              {institucion?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={institucion.logo_url} alt="Logo" className="w-full h-auto object-contain max-h-[85%]" crossOrigin="anonymous" />
              ) : (
                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 text-xs">Logo</div>
              )}
            </div>
          </div>

          {/* Right Column - Data */}
          <div className="w-2/3 h-full flex flex-col relative z-10">
            {/* Header */}
            <div className="w-full text-center py-2 px-4 shadow-sm min-h-[40px] flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <h2 className="text-xs md:text-sm font-bold uppercase tracking-wider leading-tight" style={{ fontFamily: `"${config.fuente_secundaria}", sans-serif` }}>
                {institucion?.nombre_completo || ''}
              </h2>
            </div>

            {/* Body */}
            <div className="flex-1 flex px-4 md:px-6 py-2 md:py-3 gap-2 md:gap-4 items-center min-h-0 overflow-hidden">
              <div className="flex-1 flex flex-col justify-center gap-1.5 md:gap-3">
                <div>
                  <p className="text-[10px] md:text-[11px] uppercase opacity-90 mb-0.5" style={{ color: config.color_texto_secundario }}>Nombre</p>
                  <p className="font-black text-sm md:text-lg leading-none uppercase">{safeNombre}</p>
                  <p className="font-black text-sm md:text-lg leading-none uppercase mt-0.5">{safeApellidos}</p>
                </div>
                
                <div>
                  <p className="text-[10px] md:text-[11px] uppercase opacity-90 mb-0.5" style={{ color: config.color_texto_secundario }}>Programa Académico</p>
                  <p className="font-bold text-xs md:text-sm uppercase leading-tight">{safeNivel}</p>
                  <p className="font-bold text-xs md:text-sm uppercase leading-tight mt-0.5">{safeCarrera}</p>
                </div>

                <div className="flex gap-4 md:gap-6 mt-1">
                  <div>
                    <p className="text-[9px] md:text-[10px] uppercase opacity-90 mb-0.5" style={{ color: config.color_texto_secundario }}>Fecha Ingreso</p>
                    <p className="font-bold text-[11px] md:text-xs uppercase">{alumno?.fecha_inicio ? new Date(alumno.fecha_inicio).toLocaleDateString() : ''}</p>
                  </div>
                  <div>
                    <p className="text-[9px] md:text-[10px] uppercase opacity-90 mb-0.5" style={{ color: config.color_texto_secundario }}>Vigencia</p>
                    <p className="font-bold text-[11px] md:text-xs uppercase">{alumno?.fecha_expiracion ? new Date(alumno.fecha_expiracion).toLocaleDateString() : ''}</p>
                  </div>
                </div>
              </div>

              {/* Photo & ID */}
              <div className="w-28 md:w-36 flex flex-col items-center gap-2 shrink-0">
                <Avatar className="w-24 h-32 md:w-32 md:h-40 rounded-lg border-2 shadow-md bg-white" style={{ borderColor: config.color_secundario, borderRadius: '12px' }}>
                  {alumno?.foto_perfil ? (
                    <AvatarImage src={alumno.foto_perfil} className="object-cover rounded-[10px]" crossOrigin="anonymous" />
                  ) : (
                    <AvatarFallback className="text-3xl font-bold rounded-[10px] bg-gray-100 text-gray-500">
                      {getInitials(safeNombre, safeApellidos)}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="text-center w-full px-1">
                  <p className="text-[9px] md:text-[10px] uppercase opacity-90 mb-0.5" style={{ color: config.color_texto_secundario }}>Matrícula:</p>
                  <p 
                    className="font-black tracking-wide text-center whitespace-nowrap" 
                    style={{ 
                      fontSize: safeMatricula.length > 15 ? 'clamp(8px, 1.5vw, 11px)' : 'clamp(11px, 2vw, 14px)'
                    }}
                  >
                    {safeMatricula}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="w-full text-center py-1.5 px-4 border-t-4 shrink-0" style={{ backgroundColor: config.color_secundario, borderColor: 'rgba(0,0,0,0.1)' }}>
              <p className="text-xs md:text-sm font-black uppercase tracking-widest" style={{ color: config.color_primario }}>
                CREDENCIAL DE ESTUDIANTE
              </p>
            </div>
          </div>
      </div>

      {showDownloadOptions && alumno && (
        <div className="flex gap-4 mt-2">
          <Button 
            onClick={() => handleDownload('png')} 
            disabled={isDownloadingPng || isDownloadingPdf}
            className="w-40"
          >
            {isDownloadingPng ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileImage className="h-4 w-4 mr-2" />}
            Descargar PNG
          </Button>
          <Button 
            onClick={() => handleDownload('pdf')} 
            variant="secondary"
            disabled={isDownloadingPng || isDownloadingPdf}
            className="w-40"
          >
            {isDownloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  );
}
