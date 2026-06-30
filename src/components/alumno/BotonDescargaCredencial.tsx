'use client';

import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { CredencialPreview } from '@/components/admin/credenciales/CredencialPreview';
import { CredencialReversoPreview } from '@/components/admin/credenciales/CredencialReversoPreview';

interface BotonDescargaCredencialProps {
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
    reverso_imagen_url?: string | null;
    firma_director_url?: string | null;
    sello_institucion_url?: string | null;
    reverso_texto_legal?: string | null;
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
  };
  institucion: {
    logo_url?: string;
    nombre_completo?: string;
    nombre_corto?: string;
    direccion?: string;
    telefono_contacto?: string;
    correo_contacto?: string;
    sitio_web?: string;
  };
}

export function BotonDescargaCredencial({ config, alumno, institucion }: BotonDescargaCredencialProps) {
  const frenteRef = useRef<HTMLDivElement>(null);
  const reversoRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!frenteRef.current || !reversoRef.current) return;
    setIsDownloading(true);

    try {
      // Capture both sides at high resolution
      const [frenteCanvas, reversoCanvas] = await Promise.all([
        html2canvas(frenteRef.current, {
          scale: 4,
          useCORS: true,
          backgroundColor: null,
          logging: false,
        }),
        html2canvas(reversoRef.current, {
          scale: 4,
          useCORS: true,
          backgroundColor: null,
          logging: false,
        }),
      ]);

      // Letter size in mm: 215.9 x 279.4
      const pageW = 215.9;
      const pageH = 279.4;

      // Card dimensions in mm (8.56cm x 5.4cm)
      const cardW = 85.6;
      const cardH = 54;

      // Two cards side by side = 171.2mm wide, centered on the page
      const totalW = cardW * 2;
      const startX = (pageW - totalW) / 2;
      const startY = (pageH - cardH) / 2;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter',
      });

      const frenteImg = frenteCanvas.toDataURL('image/png');
      const reversoImg = reversoCanvas.toDataURL('image/png');

      // Draw front on the left
      pdf.addImage(frenteImg, 'PNG', startX, startY, cardW, cardH);
      // Draw reverse on the right (mirrored reading direction for fold)
      pdf.addImage(reversoImg, 'PNG', startX + cardW, startY, cardW, cardH);

      // Draw dotted fold line between the two cards
      const foldX = startX + cardW;
      const lineExtension = 12; // mm above and below the cards for the dotted line extension

      pdf.setDrawColor(120, 120, 120);
      pdf.setLineDashPattern([2, 2], 0);
      pdf.setLineWidth(0.3);

      // Dotted line from above the cards to below the cards
      pdf.line(foldX, startY - lineExtension, foldX, startY + cardH + lineExtension);

      // "Doble aquí" text above the cards (outside the design area)
      pdf.setFontSize(7);
      pdf.setTextColor(120, 120, 120);
      pdf.text('Doble aquí', foldX, startY - lineExtension - 2, { align: 'center' });

      // "Doble aquí" text below the cards (outside the design area)
      pdf.text('Doble aquí', foldX, startY + cardH + lineExtension + 4, { align: 'center' });

      // Optional: thin border around each card for cutting guide
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineDashPattern([1, 1], 0);
      pdf.setLineWidth(0.15);
      // Front border
      pdf.rect(startX, startY, cardW, cardH);
      // Back border
      pdf.rect(startX + cardW, startY, cardW, cardH);

      pdf.save(`credencial_${alumno.matricula}.pdf`);
    } catch (error) {
      console.error('Error generating credential PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleDownload}
        disabled={isDownloading}
        className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 gap-2"
        size="lg"
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Generando credencial...
          </>
        ) : (
          <>
            <Download className="h-5 w-5" />
            Descargar Mi Credencial
          </>
        )}
      </Button>

      {/* Hidden render targets for html2canvas — must be in the DOM but off-screen */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={frenteRef}>
          <CredencialPreview
            config={config}
            alumno={alumno}
            institucion={institucion}
            showDownloadOptions={false}
          />
        </div>
        <div ref={reversoRef}>
          <CredencialReversoPreview
            config={config}
            alumno={alumno}
            institucion={institucion}
          />
        </div>
      </div>
    </>
  );
}
