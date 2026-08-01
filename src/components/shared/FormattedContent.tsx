'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface FormattedContentProps {
  content: string;
  className?: string;
}

/**
 * Detecta si el contenido ya tiene formato HTML y lo renderiza directamente.
 * Si es texto plano con marcas Markdown, las convierte a HTML.
 */
function processContent(text: string): string {
  if (!text) return '';

  // Si el contenido ya tiene etiquetas HTML de formato, renderizarlo directamente
  const hasHtml = /<(b|strong|i|em|u|h[1-6]|ul|ol|li|div|p|br)[^>]*>/i.test(text);
  
  if (hasHtml) {
    // Ya es HTML — solo limpiar saltos de línea redundantes fuera de tags
    return text;
  }

  // Es texto plano — convertir Markdown simple a HTML
  let html = text
    .replace(/&(?!#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Encabezados Markdown
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Negrita (**texto** o __texto__)
  html = html.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Cursiva (*texto* o _texto_)
  html = html.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Tachado (~~texto~~)
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Viñetas Markdown
  html = html.replace(/^\s*[-•]\s+(.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

  // Saltos de línea
  html = html.replace(/\n/g, '<br />');

  return html;
}

export default function FormattedContent({ content, className }: FormattedContentProps) {
  if (!content) return null;

  const htmlContent = processContent(content);

  return (
    <div
      className={cn(
        'formatted-content text-sm leading-relaxed break-words',
        '[&_b]:font-bold [&_strong]:font-bold [&_b]:text-slate-900 [&_strong]:text-slate-900',
        '[&_i]:italic [&_em]:italic',
        '[&_u]:underline',
        '[&_h1]:text-lg [&_h1]:font-black [&_h1]:my-2 [&_h1]:text-slate-900',
        '[&_h2]:text-base [&_h2]:font-extrabold [&_h2]:my-1.5 [&_h2]:text-slate-900',
        '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:my-1 [&_h3]:text-slate-900',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1',
        '[&_li]:my-0.5 [&_li]:list-disc [&_li]:ml-4',
        '[&_div]:min-h-[1em]',
        className
      )}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
