import React from 'react';

/**
 * Fondo del template "Canva - Estrellas Burbujas"
 * Se usa como <img> para evitar conflictos de atributos SVG en JSX.
 */
export const CanvaEstrellasBackground: React.FC = () => (
  <img
    src="/slide-templates/estrellas-burbujas.svg"
    alt=""
    aria-hidden="true"
    className="absolute inset-0 w-full h-full object-cover"
  />
);
