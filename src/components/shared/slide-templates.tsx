import React from 'react';
import { CanvaEstrellasBackground } from './CanvaEstrellasBackground';

// Interfaz para la definición de cada plantilla
export interface SlideTemplate {
  id: string;
  name: string;
  /** Color de texto recomendado para el título */
  titleColor: string;
  /** Color de texto recomendado para el contenido */
  contentColor: string;
  /** Sugerencia de fuente Google Fonts para IA */
  fontFamily: string;
  /** URL del thumbnail SVG para la previsualización */
  previewSrc: string;
  component: React.FC<{ children?: React.ReactNode; className?: string }>;
}

// ─── Plantilla 1: Clásica Azul ────────────────────────────────────────────────
const ClassicAzul: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`w-full h-full bg-blue-900 text-white overflow-hidden relative ${className}`}>
    {children}
  </div>
);

// ─── Plantilla 2: Canva Estrellas Burbujas ────────────────────────────────────
const CanvaEstrellas: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`w-full h-full bg-[#bad1e2] relative overflow-hidden ${className}`}>
    <CanvaEstrellasBackground />
    <div className="absolute inset-0 z-10 text-[#1e293b]">
      {children}
    </div>
  </div>
);


// ─── Plantilla 3: Blue Modern Abstract ────────────────────────────────────────
const BlueModern: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`w-full h-full bg-white relative overflow-hidden ${className}`}>
    <img
      src="/slide-templates/blue-modern.svg"
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      aria-hidden="true"
    />
    <div className="absolute inset-0 z-10 text-[#1e3a5f]">
      {children}
    </div>
  </div>
);

// ─── Plantilla 4: Acuarela Multicolor ─────────────────────────────────────────
const AcuarelaMulticolor: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`w-full h-full bg-white relative overflow-hidden ${className}`}>
    <img
      src="/slide-templates/acuarela-multicolor.svg"
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
      aria-hidden="true"
    />
    <div className="absolute inset-0 z-10 text-[#1a1a2e]">
      {children}
    </div>
  </div>
);

// ─── Plantilla 5: Lluvia de Ideas Doodle ──────────────────────────────────────
const LluviaIdeas: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`w-full h-full bg-[#f5e6d3] relative overflow-hidden ${className}`}>
    <img
      src="/slide-templates/lluvia-ideas.svg"
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
      aria-hidden="true"
    />
    <div className="absolute inset-0 z-10 text-[#1a1a1a]">
      {children}
    </div>
  </div>
);

// ─── Plantilla 6: Purple Watercolor ───────────────────────────────────────────
const PurpleWatercolor: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`w-full h-full bg-white relative overflow-hidden ${className}`}>
    <img
      src="/slide-templates/purple-watercolor.svg"
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
      aria-hidden="true"
    />
    <div className="absolute inset-0 z-10 text-[#2d1b69]">
      {children}
    </div>
  </div>
);

// ─── Plantilla 7: Purple Business ─────────────────────────────────────────────
const PurpleBusiness: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`w-full h-full bg-white relative overflow-hidden ${className}`}>
    <img
      src="/slide-templates/purple-business.svg"
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
      aria-hidden="true"
    />
    <div className="absolute inset-0 z-10 text-[#1a0533]">
      {children}
    </div>
  </div>
);

// ─── Registro Principal de Plantillas ─────────────────────────────────────────
export const SLIDE_TEMPLATES: Record<string, SlideTemplate> = {
  azul: {
    id: 'azul',
    name: 'Clásica Azul',
    titleColor: '#ffffff',
    contentColor: '#e0e7ff',
    fontFamily: 'Roboto',
    previewSrc: '',
    component: ClassicAzul,
  },
  canva_estrellas_1: {
    id: 'canva_estrellas_1',
    name: 'Estrellas Burbujas',
    titleColor: '#1e293b',
    contentColor: '#334155',
    fontFamily: 'Nunito',
    previewSrc: '',
    component: CanvaEstrellas,
  },
  blue_modern: {
    id: 'blue_modern',
    name: 'Blue Modern',
    titleColor: '#1e3a5f',
    contentColor: '#1e40af',
    fontFamily: 'Poppins',
    previewSrc: '/slide-templates/blue-modern.svg',
    component: BlueModern,
  },
  acuarela_multicolor: {
    id: 'acuarela_multicolor',
    name: 'Acuarela Infantil',
    titleColor: '#1a1a2e',
    contentColor: '#16213e',
    fontFamily: 'Patrick Hand',
    previewSrc: '/slide-templates/acuarela-multicolor.svg',
    component: AcuarelaMulticolor,
  },
  lluvia_ideas: {
    id: 'lluvia_ideas',
    name: 'Lluvia de Ideas',
    titleColor: '#1a1a1a',
    contentColor: '#2d2d2d',
    fontFamily: 'Caveat',
    previewSrc: '/slide-templates/lluvia-ideas.svg',
    component: LluviaIdeas,
  },
  purple_watercolor: {
    id: 'purple_watercolor',
    name: 'Purple Watercolor',
    titleColor: '#2d1b69',
    contentColor: '#4c1d95',
    fontFamily: 'Comfortaa',
    previewSrc: '/slide-templates/purple-watercolor.svg',
    component: PurpleWatercolor,
  },
  purple_business: {
    id: 'purple_business',
    name: 'Business Purple',
    titleColor: '#1a0533',
    contentColor: '#3b0764',
    fontFamily: 'Inter',
    previewSrc: '/slide-templates/purple-business.svg',
    component: PurpleBusiness,
  },
};

// ─── Componente Helper para Renderizar una plantilla por su ID ─────────────────
export const SlideRenderer: React.FC<{
  templateId: string;
  children?: React.ReactNode;
  className?: string;
  fallback?: string;
}> = ({ templateId, children, className = '', fallback = 'azul' }) => {
  const Template = SLIDE_TEMPLATES[templateId]?.component || SLIDE_TEMPLATES[fallback]?.component || ClassicAzul;

  return <Template className={className}>{children}</Template>;
};
