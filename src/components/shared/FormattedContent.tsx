'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface FormattedContentProps {
  content: string;
  className?: string;
}

/**
 * Convierte sintaxis Markdown y HTML a formato seguro y limpio con estilos garantizados.
 */
function parseSimpleMarkdown(text: string): string {
  if (!text) return '';

  let html = text;

  // Convertir encabezados Markdown (#, ##, ###)
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold my-1 text-slate-900">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold my-1.5 text-slate-900">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-extrabold my-2 text-slate-900">$1</h1>');

  // Convertir negritas Markdown (**texto** o __texto__)
  html = html.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Convertir cursivas Markdown (*texto* o _texto_)
  html = html.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Convertir tachado (~~texto~~)
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Convertir viñetas Markdown (- texto o • texto)
  html = html.replace(/^\s*[-•*]\s+(.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

  // Garantizar saltos de línea para todo texto
  html = html.replace(/\n/g, '<br />');

  return html;
}

export default function FormattedContent({ content, className }: FormattedContentProps) {
  if (!content) return null;

  const htmlContent = parseSimpleMarkdown(content);

  return (
    <div
      className={cn(
        'formatted-content text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-700',
        '[&_b]:font-bold [&_strong]:font-bold [&_b]:text-slate-900 [&_strong]:text-slate-900',
        '[&_i]:italic [&_em]:italic',
        '[&_u]:underline',
        '[&_h1]:text-lg [&_h1]:font-black [&_h1]:my-2 [&_h1]:text-slate-900',
        '[&_h2]:text-base [&_h2]:font-extrabold [&_h2]:my-1.5 [&_h2]:text-slate-900',
        '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:my-1 [&_h3]:text-slate-900',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1',
        '[&_li]:my-0.5',
        className
      )}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
