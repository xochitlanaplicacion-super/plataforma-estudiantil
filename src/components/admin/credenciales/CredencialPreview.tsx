'use client';

import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Loader2, FileImage, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface CredencialPreviewProps {
  config: {
    color_primario: string;
    color_secundario: string;
    color_texto_primario: string;
    color_texto_secundario: string;
    fuente_principal: string;
    fuente_secundaria: string;
  };
  alumno: {
    nombre: string;
    apellidos: string;
    nivel: string;
    carrera: string;
    matricula: string;
    foto_perfil: string | null;
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
        scale: 3, // High quality
        useCORS: true,
        backgroundColor: null,
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

  const safeNombre = alumno?.nombre || 'NOMBRE DEL ALUMNO';
  const safeApellidos = alumno?.apellidos || 'APELLIDOS';
  const safeMatricula = alumno?.matricula || '00000000';
  const safeNivel = alumno?.nivel || 'NIVEL ACADÉMICO';
  const safeCarrera = alumno?.carrera || 'PROGRAMA EDUCATIVO';

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Container proportional to standard ID Card (CR80) 1011x638 */}
      <div 
        className="relative w-full max-w-[600px] overflow-hidden rounded-xl shadow-2xl shrink-0"
        style={{ aspectRatio: '1011/638' }}
      >
        <div 
          ref={cardRef} 
          className="absolute inset-0 flex"
          style={{ 
            backgroundColor: config.color_primario,
            color: config.color_texto_primario,
            fontFamily: `"${config.fuente_principal}", sans-serif`
          }}
        >
          {/* Background Patterns (optional subtlety) */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, ${config.color_secundario} 2px, transparent 2px)`,
            backgroundSize: '24px 24px'
          }}></div>

          {/* Left Column - Logo */}
          <div className="w-1/3 h-full flex flex-col items-center justify-center p-6 relative z-10" style={{ backgroundColor: '#ffffff' }}>
            {institucion?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={institucion.logo_url} alt="Logo" className="w-full h-auto object-contain max-h-[80%]" crossOrigin="anonymous" />
            ) : (
              <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center text-gray-400">Logo</div>
            )}
            <div className="mt-4 text-center" style={{ color: config.color_primario }}>
              <p className="text-xs font-bold leading-tight" style={{ fontFamily: `"${config.fuente_secundaria}", sans-serif` }}>
                {institucion?.nombre_corto || 'INSTITUCIÓN'}
              </p>
            </div>
          </div>

          {/* Right Column - Data */}
          <div className="w-2/3 h-full flex flex-col relative z-10">
            {/* Header */}
            <div className="w-full text-center py-3 px-4 shadow-sm" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <h2 className="text-sm md:text-base font-bold uppercase tracking-wider" style={{ fontFamily: `"${config.fuente_secundaria}", sans-serif` }}>
                {institucion?.nombre_completo || 'NOMBRE DE LA UNIVERSIDAD'}
              </h2>
            </div>

            {/* Body */}
            <div className="flex-1 flex px-6 py-4 gap-4 items-center">
              <div className="flex-1 flex flex-col justify-center gap-3">
                <div>
                  <p className="text-[10px] uppercase opacity-80 mb-0.5" style={{ color: config.color_texto_secundario }}>Nombre</p>
                  <p className="font-bold text-sm md:text-lg leading-tight uppercase">{safeNombre}</p>
                  <p className="font-bold text-sm md:text-lg leading-tight uppercase">{safeApellidos}</p>
                </div>
                
                <div>
                  <p className="text-[10px] uppercase opacity-80 mb-0.5" style={{ color: config.color_texto_secundario }}>Programa Académico</p>
                  <p className="font-semibold text-xs md:text-sm uppercase leading-tight">{safeNivel}</p>
                  <p className="font-semibold text-xs md:text-sm uppercase leading-tight">{safeCarrera}</p>
                </div>
              </div>

              {/* Photo & ID */}
              <div className="w-28 md:w-36 flex flex-col items-center gap-3 shrink-0">
                <Avatar className="w-24 h-32 md:w-32 md:h-40 rounded-lg border-2 shadow-md bg-white" style={{ borderColor: config.color_secundario, borderRadius: '12px' }}>
                  {alumno?.foto_perfil ? (
                    <AvatarImage src={alumno.foto_perfil} className="object-cover rounded-[10px]" crossOrigin="anonymous" />
                  ) : (
                    <AvatarFallback className="text-2xl font-bold rounded-[10px] bg-gray-100 text-gray-500">
                      {getInitials(safeNombre, safeApellidos)}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="text-center w-full">
                  <p className="font-black text-xl md:text-2xl tracking-widest">{safeMatricula}</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="w-full text-center py-2 px-4 border-t-4" style={{ backgroundColor: config.color_secundario, borderColor: 'rgba(0,0,0,0.1)' }}>
              <p className="text-sm md:text-base font-black uppercase tracking-widest" style={{ color: config.color_primario }}>
                CREDENCIAL DE ESTUDIANTE
              </p>
            </div>
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
