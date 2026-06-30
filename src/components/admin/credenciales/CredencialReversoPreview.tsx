'use client';

import React from 'react';

interface CredencialReversoPreviewProps {
  config: {
    color_primario: string;
    color_secundario: string;
    color_texto_primario: string;
    color_texto_secundario: string;
    fuente_principal: string;
    fuente_secundaria: string;
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
  } | null;
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

export function CredencialReversoPreview({ config, alumno, institucion }: CredencialReversoPreviewProps) {
  const safeNivel = alumno?.nivel || '';
  const safeCarrera = alumno?.carrera || '';
  const isBachPrepa = safeNivel.toLowerCase().includes('bachillerato') || safeNivel.toLowerCase().includes('preparatoria');

  // If there's a full reverso image uploaded, show it filling the entire card
  if (config.reverso_imagen_url) {
    return (
      <div
        className="relative w-full max-w-[600px] overflow-hidden rounded-xl shadow-2xl shrink-0"
        style={{ aspectRatio: '1011/638' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.reverso_imagen_url}
          alt="Reverso de credencial"
          className="w-full h-full object-fill"
          crossOrigin="anonymous"
        />
      </div>
    );
  }

  // Digital reverso design
  const textoLegal = config.reverso_texto_legal || 'Esta credencial es propiedad de la institución y debe ser devuelta al término de la vigencia. El uso indebido será sancionado conforme al reglamento interno.';

  return (
    <div
      className="relative w-full max-w-[600px] overflow-hidden rounded-xl shadow-2xl shrink-0 flex flex-col"
      style={{
        aspectRatio: '1011/638',
        backgroundColor: config.color_secundario,
        color: config.color_primario,
        fontFamily: `"${config.fuente_principal}", sans-serif`,
      }}
    >
      {/* Header bar */}
      <div
        className="w-full text-center py-2 px-4 shrink-0"
        style={{ backgroundColor: config.color_primario }}
      >
        <p
          className="text-[10px] md:text-xs font-black uppercase tracking-widest"
          style={{
            color: config.color_texto_primario,
            fontFamily: `"${config.fuente_secundaria}", sans-serif`,
          }}
        >
          {institucion?.nombre_completo || 'NOMBRE DE LA INSTITUCIÓN'}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-between px-6 py-3 min-h-0 overflow-hidden">
        {/* Program info */}
        <div className="text-center w-full">
          <p className="text-[9px] md:text-[10px] uppercase opacity-70 tracking-wider mb-0.5">
            Programa Académico
          </p>
          <p className="font-bold text-xs md:text-sm uppercase leading-tight">
            {safeNivel}
          </p>
          {!isBachPrepa && safeCarrera && (
            <p className="font-bold text-xs md:text-sm uppercase leading-tight">
              {safeCarrera}
            </p>
          )}
        </div>

        {/* Firma & Sello row */}
        <div className="flex items-end justify-center gap-6 md:gap-10 w-full my-2">
          {/* Firma */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-20 h-12 md:w-28 md:h-16 flex items-end justify-center">
              {config.firma_director_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.firma_director_url}
                  alt="Firma"
                  className="max-w-full max-h-full object-contain"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="w-full border-b-2 border-current opacity-30" />
              )}
            </div>
            <p className="text-[8px] md:text-[9px] uppercase tracking-wider opacity-60 font-semibold">
              Firma del Director
            </p>
          </div>

          {/* Sello */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 md:w-18 md:h-18 flex items-center justify-center">
              {config.sello_institucion_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.sello_institucion_url}
                  alt="Sello"
                  className="max-w-full max-h-full object-contain opacity-80"
                  crossOrigin="anonymous"
                />
              ) : (
                <div
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-dashed flex items-center justify-center opacity-30"
                  style={{ borderColor: config.color_primario }}
                >
                  <span className="text-[7px] uppercase font-bold">Sello</span>
                </div>
              )}
            </div>
            <p className="text-[8px] md:text-[9px] uppercase tracking-wider opacity-60 font-semibold">
              Sello Oficial
            </p>
          </div>
        </div>

        {/* Legal text */}
        <div className="text-center w-full px-2">
          <p className="text-[7px] md:text-[8px] leading-tight opacity-50 italic">
            {textoLegal}
          </p>
        </div>
      </div>

      {/* Footer with contact info */}
      <div
        className="w-full text-center py-1.5 px-4 border-t shrink-0"
        style={{
          backgroundColor: config.color_primario,
          borderColor: 'rgba(0,0,0,0.1)',
        }}
      >
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {institucion?.telefono_contacto && (
            <span
              className="text-[8px] md:text-[9px] uppercase tracking-wide"
              style={{ color: config.color_texto_primario }}
            >
              Tel: {institucion.telefono_contacto}
            </span>
          )}
          {institucion?.correo_contacto && (
            <span
              className="text-[8px] md:text-[9px] uppercase tracking-wide"
              style={{ color: config.color_texto_primario }}
            >
              {institucion.correo_contacto}
            </span>
          )}
          {institucion?.sitio_web && (
            <span
              className="text-[8px] md:text-[9px] uppercase tracking-wide"
              style={{ color: config.color_texto_primario }}
            >
              {institucion.sitio_web}
            </span>
          )}
        </div>
        {institucion?.direccion && (
          <p
            className="text-[7px] md:text-[8px] uppercase tracking-wide mt-0.5 opacity-80"
            style={{ color: config.color_texto_primario }}
          >
            {institucion.direccion}
          </p>
        )}
      </div>
    </div>
  );
}
